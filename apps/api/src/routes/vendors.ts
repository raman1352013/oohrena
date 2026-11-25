import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { DOC_MIME, KYC_DOC_TYPES, MAX_DOC_BYTES, REQUIRED_KYC_DOCS, inviteVendorStaffInput, registerVendorInput, updateVendorStaffInput, vendorBankInput, type RegisterVendorInput } from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { encryptString } from "../lib/crypto.js";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { saveUpload } from "../lib/storage.js";
import { withTransaction } from "../lib/tx.js";
import { newReferralCode, resolveReferredBy } from "../lib/referral-code.js";
import { requirePermission, requireVendorRole } from "../middleware/auth.js";
import { currentVendor, upload } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { Consent, User, Vendor, VendorUser } from "../models/foundation.js";
import { AuditLog } from "../models/audit-log.js";
import { VendorBank, VendorDocument } from "../models/vendor-kyc.js";
import { hashPassword, revokeAllSessions, startSession, toSessionUser } from "../services/session.js";
import { consentDocs } from "./auth.js";
import { vendorInventoryRoutes } from "./vendor-inventory.js";
import { vendorWorkOrderRoutes } from "./deals.js";
import { slotView } from "./execution.js";
import { ownPayables } from "./finance.js";
import { overdueSlots } from "../services/execution.js";

export const maskPan = (pan: string | null | undefined) => (pan ? `${pan.slice(0, 2)}XXXXX${pan.slice(-3)}` : null);
export const maskAccount = (last4: string) => `XXXXXX${last4}`;

export async function kycDocsFor(vendorId: string) {
  const docs = await VendorDocument.find({ vendorId }).sort({ uploadedAt: -1 }).lean();
  return docs.map((d) => ({ docId: String(d._id), type: d.type, fileId: d.fileId, status: d.status, uploadedAt: d.uploadedAt, verifiedAt: d.verifiedAt }));
}

export async function maskedBank(vendorId: string) {
  const b = await VendorBank.findOne({ vendorId }).lean();
  return b ? { accountName: b.accountName, accountNo: maskAccount(b.accountLast4), ifsc: b.ifsc, bankName: b.bankName, verified: !!b.verifiedAt, updatedAt: b.updatedAt } : null;
}

