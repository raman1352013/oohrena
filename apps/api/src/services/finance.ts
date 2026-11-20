import type { Request } from "express";
import {
  DOC_MIME, INVOICE_DUE_DAYS, MAX_DOC_BYTES, PAYMENT_DIRECTION_LABEL, fromDay, payableFor, toDay, todayIST,
  type PaymentDirection, type PayableStatus, type Reconciliation,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, forbidden, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { renderPdf, pdfMoney, type PdfBlock } from "../lib/pdf.js";
import { saveUpload } from "../lib/storage.js";
import { withTransaction } from "../lib/tx.js";
import { Booking } from "../models/booking.js";
import { Proof } from "../models/execution.js";
import { Invoice, Payment, PaymentHistory, VendorPayable } from "../models/finance.js";
import { Client, User, Vendor } from "../models/foundation.js";
import { notify } from "./notifications.js";

type BookingDoc = { _id: string; clientId?: string | null; status: string; items: { inventoryId: string; title: string; vendorId: string; lineTotal: number; vendorCost: number; from: Date; to: Date }[]; subtotal: number; serviceFee: number; gst: number; total: number; end: Date; cancellation?: { fee: number; feePct: number; refundable: number; rule: string } | null };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function loadBooking(id: string) {
  const b = await Booking.findById(id).lean<BookingDoc>();
  if (!b) throw notFound("Booking not found");
  return b;
}

/* ---------- Invoices ---------- */
export async function createInvoice(req: Request, bookingId: string, advancePct: number, dueDate?: string) {
  const b = await loadBooking(bookingId);
  if (!["confirmed", "live", "completed", "closed"].includes(b.status)) throw new AppError(409, "CONFLICT", `Invoices are raised for confirmed bookings (this one is ${b.status})`);
  if (await Invoice.exists({ bookingId })) throw new AppError(409, "CONFLICT", "This booking already has an invoice");
  const client = b.clientId ? await Client.findById(b.clientId).lean() : null;
  const clientGstin = client?.gstin?.trim().toUpperCase();
  const clientState = client?.billingAddress?.state?.trim().toLowerCase();
  // Default platform state is Maharashtra (27). Inter-state if client GSTIN doesn't start with '27',
  // or billing address state is outside Maharashtra when GSTIN is unregistered.
  const isInterState = clientGstin ? !clientGstin.startsWith("27") : (clientState ? clientState !== "maharashtra" : false);
  const placeOfSupply = client?.billingAddress?.state || (clientGstin ? `State ${clientGstin.slice(0, 2)}` : "Maharashtra");

  const igst = isInterState ? b.gst : 0;
  const gstHalf = isInterState ? 0 : Math.round(b.gst / 2);
  const cgst = gstHalf;
  const sgst = isInterState ? 0 : b.gst - gstHalf;

  const due = dueDate ?? fromDay(toDay(todayIST()) + INVOICE_DUE_DAYS * 86_400_000);
  if (toDay(due) < toDay(todayIST())) throw badRequest("Due date can't be in the past");
  const id = await nextId("TXI");
  const inv = await Invoice.create({
    _id: id, bookingId, clientId: b.clientId ?? null,
    billTo: { companyName: client?.companyName ?? null, gstin: client?.gstin ?? null, address: client?.billingAddress ?? null },
    lines: [...b.items.map((i) => ({ description: `${i.title} (${fromDay(i.from.getTime())} – ${fromDay(i.to.getTime())})`, inventoryId: i.inventoryId, amount: i.lineTotal })), { description: "Platform / service fee", inventoryId: null, amount: b.serviceFee }],
    subtotal: b.subtotal, serviceFee: b.serviceFee,
    cgst, sgst, igst, gst: b.gst,
    sacCode: "998361",
    placeOfSupply,
    isInterState,
    total: b.total,
    advancePct, advanceAmount: Math.round((b.total * advancePct) / 100), dueDate: new Date(toDay(due)), issuedBy: req.user!.userId,
  });
  await audit(req, { action: "invoice.issue", entity: "invoice", entityId: id, after: { bookingId, total: b.total, advancePct, isInterState, igst, cgst, sgst } });
  return inv.toObject();
}

async function refreshInvoice(bookingId: string) {
  const inv = await Invoice.findOne({ bookingId }).lean();
  if (!inv) return;
  const received = sum((await Payment.find({ bookingId, direction: "client_receipt", status: "verified" }).lean()).map((p) => p.amount));
  const status = received >= inv.total ? "paid" : received > 0 ? "partially_paid" : "issued";
  if (inv.status !== "cancelled" && inv.status !== status) await Invoice.updateOne({ _id: inv._id }, { $set: { status } });
}

/* ---------- Vendor payables ---------- */
/**
 * Keeps one payable per vendor per booking in step with the booking:
 * pending until execution is evidenced (a verified proof) → due; paid / partially paid from verified payouts;
 * cancelled bookings cancel unpaid payables.
 */
export async function syncPayables(bookingId: string) {
  const b = await Booking.findById(bookingId).lean<BookingDoc>();
  if (!b) return;
  const vendorIds = [...new Set(b.items.map((i) => i.vendorId))];
  const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select("_id gstin").lean();
  for (const vendorId of vendorIds) {
    const p = payableFor(sum(b.items.filter((i) => i.vendorId === vendorId).map((i) => i.vendorCost)), !!vendors.find((v) => v._id === vendorId)?.gstin);
    const paid = sum((await Payment.find({ bookingId, vendorId, direction: "vendor_payout", status: "verified" }).lean()).map((x) => x.amount));
    const evidenced = b.status === "completed" || !!(await Proof.exists({ bookingId, vendorId, status: "verified" }));
    let status: PayableStatus = paid >= p.total ? "paid" : paid > 0 ? "partially_paid" : evidenced ? "due" : "pending";
    if (b.status === "cancelled" && paid === 0) status = "cancelled";
    await VendorPayable.updateOne(
      { bookingId, vendorId },
      { $set: { base: p.base, gst: p.gst, amount: p.total, paid, status }, $setOnInsert: { dueDate: new Date(b.end.getTime() + 15 * 86_400_000) } },
      { upsert: true },
    );
  }
}

/* ---------- Payments (maker) ---------- */
type Meta = { bookingId: string; amount: number; mode: string; reference: string; paidOn: string; note?: string | undefined; vendorId?: string | undefined; reason?: string | undefined };

/** Records a payment as Unverified. A proof file (UTR screenshot / receipt / bank advice) is mandatory. */
export async function recordPayment(cfg: Config, req: Request, direction: PaymentDirection, meta: Meta, file: Express.Multer.File | undefined) {
  if (!file) throw badRequest("Attach the payment proof (UTR screenshot, receipt or bank advice)", { fieldErrors: { file: ["Payment proof is required"] } });
  if (toDay(meta.paidOn) > toDay(todayIST())) throw badRequest("Payment date can't be in the future");
  const b = await loadBooking(meta.bookingId);
  const pending = async (filter: Record<string, unknown>) => sum((await Payment.find({ bookingId: b._id, direction, status: { $in: ["unverified", "verified"] }, ...filter }).lean()).map((p) => p.amount));
  let invoiceId: string | null = null;
  let ruleApplied: string | null = null;

  if (direction === "client_receipt") {
    const inv = await Invoice.findOne({ bookingId: b._id }).lean();
    if (!inv) throw new AppError(409, "CONFLICT", "Raise the invoice before recording client payments");
    invoiceId = inv._id;
    const outstanding = inv.total - (await pending({}));
    if (meta.amount > outstanding + 0.5) throw new AppError(409, "CONFLICT", `Amount is more than the outstanding ₹${Math.round(outstanding)} (including entries waiting for verification)`);
  } else if (direction === "vendor_payout") {
    await syncPayables(b._id);
    const pay = await VendorPayable.findOne({ bookingId: b._id, vendorId: meta.vendorId }).lean();
    if (!pay) throw notFound("No payable for this vendor on this booking");
    if (pay.status === "pending" || pay.status === "cancelled") throw new AppError(409, "CONFLICT", pay.status === "pending" ? "The payable isn't due yet — it becomes due once proof of display is verified" : "This payable was cancelled");
    const left = pay.amount - (await pending({ vendorId: meta.vendorId }));
    if (meta.amount > left + 0.5) throw new AppError(409, "CONFLICT", `Amount is more than the ₹${Math.round(left)} still payable`);
  } else {
    if (b.status !== "cancelled" || !b.cancellation) throw new AppError(409, "CONFLICT", "Refunds are recorded against a cancelled booking");
    const received = sum((await Payment.find({ bookingId: b._id, direction: "client_receipt", status: "verified" }).lean()).map((p) => p.amount));
    const owed = Math.min(b.cancellation.refundable, received) - (await pending({}));
    if (meta.amount > owed + 0.5) throw new AppError(409, "CONFLICT", `Refund exceeds what the cancellation rule allows (₹${Math.max(0, Math.round(owed))} left: ${b.cancellation.rule}; only verified receipts can be refunded)`);
    ruleApplied = `${b.cancellation.rule} (fee ${b.cancellation.feePct}%)`;
  }

  const stored = await saveUpload(cfg, file.buffer, { kind: "payment_proof", allowed: DOC_MIME, maxBytes: MAX_DOC_BYTES, encryptAtRest: true, ownerUserId: req.user!.userId, ...(meta.vendorId ? { vendorId: meta.vendorId } : {}), originalName: file.originalname });
  const id = await nextId("PAY");
  const p = await Payment.create({
    _id: id, direction, bookingId: b._id, invoiceId, clientId: b.clientId ?? null, vendorId: direction === "vendor_payout" ? meta.vendorId : null,
    amount: round2(meta.amount), mode: meta.mode as never, reference: meta.reference, paidOn: new Date(toDay(meta.paidOn)), proofFileId: stored._id,
    note: meta.note ?? null, reason: meta.reason ?? null, ruleApplied, recordedBy: req.user!.userId, recordedByRole: req.user!.role,
  });
  await audit(req, { action: `payment.record.${direction}`, entity: "payment", entityId: id, after: { bookingId: b._id, amount: p.amount, mode: p.mode, reference: p.reference, status: "unverified" } });
  return p.toObject();
}

/** Edits are allowed only before verification; every changed field is written to payment history. */
export async function editPayment(req: Request, id: string, patch: { amount?: number | undefined; mode?: string | undefined; reference?: string | undefined; paidOn?: string | undefined; note?: string | undefined; reason: string }) {
  const p = await Payment.findById(id).lean();
  if (!p) throw notFound("Payment not found");
  if (p.status !== "unverified") throw new AppError(409, "CONFLICT", `A ${p.status} payment can't be edited`);
  const next: Record<string, unknown> = {};
  if (patch.amount !== undefined) next.amount = round2(patch.amount);
  if (patch.mode) next.mode = patch.mode;
  if (patch.reference) next.reference = patch.reference;
  if (patch.paidOn) next.paidOn = new Date(toDay(patch.paidOn));
  if (patch.note !== undefined) next.note = patch.note;
  const changes = Object.entries(next).filter(([k, v]) => JSON.stringify((p as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null));
  if (!changes.length) return p;
  const after = await Payment.findOneAndUpdate({ _id: id, status: "unverified" }, { $set: next }, { returnDocument: "after" }).lean();
  await PaymentHistory.insertMany(changes.map(([field, v]) => ({ paymentId: id, field, old: (p as Record<string, unknown>)[field] ?? null, new: v, changedBy: req.user!.userId, reason: patch.reason })));
  await audit(req, { action: "payment.edit", entity: "payment", entityId: id, before: Object.fromEntries(changes.map(([k]) => [k, (p as Record<string, unknown>)[k] ?? null])), after: Object.fromEntries(changes), reason: patch.reason });
  return after!;
}

/** Checker: Finance only, and never the person who recorded the payment. */
export async function decidePayment(req: Request, id: string, decision: "verify" | "reject", reason?: string) {
  const p = await Payment.findById(id).lean();
  if (!p) throw notFound("Payment not found");
  if (req.user!.role !== "finance") throw forbidden("Only Finance / Audit can verify payments");
  if (p.recordedBy === req.user!.userId) throw new AppError(403, "FORBIDDEN", "Maker-checker: you recorded this payment, so a different Finance user must verify it");
  if (p.status !== "unverified") throw new AppError(409, "INVALID_TRANSITION", `This payment is already ${p.status}`);
  const status = decision === "verify" ? "verified" : "rejected";
  await withTransaction(async (session) => {
    const r = await Payment.updateOne({ _id: id, status: "unverified" }, { $set: { status, verifiedBy: req.user!.userId, decidedAt: new Date(), rejectReason: decision === "reject" ? reason : null } }, { session });
    if (!r.modifiedCount) throw new AppError(409, "CONFLICT", "Payment changed meanwhile; refresh and try again");
    await PaymentHistory.create([{ paymentId: id, field: "status", old: "unverified", new: status, changedBy: req.user!.userId, reason: reason ?? null }], { session });
    await audit(req, { action: `payment.${decision}`, entity: "payment", entityId: id, before: { status: "unverified" }, after: { status, amount: p.amount, direction: p.direction }, reason: reason ?? null }, session);
  });
  await refreshInvoice(p.bookingId);
  await syncPayables(p.bookingId);
  if (decision === "verify") {
    const targetOrgId = p.direction === "client_receipt" ? p.clientId : p.vendorId;
    if (targetOrgId) {
      const user = await User.findOne({ orgId: targetOrgId }).select("_id email mobile").lean();
      if (user) {
        await notify("payment.verified", [{ userId: user._id, email: user.email, mobile: user.mobile }], {
          paymentId: id,
          amount: p.amount,
        });
      }
    }
  }
  return { paymentId: id, status };
}

export function paymentView(p: { _id: string; direction: string; bookingId: string; invoiceId?: string | null; vendorId?: string | null; amount: number; mode: string; reference: string; paidOn: Date; note?: string | null; ruleApplied?: string | null; reason?: string | null; status: string; recordedBy: string; recordedByRole: string; verifiedBy?: string | null; decidedAt?: Date | null; rejectReason?: string | null; createdAt?: Date }, audience: "finance" | "client" | "vendor" | "admin") {
  const base = { paymentId: p._id, direction: p.direction, label: PAYMENT_DIRECTION_LABEL[p.direction as PaymentDirection], bookingId: p.bookingId, amount: p.amount, paidOn: fromDay(p.paidOn.getTime()), status: p.status, decidedAt: p.decidedAt ?? null };
  if (audience === "admin") return base; // Admin sees status only
  if (audience === "client" || audience === "vendor") return { ...base, mode: p.mode, reference: p.reference, invoiceId: p.invoiceId ?? null };
  return { ...base, invoiceId: p.invoiceId ?? null, vendorId: p.vendorId ?? null, mode: p.mode, reference: p.reference, note: p.note ?? null, ruleApplied: p.ruleApplied ?? null, reason: p.reason ?? null, recordedBy: p.recordedBy, recordedByRole: p.recordedByRole, verifiedBy: p.verifiedBy ?? null, rejectReason: p.rejectReason ?? null, createdAt: p.createdAt ?? null };
}

/* ---------- Reconciliation ---------- */
export async function reconcile(bookingId: string): Promise<Reconciliation> {
  const b = await loadBooking(bookingId);
  await syncPayables(bookingId);
  const [inv, payments, payables] = await Promise.all([Invoice.findOne({ bookingId }).lean(), Payment.find({ bookingId, status: "verified" }).lean(), VendorPayable.find({ bookingId }).lean()]);
  const by = (d: string) => sum(payments.filter((p) => p.direction === d).map((p) => p.amount));
  const received = by("client_receipt");
  const refunded = by("refund");
  const billed = b.status === "cancelled" && b.cancellation ? Math.min(b.cancellation.fee, inv?.total ?? b.total) : (inv?.total ?? 0);
  const vendorCost = sum(b.items.map((i) => i.vendorCost));
  const inputGst = sum(payables.map((p) => p.gst));
  const outputGst = inv?.gst ?? 0;
  const vendors = payables.map((p) => ({ vendorId: p.vendorId, payable: p.amount, payableGst: p.gst, paid: p.paid, balance: p.amount - p.paid, status: p.status as PayableStatus }));
  const checks = [
    { name: "Invoice total equals booking total", ok: !inv || inv.total === b.total, detail: inv ? `invoice ${inv.total} vs booking ${b.total}` : "No invoice yet" },
    { name: "Subtotal + fee + GST equals total", ok: b.subtotal + b.serviceFee + b.gst === b.total, detail: `${b.subtotal} + ${b.serviceFee} + ${b.gst} = ${b.total}` },
    { name: "Client not over-collected", ok: received - refunded <= Math.max(billed, inv?.total ?? 0) + 1, detail: `net received ${received - refunded} vs billable ${billed}` },
    { name: "Refunds within the cancellation rule", ok: refunded <= (b.cancellation?.refundable ?? 0) + 1, detail: `refunded ${refunded} vs refundable ${b.cancellation?.refundable ?? 0}` },
    { name: "No vendor overpaid", ok: vendors.every((v) => v.paid <= v.payable + 1), detail: vendors.map((v) => `${v.vendorId}: ${v.paid}/${v.payable}`).join(", ") || "No payables" },
    { name: "Vendor payables match vendor cost", ok: sum(payables.map((p) => p.base)) === Math.round(vendorCost), detail: `${sum(payables.map((p) => p.base))} vs ${Math.round(vendorCost)}` },
  ];
  const advanceDue = inv?.advanceAmount ?? 0;
  return {
    bookingId, status: b.status, currency: "INR",
    client: { billed, billedGst: outputGst, received, refunded, balanceDue: billed - (received - refunded), advanceDue, advanceReceived: received >= advanceDue && advanceDue > 0 },
    vendors,
    platform: { commission: b.subtotal - Math.round(vendorCost), serviceFee: b.serviceFee, outputGst, inputGst, netGst: outputGst - inputGst, grossMargin: b.subtotal - Math.round(vendorCost) + b.serviceFee },
    cancellation: b.cancellation ? { feePct: b.cancellation.feePct, fee: b.cancellation.fee, refundable: b.cancellation.refundable, rule: b.cancellation.rule } : null,
    checks, generatedAt: new Date().toISOString(),
  };
}

export function reconciliationCsv(r: Reconciliation) {
  const rows: (string | number)[][] = [
    ["Booking", r.bookingId], ["Status", r.status], ["Generated", r.generatedAt], [],
    ["Client billed", r.client.billed], ["Client GST (output)", r.client.billedGst], ["Client received (verified)", r.client.received], ["Refunded (verified)", r.client.refunded], ["Client balance due", r.client.balanceDue], ["Advance due", r.client.advanceDue], [],
    ["Vendor", "Payable", "Payable GST", "Paid", "Balance", "Status"], ...r.vendors.map((v) => [v.vendorId, v.payable, v.payableGst, v.paid, v.balance, v.status]), [],
    ["Commission", r.platform.commission], ["Service fee", r.platform.serviceFee], ["Output GST", r.platform.outputGst], ["Input GST", r.platform.inputGst], ["Net GST", r.platform.netGst], ["Gross margin", r.platform.grossMargin], [],
    ["Check", "OK", "Detail"], ...r.checks.map((c) => [c.name, c.ok ? "yes" : "NO", c.detail]),
  ];
  const cell = (v: string | number) => (typeof v === "number" ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function renderInvoicePdf(inv: any): Promise<Buffer> {
  const gstinRow: [string, string | number][] = inv.billTo?.gstin ? [["GSTIN", inv.billTo.gstin]] : [];
  const addressRow: [string, string | number][] = inv.billTo?.address
    ? [["Billing Address", [inv.billTo.address.line1, inv.billTo.address.city, inv.billTo.address.state, inv.billTo.address.pin].filter(Boolean).join(", ")]]
    : [];
  const taxRows: [string, string | number][] = inv.isInterState
    ? [["IGST (18%)", pdfMoney(inv.igst || inv.gst)]]
    : [
        ["CGST (9%)", pdfMoney(inv.cgst)],
        ["SGST (9%)", pdfMoney(inv.sgst)],
      ];

  const blocks: PdfBlock[] = [
    {
      kind: "kv",
      rows: [
        ["Invoice Number", inv._id],
        ["Invoice Date", fromDay(new Date(inv.issuedAt).getTime())],
        ["Due Date", fromDay(new Date(inv.dueDate).getTime())],
        ["Booking Reference", inv.bookingId],
        ["Place of Supply", inv.placeOfSupply || "Maharashtra (27)"],
        ["Supplier", "OOHRENA Advertising Platform Private Limited"],
        ["Supplier GSTIN", "27AAFCO0000A1Z5"],
      ],
    },
    { kind: "heading", text: "Recipient Details (Bill To)" },
    {
      kind: "kv",
      rows: [
        ["Company Name", inv.billTo?.companyName || "Client"],
        ...gstinRow,
        ...addressRow,
      ],
    },
    { kind: "heading", text: "Particulars & Services" },
    {
      kind: "table",
      head: ["Description", "SAC", "Amount"],
      widths: [300, 80, 119],
      rows: (inv.lines || []).map((l: any) => [l.description, inv.sacCode || "998361", pdfMoney(l.amount)]),
    },
    { kind: "heading", text: "Tax & Amount Computation" },
    {
      kind: "kv",
      rows: [
        ["Subtotal", pdfMoney(inv.subtotal)],
        ["Platform / Service Fee", pdfMoney(inv.serviceFee)],
        ...taxRows,
        ["Total Invoice Value (INR)", pdfMoney(inv.total)],
        ["Advance Required", `${inv.advancePct}% (${pdfMoney(inv.advanceAmount)})`],
      ],
    },
    {
      kind: "text",
      text: "Payment Terms: Please pay the advance amount by the due date via NEFT/RTGS to OOHRENA Platform Private Limited, HDFC Bank, A/C: 50200012345678, IFSC: HDFC0000123. Quote invoice number as payment reference.",
    },
  ];

  return renderPdf(`TAX INVOICE — ${inv._id}`, `Status: ${inv.status.toUpperCase()} · Booking ${inv.bookingId}`, blocks);
}

export async function renderCreditNotePdf(cn: any): Promise<Buffer> {
  const blocks: PdfBlock[] = [
    {
      kind: "kv",
      rows: [
        ["Credit Note Number", cn._id],
        ["Date of Issue", fromDay(new Date(cn.issuedAt).getTime())],
        ["Against Tax Invoice", cn.invoiceId],
        ["Booking Reference", cn.bookingId],
        ["Supplier", "OOHRENA Advertising Platform Private Limited"],
        ["Supplier GSTIN", "27AAFCO0000A1Z5"],
      ],
    },
    { kind: "heading", text: "Credit Note Particulars" },
    {
      kind: "kv",
      rows: [
        ["Original Invoiced Amount", pdfMoney(cn.originalAmount)],
        ["Cancellation Fee", pdfMoney(cn.cancellationFee)],
        ["GST Adjustment", pdfMoney(cn.gstAdjusted)],
        ["Refundable Amount", pdfMoney(cn.refundAmount)],
        ["Reason for Cancellation", cn.reason],
      ],
    },
    {
      kind: "text",
      text: "Note: This credit note is issued in accordance with GST statutory requirements for booking cancellation and service fee adjustment. Refund processing is initiated within 3-5 business days to the original payment source.",
    },
  ];

  return renderPdf(`CREDIT NOTE — ${cn._id}`, `Linked to Invoice ${cn.invoiceId}`, blocks);
}
