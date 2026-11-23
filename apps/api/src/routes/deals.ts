import { Router } from "express";
import type { z } from "zod";
import { BOOKING_TRANSITIONS, bookingCancelInput, cancellationFor, fromDay, quoteDecisionInput, todayIST, type BookingStatus } from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { AppError, forbidden, notFound } from "../lib/errors.js";
import { withTransaction } from "../lib/tx.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { currentVendor } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { Booking, BookingHistory, Quote, WorkOrder } from "../models/booking.js";
import { Campaign } from "../models/execution.js";
import { CreditNote, Invoice } from "../models/finance.js";
import { Client } from "../models/foundation.js";
import { nextId } from "../lib/ids.js";
import { releaseBookingBlocks } from "../services/availability.js";
import { clientDecision, quoteView, renderQuotePdf, type QuoteDoc } from "../services/quotes.js";
import { syncPayables } from "../services/finance.js";

type Item = QuoteDoc["items"][number];
export type BookingDoc = {
  _id: string; quoteId: string; leadId: string; clientId?: string | null; status: string; items: Item[]; start: Date; end: Date;
  subtotal: number; serviceFee: number; gst: number; total: number; blockIds: string[]; cancellation?: Record<string, unknown> | null; createdAt: Date; updatedAt: Date;
};
type WorkOrderDoc = { _id: string; bookingId: string; vendorId: string; items: Item[]; instructions: string; creativeNote?: string | null; creatives?: { fileId: string; name: string; mime: string; size: number; uploadedAt: Date }[]; status: string; issuedAt: Date; acknowledgedAt?: Date | null };

const itemView = (i: Item, audience: "admin" | "client" | "vendor") => ({
  inventoryId: i.inventoryId, title: i.title, category: i.category, city: i.city, from: fromDay(i.from.getTime()), to: fromDay(i.to.getTime()), qty: i.qty,
  ...(audience !== "vendor" ? { rate: i.rate, billableUnits: i.billableUnits, media: i.media, production: i.production, installation: i.installation, lineTotal: i.lineTotal } : {}),
  ...(audience === "admin" ? { vendorId: i.vendorId, vendorCost: i.vendorCost } : {}),
});

export function bookingView(b: BookingDoc, audience: "admin" | "client") {
  return {
    bookingId: b._id, quoteId: b.quoteId, leadId: b.leadId, status: b.status, start: fromDay(b.start.getTime()), end: fromDay(b.end.getTime()),
    items: b.items.map((i) => itemView(i, audience)), subtotal: b.subtotal, serviceFee: b.serviceFee, gst: b.gst, total: b.total,
    cancellation: b.cancellation ?? null, createdAt: b.createdAt, updatedAt: b.updatedAt,
    ...(audience === "admin" ? { clientId: b.clientId ?? null } : {}),
  };
}

/** Vendors see campaign details for their own items only — no client price, client identity or other vendors. */
export function workOrderView(w: WorkOrderDoc, audience: "admin" | "client" | "vendor") {
  return {
    workOrderId: w._id, bookingId: w.bookingId, status: w.status, instructions: w.instructions, creativeNote: w.creativeNote ?? null,
    creatives: (w.creatives ?? []).map((c) => ({ fileId: c.fileId, name: c.name, mime: c.mime, size: c.size, uploadedAt: c.uploadedAt })),
    items: w.items.map((i) => itemView(i, audience === "client" ? "client" : audience)),
    issuedAt: w.issuedAt, acknowledgedAt: w.acknowledgedAt ?? null,
    ...(audience === "admin" ? { vendorId: w.vendorId } : {}),
  };
}