/** Module 2: vendor onboarding, KYC and bank details. Every route is scoped to the signed-in vendor. */
export function vendorRoutes(cfg: Config, authLimiter: RequestHandler) {
  const r = Router();

  r.post("/register", authLimiter, validateBody(registerVendorInput), async (req, res) => {
    const input = req.body as RegisterVendorInput;
    const passwordHash = await hashPassword(cfg, input.password);
    const out = await withTransaction(async (session) => {
      const userId = await nextId("USR", session);
      const vendorId = await nextId("VND", session);
      const referralCode = await newReferralCode(session);
      const referredByCode = await resolveReferredBy(input.ref, session);
      const [user] = await User.create(
        [{ _id: userId, email: input.email, mobile: input.mobile, fullName: input.fullName, passwordHash, role: "vendor", vendorRole: "owner", status: "active", orgId: vendorId, referralCode, referredByCode }],
        { session },
      );
      // PAN and GSTIN come later, in onboarding step "business".
      await Vendor.create([{ _id: vendorId, userId, legalName: input.legalName, city: input.city, categories: input.categories, kycStatus: "pending" }], { session });
      const vnuId = await nextId("VNU", session);
      await VendorUser.create([{ _id: vnuId, vendorId, userId, role: "owner", status: "active" }], { session });
      await Consent.create(consentDocs(userId, req.ip), { session, ordered: true });
      await audit(req, { action: "vendor.register", entity: "vendor", entityId: vendorId, after: { kycStatus: "pending", legalName: input.legalName, categories: input.categories, referredByCode }, userId, role: "vendor" }, session);
      const s = await startSession(cfg, req, res, userId, session);
      return { user: toSessionUser(user!.toObject()), vendorId, kycStatus: "pending" as const, ...s };
    });
    res.status(201).json({ data: out });
  });

  r.use("/me", requirePermission("vendor.profile"));

  r.get("/me", async (req, res) => {
    const v = await currentVendor(req);
    const docs = await kycDocsFor(v._id);
    res.json({
      data: {
        vendorId: v._id, legalName: v.legalName, pan: maskPan(v.pan), gstin: v.gstin, city: v.city, categories: v.categories,
        kycStatus: v.kycStatus, kycReason: v.kycReason, approvedAt: v.approvedAt,
        documents: docs,
        missingDocuments: REQUIRED_KYC_DOCS.filter((t) => !docs.some((d) => d.type === t)),
        bank: await maskedBank(v._id),
      },
    });
  });

  r.get("/me/documents", async (req, res) => {
    const v = await currentVendor(req);
    res.json({ data: await kycDocsFor(v._id) });
  });

  /** multipart/form-data: type=<pan|gst|...>, file=<pdf/jpg/png ≤5 MB>. Stored encrypted. */
  r.post("/me/documents", upload.single("file"), async (req, res) => {
    const v = await currentVendor(req);
    if (v.kycStatus === "approved") throw new AppError(409, "CONFLICT", "KYC is already approved. Contact OOHRENA to update documents.");
    const type = z.enum(KYC_DOC_TYPES, { error: "Choose a document type" }).safeParse(req.body?.type);
    if (!type.success) throw badRequest("Choose a document type", { fieldErrors: { type: [type.error.issues[0]!.message] } });
    if (!req.file) throw badRequest("Attach a file", { fieldErrors: { file: ["Attach a file"] } });
    const f = await saveUpload(cfg, req.file.buffer, {
      kind: "kyc_document", allowed: DOC_MIME, maxBytes: MAX_DOC_BYTES, encryptAtRest: true,
      ownerUserId: req.user!.userId, vendorId: v._id, originalName: req.file.originalname,
    });
    const doc = await VendorDocument.create({ vendorId: v._id, type: type.data, fileId: f._id, uploadedBy: req.user!.userId });
    await audit(req, { action: "vendor.document.upload", entity: "vendor", entityId: v._id, after: { type: type.data, fileId: f._id, size: f.size, mime: f.mime } });
    res.status(201).json({ data: { docId: String(doc._id), type: doc.type, fileId: f._id, status: doc.status, uploadedAt: doc.uploadedAt } });
  });

  /* ---------- Team management (Blueprint §2.1) ---------- */
  r.get("/me/team", requireVendorRole("owner", "manager"), async (req, res) => {
    const v = await currentVendor(req);
    const members = await VendorUser.find({ vendorId: v._id }).lean();
    const userIds = members.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map((u) => [u._id, u]));
    const data = members.map((m) => {
      const u = userMap.get(m.userId);
      return {
        vendorUserId: m._id,
        userId: m.userId,
        role: m.role,
        status: m.status,
        name: u?.fullName ?? "Unknown",
        fullName: u?.fullName ?? "Unknown",
        email: u?.email ?? "",
        mobile: u?.mobile ?? "",
        createdAt: m.createdAt,
      };
    });
    res.json({ data });
  });

  r.post("/me/team/invite", requireVendorRole("owner"), validateBody(inviteVendorStaffInput), async (req, res) => {
    const v = await currentVendor(req);
    const input = req.body as z.infer<typeof inviteVendorStaffInput>;
    const existing = await User.findOne({ email: input.email }).lean();
    if (existing) throw new AppError(409, "CONFLICT", "A user with this email already exists");

    const password = input.password ?? "Temp!Password123";
    const passwordHash = await hashPassword(cfg, password);
    const out = await withTransaction(async (session) => {
      const userId = await nextId("USR", session);
      const [user] = await User.create(
        [
          {
            _id: userId,
            email: input.email,
            mobile: input.mobile,
            fullName: input.fullName,
            passwordHash,
            role: "vendor",
            vendorRole: input.role,
            status: "active",
            orgId: v._id,
            createdBy: req.user!.userId,
          },
        ],
        { session },
      );
      const vnuId = await nextId("VNU", session);
      const [vu] = await VendorUser.create(
        [
          {
            _id: vnuId,
            vendorId: v._id,
            userId,
            role: input.role,
            status: "active",
            invitedBy: req.user!.userId,
          },
        ],
        { session },
      );
      await audit(req, {
        action: "vendor.staff.invite",
        entity: "vendor_user",
        entityId: vnuId,
        after: { vendorId: v._id, userId, role: input.role, email: input.email },
      }, session);
      return {
        vendorUserId: vu!._id,
        userId,
        name: user!.fullName,
        fullName: user!.fullName,
        email: user!.email,
        mobile: user!.mobile,
        role: vu!.role,
        status: vu!.status,
        tempPassword: password,
        createdAt: vu!.createdAt,
      };
    });
    res.status(201).json({ data: out });
  });

  r.patch("/me/team/:userId", requireVendorRole("owner"), validateBody(updateVendorStaffInput), async (req, res) => {
    const v = await currentVendor(req);
    const targetUserId = String(req.params.userId);
    const vu = await VendorUser.findOne({ vendorId: v._id, userId: targetUserId });
    if (!vu) throw notFound("Team member not found");
    if (vu.role === "owner" && req.user!.userId !== targetUserId) {
      throw new AppError(403, "FORBIDDEN", "Cannot modify the primary vendor owner");
    }
    const input = req.body as z.infer<typeof updateVendorStaffInput>;
    const before = { role: vu.role, status: vu.status };
    if (input.role) vu.role = input.role;
    if (input.status) vu.status = input.status;
    await vu.save();
    await User.updateOne({ _id: targetUserId }, { $set: { ...(input.role ? { vendorRole: input.role } : {}), ...(input.status ? { status: input.status } : {}) } });
    await audit(req, { action: "vendor.staff.update", entity: "vendor_user", entityId: vu._id, before, after: { role: vu.role, status: vu.status } });
    res.json({ data: { vendorUserId: vu._id, userId: vu.userId, role: vu.role, status: vu.status } });
  });

  r.delete("/me/team/:userId", requireVendorRole("owner"), async (req, res) => {
    const v = await currentVendor(req);
    const targetUserId = String(req.params.userId);
    const vu = await VendorUser.findOne({ vendorId: v._id, userId: targetUserId });
    if (!vu) throw notFound("Team member not found");
    if (vu.role === "owner") throw new AppError(403, "FORBIDDEN", "Cannot remove the vendor owner");
    await VendorUser.deleteOne({ _id: vu._id });
    await User.updateOne({ _id: targetUserId }, { $set: { status: "suspended" } });
    await revokeAllSessions(targetUserId);
    await audit(req, { action: "vendor.staff.remove", entity: "vendor_user", entityId: vu._id, before: { userId: targetUserId, role: vu.role } });
    res.json({ data: { removed: true } });
  });

  /* ---------- Bank details (Owner only) ---------- */
  r.get("/me/bank", requireVendorRole("owner"), async (req, res) => {
    const v = await currentVendor(req);
    res.json({ data: await maskedBank(v._id) });
  });

  r.put("/me/bank", requireVendorRole("owner"), validateBody(vendorBankInput), async (req, res) => {
    const v = await currentVendor(req);
    const b = req.body as z.infer<typeof vendorBankInput>;
    const before = await maskedBank(v._id);
    await VendorBank.updateOne(
      { vendorId: v._id },
      {
        $set: { accountName: b.accountName, accountNoEnc: encryptString(cfg.encryptionKey, b.accountNo), accountLast4: b.accountNo.slice(-4), ifsc: b.ifsc, bankName: b.bankName ?? null, verifiedBy: null, verifiedAt: null },
        $setOnInsert: { vendorId: v._id },
      },
      { upsert: true },
    );
    const after = await maskedBank(v._id);
    await audit(req, { action: "vendor.bank.update", entity: "vendor", entityId: v._id, before, after });
    res.json({ data: after });
  });

  /** Rejected → Pending after the vendor fixes documents. */
  r.post("/me/kyc/resubmit", requireVendorRole("owner", "manager"), async (req, res) => {
    const v = await currentVendor(req);
    if (v.kycStatus !== "rejected") throw new AppError(409, "INVALID_TRANSITION", `KYC is ${v.kycStatus}; only rejected KYC can be resubmitted`);
    if (!v.pan) throw badRequest("Add your PAN first", { field: "pan" });
    const docs = await kycDocsFor(v._id);
    const missing = REQUIRED_KYC_DOCS.filter((t) => !docs.some((d) => d.type === t));
    if (missing.length) throw badRequest(`Upload the required documents first: ${missing.join(", ")}`);
    await Vendor.updateOne({ _id: v._id, kycStatus: "rejected" }, { $set: { kycStatus: "pending", kycReason: null } });
    await audit(req, { action: "vendor.kyc.resubmit", entity: "vendor", entityId: v._id, before: { kycStatus: "rejected" }, after: { kycStatus: "pending" } });
    res.json({ data: { kycStatus: "pending" } });
  });

  r.use("/me/inventory", vendorInventoryRoutes(cfg));
  r.use("/me/work-orders", vendorWorkOrderRoutes());
  r.get("/me/payables", requireVendorRole("owner", "accounts"), async (req, res) => {
    const v = await currentVendor(req);
    res.json({ data: await ownPayables(v._id) });
  });

  r.get("/me/audit", requireVendorRole("owner"), async (req, res) => {
    const v = await currentVendor(req);
    const filter = {
      $or: [{ entityId: v._id }, { "after.vendorId": v._id }, { userId: req.user!.userId }],
    };
    const items = await AuditLog.find(filter).sort({ at: -1, _id: -1 }).limit(100).lean();
    res.json({
      data: items.map(({ _id, ...rest }) => ({ logId: String(_id), ...rest })),
    });
  });

  /** Own overdue proof slots (alerts: owner, manager, field). */
  r.get("/me/proofs/overdue", requireVendorRole("owner", "manager", "field"), async (req, res) => {
    const v = await currentVendor(req);
    res.json({ data: (await overdueSlots({ vendorId: v._id })).map(slotView) });
  });

  r.use("/me", (_req, _res, next) => next(notFound()));
  return r;
}
