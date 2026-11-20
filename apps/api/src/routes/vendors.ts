import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { DOC_MIME, KYC_DOC_TYPES, MAX_DOC_BYTES, REQUIRED_KYC_DOCS, registerVendorInput, vendorBankInput, type RegisterVendorInput } from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { encryptString } from "../lib/crypto.js";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { saveUpload } from "../lib/storage.js";
import { withTransaction } from "../lib/tx.js";
import { requirePermission } from "../middleware/auth.js";
import { currentVendor, upload } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { Consent, User, Vendor } from "../models/foundation.js";
import { VendorBank, VendorDocument } from "../models/vendor-kyc.js";
import { hashPassword, startSession, toSessionUser } from "../services/session.js";
import { consentDocs } from "./auth.js";
import { vendorInventoryRoutes } from "./vendor-inventory.js";
import { vendorWorkOrderRoutes } from "./deals.js";
import { slotView } from "./execution.js";
import { ownPayables } from "./finance.js";
import { overdueSlots } from "../services/execution.js";

export const maskPan = (pan: string) => `${pan.slice(0, 2)}XXXXX${pan.slice(-3)}`;
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
      const [user] = await User.create(
        [{ _id: userId, email: input.email, mobile: input.mobile, fullName: input.fullName, passwordHash, role: "vendor", status: "active", orgId: vendorId }],
        { session },
      );
      await Vendor.create([{ _id: vendorId, userId, legalName: input.legalName, pan: input.pan, gstin: input.gstin ?? null, city: input.city, kycStatus: "pending" }], { session });
      await Consent.create(consentDocs(userId, req.ip), { session, ordered: true });
      await audit(req, { action: "vendor.register", entity: "vendor", entityId: vendorId, after: { kycStatus: "pending", legalName: input.legalName }, userId, role: "vendor" }, session);
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
        vendorId: v._id, legalName: v.legalName, pan: maskPan(v.pan), gstin: v.gstin, city: v.city,
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

  r.get("/me/bank", async (req, res) => {
    const v = await currentVendor(req);
    res.json({ data: await maskedBank(v._id) });
  });

  r.put("/me/bank", validateBody(vendorBankInput), async (req, res) => {
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
  r.post("/me/kyc/resubmit", async (req, res) => {
    const v = await currentVendor(req);
    if (v.kycStatus !== "rejected") throw new AppError(409, "INVALID_TRANSITION", `KYC is ${v.kycStatus}; only rejected KYC can be resubmitted`);
    const docs = await kycDocsFor(v._id);
    const missing = REQUIRED_KYC_DOCS.filter((t) => !docs.some((d) => d.type === t));
    if (missing.length) throw badRequest(`Upload the required documents first: ${missing.join(", ")}`);
    await Vendor.updateOne({ _id: v._id, kycStatus: "rejected" }, { $set: { kycStatus: "pending", kycReason: null } });
    await audit(req, { action: "vendor.kyc.resubmit", entity: "vendor", entityId: v._id, before: { kycStatus: "rejected" }, after: { kycStatus: "pending" } });
    res.json({ data: { kycStatus: "pending" } });
  });

  r.use("/me/inventory", vendorInventoryRoutes(cfg));
  r.use("/me/work-orders", vendorWorkOrderRoutes());
  r.get("/me/payables", async (req, res) => {
    const v = await currentVendor(req);
    res.json({ data: await ownPayables(v._id) });
  });

  /** Own overdue proof slots (alerts). */
  r.get("/me/proofs/overdue", async (req, res) => {
    const v = await currentVendor(req);
    res.json({ data: (await overdueSlots({ vendorId: v._id })).map(slotView) });
  });

  r.use("/me", (_req, _res, next) => next(notFound()));
  return r;
}
