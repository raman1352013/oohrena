import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import {
  MAX_DOC_BYTES, PAYMENT_DIRECTIONS, PAYMENT_STATUSES, fromDay, invoiceCreateInput, paymentDecisionInput, paymentEditInput, paymentMetaInput, refundMetaInput, vendorPayoutMetaInput,
  type PaymentDirection,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { decryptString } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { renderPdf, pdfMoney } from "../lib/pdf.js";
import { readUpload } from "../lib/storage.js";
import { requirePermission } from "../middleware/auth.js";
import { currentVendor } from "../middleware/upload.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { Booking } from "../models/booking.js";
import { StoredFile } from "../models/files.js";
import { Invoice, Payment, PaymentHistory, VendorPayable } from "../models/finance.js";
import { Vendor } from "../models/foundation.js";
import { VendorBank } from "../models/vendor-kyc.js";
import { createInvoice, decidePayment, editPayment, paymentView, reconcile, reconciliationCsv, recordPayment, syncPayables } from "../services/finance.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOC_BYTES, files: 1, fields: 20 } });
type InvDoc = Awaited<ReturnType<typeof createInvoice>>;
const invoiceView = (i: InvDoc) => ({
  invoiceId: i._id, bookingId: i.bookingId, clientId: i.clientId ?? null, billTo: i.billTo, lines: i.lines, subtotal: i.subtotal, serviceFee: i.serviceFee,
  cgst: i.cgst, sgst: i.sgst, gst: i.gst, total: i.total, advancePct: i.advancePct, advanceAmount: i.advanceAmount,
  issuedAt: i.issuedAt, dueDate: fromDay(i.dueDate.getTime()), status: i.status,
});
const payableView = (p: { bookingId: string; vendorId: string; base: number; gst: number; amount: number; paid: number; status: string; dueDate: Date }) => ({
  bookingId: p.bookingId, vendorId: p.vendorId, base: p.base, gst: p.gst, amount: p.amount, paid: p.paid, balance: p.amount - p.paid, status: p.status, dueDate: fromDay(p.dueDate.getTime()),
});

/** Module 8: Finance / Audit workspace. Admin may record (maker) but only Finance verifies (checker) and sees amounts/evidence. */
export function financeRoutes(cfg: Config) {
  const r = Router();

  r.get("/overview", requirePermission("finance.manage"), async (_req, res) => {
    const bookings = await Booking.find({ status: { $in: ["confirmed", "live", "completed", "cancelled"] } }).select("_id").lean();
    for (const b of bookings) await syncPayables(b._id);
    const [toVerify, invoicesOpen, payablesDue, refundsPending, uninvoiced] = await Promise.all([
      Payment.countDocuments({ status: "unverified" }),
      Invoice.countDocuments({ status: { $in: ["issued", "partially_paid"] } }),
      VendorPayable.countDocuments({ status: { $in: ["due", "partially_paid"] } }),
      Booking.countDocuments({ status: "cancelled", "cancellation.refundable": { $gt: 0 } }),
      Booking.countDocuments({ status: { $in: ["confirmed", "live", "completed"] }, _id: { $nin: (await Invoice.find({}).select("bookingId").lean()).map((i) => i.bookingId) } }),
    ]);
    const overdueInvoices = await Invoice.countDocuments({ status: { $in: ["issued", "partially_paid"] }, dueDate: { $lt: new Date() } });
    res.json({ data: { toVerify, invoicesOpen, overdueInvoices, payablesDue, refundsPending, uninvoicedBookings: uninvoiced } });
  });

  /** Bookings with their money position — the Finance working list. */
  r.get("/bookings", requirePermission("finance.manage"), async (_req, res) => {
    const bookings = await Booking.find({ status: { $ne: "draft" } }).sort({ createdAt: -1 }).limit(200).lean();
    const out = [];
    for (const b of bookings) {
      const rec = await reconcile(b._id);
      const inv = await Invoice.findOne({ bookingId: b._id }).select("_id status").lean();
      out.push({ bookingId: b._id, status: b.status, total: b.total, start: fromDay(b.start.getTime()), end: fromDay(b.end.getTime()), invoiceId: inv?._id ?? null, invoiceStatus: inv?.status ?? null, client: rec.client, vendors: rec.vendors, checksOk: rec.checks.every((c) => c.ok) });
    }
    res.json({ data: out });
  });

  /* ---------- Invoices ---------- */
  r.post("/invoices", requirePermission("finance.record"), validateBody(invoiceCreateInput), async (req, res) => {
    const { bookingId, advancePct, dueDate } = req.body as z.infer<typeof invoiceCreateInput>;
    res.status(201).json({ data: invoiceView(await createInvoice(req, bookingId, advancePct, dueDate)) });
  });
  r.get("/invoices", requirePermission("finance.manage"), async (_req, res) => {
    res.json({ data: (await Invoice.find({}).sort({ issuedAt: -1 }).limit(200).lean()).map((i) => invoiceView(i as never)) });
  });

  /* ---------- Payments: record (maker) → verify (checker) ---------- */
  const recorder = (direction: PaymentDirection, schema: z.ZodTypeAny) => async (req: import("express").Request, res: import("express").Response) => {
    const meta = schema.safeParse(req.body ?? {});
    if (!meta.success) throw badRequest("Please check the payment details", meta.error.flatten());
    const p = await recordPayment(cfg, req, direction, meta.data, req.file);
    res.status(201).json({ data: paymentView(p as never, "finance") });
  };
  r.post("/payments", requirePermission("finance.record"), upload.single("file"), recorder("client_receipt", paymentMetaInput));
  r.post("/vendor-payments", requirePermission("finance.record"), upload.single("file"), recorder("vendor_payout", vendorPayoutMetaInput));
  r.post("/refunds", requirePermission("finance.record"), upload.single("file"), recorder("refund", refundMetaInput));

  r.get("/payments", requirePermission("finance.record"), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(PAYMENT_STATUSES).optional(), direction: z.enum(PAYMENT_DIRECTIONS).optional(), bookingId: z.string().trim().optional() }), req);
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.direction) filter.direction = q.direction;
    if (q.bookingId) filter.bookingId = q.bookingId;
    const items = await Payment.find(filter).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ data: items.map((p) => paymentView(p as never, req.user!.role === "finance" ? "finance" : "admin")) });
  });

  r.patch("/payments/:id", requirePermission("finance.record"), validateBody(paymentEditInput), async (req, res) => {
    res.json({ data: paymentView((await editPayment(req, String(req.params.id), req.body as z.infer<typeof paymentEditInput>)) as never, "finance") });
  });

  r.post("/payments/:id/verify", requirePermission("finance.verify"), validateBody(paymentDecisionInput), async (req, res) => {
    const { decision, reason } = req.body as z.infer<typeof paymentDecisionInput>;
    res.json({ data: await decidePayment(req, String(req.params.id), decision, reason) });
  });

  r.get("/payments/:id/history", requirePermission("finance.manage"), async (req, res) => {
    const rows = await PaymentHistory.find({ paymentId: String(req.params.id) }).sort({ at: 1 }).lean();
    res.json({ data: rows.map(({ _id, ...h }) => h) });
  });

  /** Payment evidence (encrypted at rest). Viewing it is logged. */
  r.get("/payments/:id/proof", requirePermission("finance.manage"), async (req, res) => {
    const p = await Payment.findById(String(req.params.id)).lean();
    if (!p) throw notFound("Payment not found");
    const f = await StoredFile.findById(p.proofFileId).lean();
    if (!f) throw notFound("Proof file not found");
    await audit(req, { action: "payment.proof.view", entity: "payment", entityId: p._id });
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(await readUpload(cfg, f));
  });

  /* ---------- Vendor payables & bank details ---------- */
  r.get("/payables", requirePermission("finance.manage"), async (req, res) => {
    const q = parseQuery(z.object({ status: z.string().trim().optional() }), req);
    const bookings = await Booking.find({ status: { $in: ["confirmed", "live", "completed", "cancelled"] } }).select("_id").lean();
    for (const b of bookings) await syncPayables(b._id);
    const filter: Record<string, unknown> = q.status ? { status: q.status } : {};
    const items = await VendorPayable.find(filter).sort({ dueDate: 1 }).lean();
    const vendors = await Vendor.find({ _id: { $in: items.map((i) => i.vendorId) } }).select("_id legalName").lean();
    res.json({ data: items.map((p) => ({ ...payableView(p), vendorName: vendors.find((v) => v._id === p.vendorId)?.legalName ?? null })) });
  });

  /** Full account number for making a payout — Finance only, logged every time. */
  r.get("/vendors/:id/bank", requirePermission("vendor.bank.read"), async (req, res) => {
    if (req.user!.role !== "finance") throw notFound();
    const b = await VendorBank.findOne({ vendorId: String(req.params.id) }).select("+accountNoEnc").lean();
    if (!b) throw notFound("No bank details on file for this vendor");
    await audit(req, { action: "vendor.bank.view", entity: "vendor", entityId: String(req.params.id) });
    res.json({ data: { vendorId: b.vendorId, accountName: b.accountName, accountNo: decryptString(cfg.encryptionKey, b.accountNoEnc!), ifsc: b.ifsc, bankName: b.bankName, verified: !!b.verifiedAt } });
  });

  r.post("/vendors/:id/bank/verify", requirePermission("finance.verify"), async (req, res) => {
    const b = await VendorBank.findOneAndUpdate({ vendorId: String(req.params.id) }, { $set: { verifiedBy: req.user!.userId, verifiedAt: new Date() } }, { returnDocument: "after" }).lean();
    if (!b) throw notFound("No bank details on file for this vendor");
    await audit(req, { action: "vendor.bank.verify", entity: "vendor", entityId: b.vendorId });
    res.json({ data: { vendorId: b.vendorId, verified: true } });
  });

  /* ---------- Reconciliation (JSON / CSV / PDF); exports are logged ---------- */
  r.get("/reconciliation/:bookingId", requirePermission("finance.manage"), async (req, res) => {
    const { format } = parseQuery(z.object({ format: z.enum(["json", "csv", "pdf"]).default("json") }), req);
    const rec = await reconcile(String(req.params.bookingId));
    if (format === "json") return res.json({ data: rec });
    await audit(req, { action: "finance.export", entity: "booking", entityId: rec.bookingId, after: { report: "reconciliation", format } });
    const name = `reconciliation-${rec.bookingId}.${format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    if (format === "csv") return res.type("text/csv").send(reconciliationCsv(rec));
    const pdf = await renderPdf(`Booking reconciliation — ${rec.bookingId}`, `Status ${rec.status} · generated ${rec.generatedAt}`, [
      { kind: "heading", text: "Client" },
      { kind: "kv", rows: [["Billed", pdfMoney(rec.client.billed)], ["GST on invoice", pdfMoney(rec.client.billedGst)], ["Received (verified)", pdfMoney(rec.client.received)], ["Refunded (verified)", pdfMoney(rec.client.refunded)], ["Balance due", pdfMoney(rec.client.balanceDue)]] },
      { kind: "heading", text: "Vendor payables" },
      { kind: "table", head: ["Vendor", "Payable", "GST", "Paid", "Balance", "Status"], rows: rec.vendors.map((v) => [v.vendorId, pdfMoney(v.payable), pdfMoney(v.payableGst), pdfMoney(v.paid), pdfMoney(v.balance), v.status]) },
      { kind: "heading", text: "Platform" },
      { kind: "kv", rows: [["Commission", pdfMoney(rec.platform.commission)], ["Service fee", pdfMoney(rec.platform.serviceFee)], ["Output GST", pdfMoney(rec.platform.outputGst)], ["Input GST", pdfMoney(rec.platform.inputGst)], ["Net GST", pdfMoney(rec.platform.netGst)], ["Gross margin", pdfMoney(rec.platform.grossMargin)]] },
      ...(rec.cancellation ? [{ kind: "text" as const, text: `Cancellation: ${rec.cancellation.rule}; fee ${pdfMoney(rec.cancellation.fee)}, refundable ${pdfMoney(rec.cancellation.refundable)}.` }] : []),
      { kind: "heading", text: "Consistency checks" },
      { kind: "table", head: ["Check", "OK", "Detail"], rows: rec.checks.map((c) => [c.name, c.ok ? "Yes" : "NO", c.detail]), widths: [200, 40, 259] },
    ]);
    return res.type("application/pdf").send(pdf);
  });

  /** Admin: payment status only (no amounts, evidence or bank data). */
  r.get("/bookings/:id/status", requirePermission("finance.status.read"), async (req, res) => {
    const id = String(req.params.id);
    const [inv, payables] = await Promise.all([Invoice.findOne({ bookingId: id }).select("_id status").lean(), (await syncPayables(id), VendorPayable.find({ bookingId: id }).select("vendorId status").lean())]);
    res.json({ data: { bookingId: id, invoice: inv ? { invoiceId: inv._id, status: inv.status } : null, payables: payables.map((p) => ({ vendorId: p.vendorId, status: p.status })) } });
  });

  return r;
}

/** Client: own invoices and payments. (Vendor payables live under /vendors/me/payables.) */
export function ownFinanceRoutes() {
  const r = Router();
  r.get("/clients/me/payments", requirePermission("payments.read.own"), async (req, res) => {
    const [invoices, payments] = await Promise.all([Invoice.find({ clientId: req.user!.orgId }).sort({ issuedAt: -1 }).lean(), Payment.find({ clientId: req.user!.orgId, direction: { $in: ["client_receipt", "refund"] }, status: { $ne: "rejected" } }).sort({ paidOn: -1 }).lean()]);
    res.json({ data: { invoices: invoices.map((i) => invoiceView(i as never)), payments: payments.map((p) => paymentView(p as never, "client")) } });
  });
  return r;
}

/** Mounted inside the vendor router: GET /vendors/me/payables — own payables and payouts only. */
export async function ownPayables(vendorId: string) {
  const bookings = await VendorPayable.find({ vendorId }).select("bookingId").lean();
  for (const b of bookings) await syncPayables(b.bookingId);
  const [payables, payouts] = await Promise.all([VendorPayable.find({ vendorId }).sort({ dueDate: 1 }).lean(), Payment.find({ vendorId, direction: "vendor_payout", status: { $ne: "rejected" } }).sort({ paidOn: -1 }).lean()]);
  return { payables: payables.map(payableView), payouts: payouts.map((p) => paymentView(p as never, "vendor")) };
}