/** Client-facing quotes, bookings and work orders, plus cancellation (admin or owning client). */
export function dealRoutes() {
  const r = Router();

  /* ---------- Quotes (client) ---------- */
  r.get("/quotes", requirePermission("quotes.decide"), async (req, res) => {
    const items = await Quote.find({ clientId: req.user!.orgId, status: { $ne: "draft" } }).sort({ quoteNo: -1, version: -1 }).limit(200).lean<QuoteDoc[]>();
    res.json({ data: items.map((q) => quoteView(q, "client")) });
  });
  /** Client sees every non-draft version of their own quotes; Admin/Finance sees all. format=pdf returns printable PDF. Another client's ID → 404. */
  r.get("/quotes/:id", requireAuth, async (req, res) => {
    const role = req.user!.role;
    let q: QuoteDoc | null = null;
    if (role === "admin" || role === "finance") {
      q = await Quote.findById(String(req.params.id)).lean<QuoteDoc>();
    } else if (role === "client") {
      q = await Quote.findOne({ _id: String(req.params.id), clientId: req.user!.orgId, status: { $ne: "draft" } }).lean<QuoteDoc>();
    }
    if (!q) throw notFound("Quote not found");

    if (req.query.format === "pdf") {
      await audit(req, { action: "quote.export.pdf", entity: "quote", entityId: q._id });
      const client = q.clientId ? await Client.findById(q.clientId).lean() : null;
      const pdf = await renderQuotePdf(q, client);
      res.setHeader("Content-Disposition", `inline; filename="quote-${q._id}.pdf"`);
      return res.type("application/pdf").send(pdf);
    }

    const versions = await Quote.find({ quoteNo: q.quoteNo, ...(role === "client" ? { status: { $ne: "draft" } } : {}) }).sort({ version: 1 }).select("_id version status validUntil total").lean();
    res.json({ data: { ...quoteView(q, role === "admin" ? "admin" : "client"), versions: versions.map((v) => ({ quoteId: v._id, version: v.version, status: v.status, total: v.total })) } });
  });
  r.post("/quotes/:id/decision", requirePermission("quotes.decide"), validateBody(quoteDecisionInput), async (req, res) => {
    const { decision, comment } = req.body as z.infer<typeof quoteDecisionInput>;
    res.json({ data: quoteView(await clientDecision(req, String(req.params.id), decision, comment), "client") });
  });

  /* ---------- Bookings ---------- */
  r.get("/bookings", requireAuth, async (req, res) => {
    if (req.user!.role !== "client") throw forbidden();
    const items = await Booking.find({ clientId: req.user!.orgId }).sort({ createdAt: -1 }).lean<BookingDoc[]>();
    const campaigns = await Campaign.find({ bookingId: { $in: items.map((b) => b._id) } }).select("_id bookingId").lean();
    const cmpMap = new Map(campaigns.map((c) => [c.bookingId, c._id]));
    res.json({ data: items.map((b) => ({ ...bookingView(b, "client"), campaignId: cmpMap.get(b._id) ?? null })) });
  });
  /** Status and timeline, role-scoped: Admin all, client own; anyone else 404. */
  r.get("/bookings/:id", requireAuth, async (req, res) => {
    const b = await Booking.findById(String(req.params.id)).lean<BookingDoc>();
    const role = req.user!.role;
    if (!b || !(role === "admin" || (role === "client" && b.clientId === req.user!.orgId))) throw notFound("Booking not found");
    const [history, wos] = await Promise.all([BookingHistory.find({ bookingId: b._id }).sort({ at: 1 }).lean(), WorkOrder.find({ bookingId: b._id }).lean<WorkOrderDoc[]>()]);
    const audience = role === "admin" ? "admin" : "client";
    res.json({ data: { ...bookingView(b, audience), history: history.map(({ _id, ...h }) => h), workOrders: wos.map((w) => workOrderView(w, audience)) } });
  });

  /** Cancellation with the system fee schedule; dates are released and open work orders cancelled. */
  r.post("/bookings/:id/cancel", requireAuth, validateBody(bookingCancelInput), async (req, res) => {
    const { reason } = req.body as z.infer<typeof bookingCancelInput>;
    const b = await Booking.findById(String(req.params.id)).lean<BookingDoc>();
    const role = req.user!.role;
    if (!b || !(role === "admin" || (role === "client" && b.clientId === req.user!.orgId))) throw notFound("Booking not found");
    if (!BOOKING_TRANSITIONS[b.status as BookingStatus].includes("cancelled")) throw new AppError(409, "INVALID_TRANSITION", `A ${b.status} booking can't be cancelled`);
    const today = todayIST();
    const c = cancellationFor(b.total, fromDay(b.start.getTime()), today);
    const cancellation = { at: new Date(), by: req.user!.userId, reason, ...c };
    const out = await withTransaction(async (session) => {
      await releaseBookingBlocks(req, b._id, `Booking cancelled: ${reason}`, session);
      const after = await Booking.findOneAndUpdate({ _id: b._id, status: b.status as BookingStatus }, { $set: { status: "cancelled", cancellation } }, { returnDocument: "after", session }).lean<BookingDoc>();
      if (!after) throw new AppError(409, "CONFLICT", "Booking changed while cancelling; refresh and try again");
      await WorkOrder.updateMany({ bookingId: b._id, status: { $in: ["scheduled", "issue_raised"] } }, { $set: { status: "cancelled" } }, { session });
      await BookingHistory.create([{ bookingId: b._id, fromStatus: b.status, toStatus: "cancelled", changedBy: req.user!.userId, reason: `${reason} — ${c.rule}` }], { session });

      const inv = await Invoice.findOne({ bookingId: b._id }).session(session);
      if (inv) {
        const crnId = await nextId("CRN");
        await CreditNote.create(
          [
            {
              _id: crnId,
              invoiceId: inv._id,
              bookingId: b._id,
              clientId: b.clientId ?? null,
              originalAmount: inv.total,
              cancellationFee: c.fee,
              refundAmount: c.refundable,
              gstAdjusted: Math.round((c.fee * 18) / 118),
              reason: `${reason} (${c.rule})`,
              ruleApplied: c.rule,
              issuedAt: new Date(),
              issuedBy: req.user!.userId,
            },
          ],
          { session },
        );
        await Invoice.updateOne({ _id: inv._id }, { $set: { status: "cancelled" } }, { session });
        await audit(req, { action: "credit_note.issue", entity: "credit_note", entityId: crnId, after: { invoiceId: inv._id, refundAmount: c.refundable, fee: c.fee } }, session);
      }

      await audit(req, { action: "booking.cancel", entity: "booking", entityId: b._id, before: { status: b.status }, after: { status: "cancelled", ...c }, reason }, session);
      return after;
    });
    await syncPayables(b._id);
    res.json({ data: bookingView(out, role === "admin" ? "admin" : "client") });
  });

  /* ---------- Work orders ---------- */
  /** Assigned vendor, Admin, or the booking's client (view). Everyone else 404. */
  r.get("/work-orders/:id", requireAuth, async (req, res) => {
    const w = await WorkOrder.findById(String(req.params.id)).lean<WorkOrderDoc>();
    const u = req.user!;
    if (!w) throw notFound("Work order not found");
    if (u.role === "admin") return res.json({ data: workOrderView(w, "admin") });
    if (u.role === "vendor" && u.orgId === w.vendorId) return res.json({ data: workOrderView(w, "vendor") });
    if (u.role === "client" && (await Booking.exists({ _id: w.bookingId, clientId: u.orgId }))) return res.json({ data: workOrderView(w, "client") });
    throw notFound("Work order not found");
  });

  r.post("/work-orders/:id/acknowledge", requirePermission("availability.respond"), async (req, res) => {
    const v = await currentVendor(req);
    const w = await WorkOrder.findOneAndUpdate(
      { _id: String(req.params.id), vendorId: v._id, acknowledgedAt: null, status: "scheduled" },
      { $set: { acknowledgedAt: new Date(), acknowledgedBy: req.user!.userId } },
      { returnDocument: "after" },
    ).lean<WorkOrderDoc>();
    if (!w) throw notFound("Open work order not found");
    await audit(req, { action: "workorder.acknowledge", entity: "work_order", entityId: w._id, after: { acknowledgedAt: w.acknowledgedAt } });
    res.json({ data: workOrderView(w, "vendor") });
  });

  return r;
}

/** GET /vendors/me/work-orders — assigned work orders only. */
export function vendorWorkOrderRoutes() {
  const r = Router();
  r.get("/", requirePermission("workorders.read"), async (req, res) => {
    const v = await currentVendor(req);
    const items = await WorkOrder.find({ vendorId: v._id }).sort({ issuedAt: -1 }).limit(200).lean<WorkOrderDoc[]>();
    res.json({ data: items.map((w) => workOrderView(w, "vendor")) });
  });
  return r;
}
