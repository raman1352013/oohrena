import { Router } from "express";
import { z } from "zod";
import { KYC_STATUSES, KYC_TRANSITIONS, REQUIRED_KYC_DOCS, kycDecisionInput, type KycStatus } from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { AppError, notFound } from "../lib/errors.js";
import { withTransaction } from "../lib/tx.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { User, Vendor } from "../models/foundation.js";
import { Inventory } from "../models/inventory.js";
import { VendorDocument } from "../models/vendor-kyc.js";
import { kycDocsFor, maskPan, maskedBank } from "./vendors.js";

const listQuery = z.object({
  kycStatus: z.enum(KYC_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NEXT: Record<"approve" | "reject" | "suspend" | "reinstate", KycStatus> = { approve: "approved", reject: "rejected", suspend: "suspended", reinstate: "approved" };

/** Module 3: vendor KYC review. */
export function adminVendorRoutes() {
  const r = Router();
  r.use(requirePermission("vendors.kyc.decide"));

  r.get("/", async (req, res) => {
    const q = parseQuery(listQuery, req);
    const filter: Record<string, unknown> = {};
    if (q.kycStatus) filter.kycStatus = q.kycStatus;
    if (q.q) filter.$or = [{ legalName: new RegExp(escapeRe(q.q), "i") }, { _id: q.q.toUpperCase() }, { city: new RegExp(escapeRe(q.q), "i") }];
    const [items, total] = await Promise.all([
      Vendor.find(filter).sort({ kycStatus: 1, createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      Vendor.countDocuments(filter),
    ]);
    const ids = items.map((v) => v._id);
    const [docCounts, invCounts, users] = await Promise.all([
      VendorDocument.aggregate<{ _id: string; n: number; types: string[] }>([{ $match: { vendorId: { $in: ids } } }, { $group: { _id: "$vendorId", n: { $sum: 1 }, types: { $addToSet: "$type" } } }]),
      Inventory.aggregate<{ _id: string; n: number }>([{ $match: { vendorId: { $in: ids } } }, { $group: { _id: "$vendorId", n: { $sum: 1 } } }]),
      User.find({ _id: { $in: items.map((v) => v.userId) } }).select("_id fullName email mobile").lean(),
    ]);
    res.json({
      data: {
        items: items.map((v) => {
          const d = docCounts.find((x) => x._id === v._id);
          const u = users.find((x) => x._id === v.userId);
          return {
            vendorId: v._id, legalName: v.legalName, city: v.city, pan: maskPan(v.pan), gstin: v.gstin, kycStatus: v.kycStatus, kycReason: v.kycReason,
            contactName: u?.fullName ?? null, documentCount: d?.n ?? 0,
            missingDocuments: REQUIRED_KYC_DOCS.filter((t) => !d?.types.includes(t)),
            listingCount: invCounts.find((x) => x._id === v._id)?.n ?? 0, createdAt: v.createdAt, approvedAt: v.approvedAt,
          };
        }),
        total, page: q.page, pageSize: q.pageSize,
      },
    });
  });

  r.get("/:id", async (req, res) => {
    const v = await Vendor.findById(String(req.params.id)).lean();
    if (!v) throw notFound("Vendor not found");
    const u = await User.findById(v.userId).select("_id fullName email mobile").lean();
    await audit(req, { action: "vendor.kyc.view", entity: "vendor", entityId: v._id });
    res.json({
      data: {
        vendorId: v._id, legalName: v.legalName, city: v.city, pan: v.pan, gstin: v.gstin, kycStatus: v.kycStatus, kycReason: v.kycReason,
        approvedBy: v.approvedBy, approvedAt: v.approvedAt, createdAt: v.createdAt,
        contact: u ? { name: u.fullName, email: u.email, mobile: u.mobile } : null,
        documents: await kycDocsFor(v._id),
        // Admin sees masked bank details only; Finance/Audit handles payouts.
        bank: await maskedBank(v._id),
      },
    });
  });

  /** Approve / reject / suspend / reinstate with reason. Approval requires the mandatory documents. */
  r.post("/:id/kyc-decision", validateBody(kycDecisionInput), async (req, res) => {
    const { decision, reason } = req.body as z.infer<typeof kycDecisionInput>;
    const out = await withTransaction(async (session) => {
      const v = await Vendor.findById(String(req.params.id)).session(session).lean();
      if (!v) throw notFound("Vendor not found");
      const to = NEXT[decision];
      const from = v.kycStatus as KycStatus;
      if (!KYC_TRANSITIONS[from].includes(to)) throw new AppError(409, "INVALID_TRANSITION", `Can't ${decision} a vendor whose KYC is ${from}`);
      if (to === "approved" && from === "pending") {
        const types = (await VendorDocument.find({ vendorId: v._id }).session(session).lean()).map((d) => d.type);
        const missing = REQUIRED_KYC_DOCS.filter((t) => !types.includes(t));
        if (missing.length) throw new AppError(409, "CONFLICT", `Can't approve: missing required documents (${missing.join(", ")})`);
      }
      const now = new Date();
      const set: Record<string, unknown> = { kycStatus: to, kycReason: reason ?? null };
      if (to === "approved") { set.approvedBy = req.user!.userId; set.approvedAt = now; }
      await Vendor.updateOne({ _id: v._id, kycStatus: from }, { $set: set }, { session });
      if (to === "approved") await VendorDocument.updateMany({ vendorId: v._id, status: "uploaded" }, { $set: { status: "verified", verifiedBy: req.user!.userId, verifiedAt: now } }, { session });
      // A suspended vendor's live listings stop being visible immediately.
      if (to === "suspended") await Inventory.updateMany({ vendorId: v._id, status: "approved" }, { $set: { status: "suspended", statusReason: "Vendor suspended" } }, { session });
      await audit(req, { action: `vendor.kyc.${decision}`, entity: "vendor", entityId: v._id, before: { kycStatus: from }, after: { kycStatus: to }, reason: reason ?? null }, session);
      return { vendorId: v._id, kycStatus: to, kycReason: reason ?? null };
    });
    res.json({ data: out });
  });

  return r;
}
