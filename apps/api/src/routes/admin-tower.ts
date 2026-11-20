import { Router } from "express";
import { z } from "zod";
import {
  LEAD_STATUSES, LEAD_TRANSITIONS, adminLeadCreateInput, bookingCreateInput, bookingRescheduleInput, dayMs, fromDay,
  overrideInput, quoteCreateInput, quoteUpdateInput, toDay, todayIST, workOrderInput,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { withTransaction } from "../lib/tx.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { AvailabilityBlock, AvailabilityRequest } from "../models/availability.js";
import { Booking, BookingHistory, LeadAssignment, Override, Quote, WorkOrder } from "../models/booking.js";
import { Client, Vendor } from "../models/foundation.js";
import { DuplicateFlag, Inventory, type InventoryDoc } from "../models/inventory.js";
import { Lead } from "../models/lead.js";
import { bookItems, releaseBookingBlocks } from "../services/availability.js";
import { overdueSlots, startExecution } from "../services/execution.js";
import { syncPayables } from "../services/finance.js";
import { Issue, Proof } from "../models/execution.js";
import { toPublic } from "../services/inventory.js";
import { createQuote, effectiveStatus, quoteView, releaseQuote, reviseQuote, updateDraft, type QuoteDoc } from "../services/quotes.js";
import { bookingView, workOrderView, type BookingDoc } from "./deals.js";

type LeadDoc = { _id: string; source: string; status: string; clientId?: string | null; inventoryIds: string[]; city?: string | null; from: Date; to: Date; qty: number; budget?: number | null; requirement: string; contact?: unknown; createdAt: Date; updatedAt: Date };

export async function setLeadStatus(leadId: string, from: string, to: string) {
  const allowed = (LEAD_TRANSITIONS as Record<string, readonly string[]>)[from] ?? [];
  if (!allowed.includes(to)) throw new AppError(409, "INVALID_TRANSITION", `A lead can't go from ${from} to ${to}`);
  await Lead.updateOne({ _id: leadId, status: from as never }, { $set: { status: to as never } });
}

/** Module 3 + 6: everything Admin does between an inquiry and a work order. */
export function adminTowerRoutes(cfg: Config) {
  const r = Router();

  /* ---------- Leads ---------- */
  r.post("/leads", requirePermission("leads.assign"), validateBody(adminLeadCreateInput), async (req, res) => {
    const input = req.body as z.infer<typeof adminLeadCreateInput>;
    if (toDay(input.to) < toDay(input.from)) throw badRequest("End date must be on or after the start date");
    if (input.clientId && !(await Client.exists({ _id: input.clientId }))) throw notFound("Client not found");
    const leadId = await nextId("LD");
    const lead = await Lead.create({
      _id: leadId, source: input.source, clientId: input.clientId ?? null, createdBy: req.user!.userId, inventoryIds: input.inventoryIds,
      city: input.city ?? null, from: new Date(toDay(input.from)), to: new Date(toDay(input.to)), budget: input.budget ?? null,
      requirement: input.requirement, status: "new", contact: input.contact,
    });
    await audit(req, { action: "lead.create", entity: "lead", entityId: leadId, after: { source: input.source, clientId: input.clientId ?? null } });
    res.status(201).json({ data: { leadId: lead._id, source: lead.source, status: lead.status } });
  });

  r.get("/leads/:id", requirePermission("leads.assign"), async (req, res) => {
    const l = await Lead.findById(String(req.params.id)).lean<LeadDoc>();
    if (!l) throw notFound("Lead not found");
    const [items, assignments, quotes, booking, dups, client] = await Promise.all([
      Inventory.find({ _id: { $in: l.inventoryIds } }).lean<InventoryDoc[]>(),
      LeadAssignment.find({ leadId: l._id }).sort({ assignedAt: -1 }).lean(),
      Quote.find({ leadId: l._id }).sort({ version: -1 }).lean<QuoteDoc[]>(),
      Booking.findOne({ leadId: l._id }).lean<BookingDoc>(),
      DuplicateFlag.find({ entityType: "lead", resolution: "open", $or: [{ entityA: l._id }, { entityB: l._id }] }).lean(),
      l.clientId ? Client.findById(l.clientId).select("_id companyName gstin").lean() : null,
    ]);
    const vendorIds = [...new Set([...items.map((i) => i.vendorId), ...assignments.map((a) => a.vendorId)])];
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select("_id legalName kycStatus city").lean();
    const wos = booking ? await WorkOrder.find({ bookingId: booking._id }).lean() : [];
    res.json({
      data: {
        leadId: l._id, source: l.source, status: l.status, requirement: l.requirement, from: fromDay(l.from.getTime()), to: fromDay(l.to.getTime()), qty: l.qty,
        budget: l.budget ?? null, city: l.city ?? null, contact: l.contact ?? null, client: client ? { clientId: client._id, companyName: client.companyName, gstin: client.gstin } : null,
        createdAt: l.createdAt,
        items: items.map((i) => ({ ...toPublic(i), vendorId: i.vendorId, vendorRate: i.rate, availabilityMode: i.availabilityMode ?? "on_request" })),
        vendors: vendors.map((v) => ({ vendorId: v._id, legalName: v.legalName, kycStatus: v.kycStatus, city: v.city })),
        assignments: assignments.map((a) => ({ vendorId: a.vendorId, status: a.status, assignedBy: a.assignedBy, assignedAt: a.assignedAt, reason: a.reason })),
        quotes: quotes.map((q) => quoteView(q, "admin")),
        booking: booking ? bookingView(booking, "admin") : null,
        workOrders: wos.map((w) => workOrderView(w as never, "admin")),
        possibleDuplicates: dups.map((d) => (d.entityA === l._id ? d.entityB : d.entityA)),
      },
    });
  });

  r.post("/leads/:id/status", requirePermission("leads.assign"), validateBody(z.object({ status: z.enum(["under_review", "lost", "closed"]), reason: z.string().trim().max(1000).optional() })), async (req, res) => {
    const { status, reason } = req.body as { status: "under_review" | "lost" | "closed"; reason?: string };
    if (status !== "under_review" && (!reason || reason.length < 3)) throw badRequest("Give a reason", { fieldErrors: { reason: ["Give a reason"] } });
    const l = await Lead.findById(String(req.params.id)).lean();
    if (!l) throw notFound("Lead not found");
    await setLeadStatus(l._id, l.status, status);
    await audit(req, { action: "lead.status", entity: "lead", entityId: l._id, before: { status: l.status }, after: { status }, reason: reason ?? null });
    res.json({ data: { leadId: l._id, status } });
  });

  /** Assignment only to KYC-approved vendors; every assignment is kept as history. */
  r.post("/leads/:id/assign", requirePermission("leads.assign"), validateBody(z.object({ vendorId: z.string().trim().min(1), note: z.string().trim().max(1000).optional() })), async (req, res) => {
    const { vendorId, note } = req.body as { vendorId: string; note?: string };
    const l = await Lead.findById(String(req.params.id)).lean();
    if (!l) throw notFound("Lead not found");
    const v = await Vendor.findById(vendorId).lean();
    if (!v) throw notFound("Vendor not found");
    if (v.kycStatus !== "approved") {
      await audit(req, { action: "lead.assign.blocked", entity: "lead", entityId: l._id, after: { vendorId, kycStatus: v.kycStatus } });
      throw new AppError(409, "CONFLICT", `${v.legalName} is not an approved vendor (KYC ${v.kycStatus}). Leads can only be assigned to approved vendors.`);
    }
    if (!["new", "under_review", "assigned", "quoted"].includes(l.status)) throw new AppError(409, "INVALID_TRANSITION", `Can't assign a lead that is ${l.status}`);
    if (await LeadAssignment.exists({ leadId: l._id, vendorId, status: "active" })) throw new AppError(409, "CONFLICT", `${v.legalName} is already assigned to this lead`);
    await LeadAssignment.create({ leadId: l._id, vendorId, assignedBy: req.user!.userId, reason: note ?? null });
    if (l.status === "new" || l.status === "under_review") await Lead.updateOne({ _id: l._id }, { $set: { status: "assigned" } });
    await audit(req, { action: "lead.assign", entity: "lead", entityId: l._id, before: { status: l.status }, after: { vendorId, status: l.status === "quoted" ? "quoted" : "assigned" }, reason: note ?? null });
    res.status(201).json({ data: { leadId: l._id, vendorId, status: l.status === "quoted" ? "quoted" : "assigned" } });
  });

  r.delete("/leads/:id/assign/:vendorId", requirePermission("leads.assign"), async (req, res) => {
    const a = await LeadAssignment.findOneAndUpdate({ leadId: String(req.params.id), vendorId: String(req.params.vendorId), status: "active" }, { $set: { status: "removed" } }, { returnDocument: "after" }).lean();
    if (!a) throw notFound("Active assignment not found");
    await audit(req, { action: "lead.unassign", entity: "lead", entityId: a.leadId, after: { vendorId: a.vendorId } });
    res.json({ data: { leadId: a.leadId, vendorId: a.vendorId, status: "removed" } });
  });

  /* ---------- Quotes ---------- */
  r.use("/quotes", requirePermission("quotes.manage"));
  r.get("/quotes", async (req, res) => {
    const q = parseQuery(z.object({ leadId: z.string().trim().optional(), status: z.string().trim().optional() }), req);
    const filter: Record<string, unknown> = {};
    if (q.leadId) filter.leadId = q.leadId;
    if (q.status) filter.status = q.status;
    const items = await Quote.find(filter).sort({ updatedAt: -1 }).limit(200).lean<QuoteDoc[]>();
    res.json({ data: items.map((x) => quoteView(x, "admin")) });
  });
  r.get("/quotes/:id", async (req, res) => {
    const q = await Quote.findById(String(req.params.id)).lean<QuoteDoc>();
    if (!q) throw notFound("Quote not found");
    res.json({ data: quoteView(q, "admin") });
  });
  r.post("/quotes", validateBody(quoteCreateInput), async (req, res) => {
    res.status(201).json({ data: quoteView(await createQuote(req, req.body as z.infer<typeof quoteCreateInput>), "admin") });
  });
  r.patch("/quotes/:id", validateBody(quoteUpdateInput), async (req, res) => {
    res.json({ data: quoteView(await updateDraft(req, String(req.params.id), req.body as z.infer<typeof quoteUpdateInput>), "admin") });
  });
  /** "Approve pricing and release to client." */
  r.post("/quotes/:id/approve", async (req, res) => {
    res.json({ data: quoteView(await releaseQuote(req, cfg, String(req.params.id)), "admin") });
  });
  r.post("/quotes/:id/revise", async (req, res) => {
    res.status(201).json({ data: quoteView(await reviseQuote(req, String(req.params.id)), "admin") });
  });

  /* ---------- Bookings & work orders ---------- */
  r.use("/bookings", requirePermission("quotes.manage"));
  r.get("/bookings", async (_req, res) => {
    const items = await Booking.find({}).sort({ createdAt: -1 }).limit(200).lean<BookingDoc[]>();
    res.json({ data: items.map((b) => bookingView(b, "admin")) });
  });

  /** Booking ID only from a client-approved quote; holds become booked dates in one transaction. */
  r.post("/bookings", validateBody(bookingCreateInput), async (req, res) => {
    const { quoteId } = req.body as { quoteId: string };
    const q = await Quote.findById(quoteId).lean<QuoteDoc>();
    if (!q) throw notFound("Quote not found");
    if (q.status !== "approved") throw new AppError(409, "INVALID_TRANSITION", `A booking can only be created from a client-approved quote (this one is ${effectiveStatus(q)})`);
    if (await Booking.exists({ quoteId })) throw new AppError(409, "CONFLICT", "A booking already exists for this quote");
    const lead = await Lead.findById(q.leadId).lean();
    const booking = await withTransaction(async (session) => {
      const bookingId = await nextId("BK", session);
      const blockIds = await bookItems(req, bookingId, q.items, q.holdIds, session);
      const start = new Date(Math.min(...q.items.map((i) => i.from.getTime())));
      const end = new Date(Math.max(...q.items.map((i) => i.to.getTime())));
      const [b] = await Booking.create([{
        _id: bookingId, quoteId, leadId: q.leadId, clientId: q.clientId ?? null, status: "confirmed", items: q.items, start, end,
        subtotal: q.subtotal, serviceFee: q.serviceFee, gst: q.gst, total: q.total, blockIds, createdBy: req.user!.userId,
      }], { session });
      await BookingHistory.create([{ bookingId, fromStatus: null, toStatus: "confirmed", changedBy: req.user!.userId, reason: `From approved quote ${quoteId}` }], { session });
      if (lead && lead.status === "quoted") await Lead.updateOne({ _id: lead._id }, { $set: { status: "won" } }, { session });
      await audit(req, { action: "booking.create", entity: "booking", entityId: bookingId, after: { quoteId, total: q.total, status: "confirmed" } }, session);
      return b!.toObject() as unknown as BookingDoc;
    });
    await syncPayables(booking._id);
    res.status(201).json({ data: bookingView(booking, "admin") });
  });

  /** One Work Order per vendor on the booking; the vendor sees it immediately. */
  r.post("/bookings/:id/work-order", validateBody(workOrderInput), async (req, res) => {
    const { instructions, creativeNote } = req.body as z.infer<typeof workOrderInput>;
    const b = await Booking.findById(String(req.params.id)).lean<BookingDoc>();
    if (!b) throw notFound("Booking not found");
    if (b.status !== "confirmed") throw new AppError(409, "INVALID_TRANSITION", `Work orders are issued for confirmed bookings (this one is ${b.status})`);
    const existing = await WorkOrder.find({ bookingId: b._id }).lean();
    const vendors = [...new Set(b.items.map((i) => i.vendorId))].filter((v) => !existing.some((w) => w.vendorId === v));
    if (!vendors.length) throw new AppError(409, "CONFLICT", "Work orders have already been issued for every vendor on this booking");
    const created = [];
    for (const vendorId of vendors) {
      const woId = await nextId("WO");
      const w = await WorkOrder.create({ _id: woId, bookingId: b._id, vendorId, items: b.items.filter((i) => i.vendorId === vendorId), instructions, creativeNote: creativeNote ?? null, issuedBy: req.user!.userId });
      await audit(req, { action: "workorder.issue", entity: "work_order", entityId: woId, after: { bookingId: b._id, vendorId, status: "scheduled" } });
      created.push(workOrderView(w.toObject() as never, "admin"));
    }
    const campaignId = await startExecution(b._id, created.map((w) => w.workOrderId));
    await audit(req, { action: "campaign.start", entity: "campaign", entityId: campaignId, after: { bookingId: b._id, workOrders: created.map((w) => w.workOrderId) } });
    res.status(201).json({ data: created });
  });

  /** Reschedule: shift every item by the same number of days, subject to availability (transactional). */
  r.post("/bookings/:id/reschedule", validateBody(bookingRescheduleInput), async (req, res) => {
    const { newFrom, reason } = req.body as z.infer<typeof bookingRescheduleInput>;
    const b = await Booking.findById(String(req.params.id)).lean<BookingDoc>();
    if (!b) throw notFound("Booking not found");
    if (b.status !== "confirmed") throw new AppError(409, "INVALID_TRANSITION", "Only confirmed bookings that haven't started can be rescheduled");
    if (toDay(fromDay(b.start.getTime())) <= toDay(todayIST())) throw new AppError(409, "CONFLICT", "The campaign has already started");
    if (toDay(newFrom) < toDay(todayIST())) throw badRequest("New start date can't be in the past");
    const shift = toDay(newFrom) - b.start.getTime();
    const items = b.items.map((i) => ({ ...i, from: new Date(i.from.getTime() + shift), to: new Date(i.to.getTime() + shift) }));
    const out = await withTransaction(async (session) => {
      await releaseBookingBlocks(req, b._id, `Rescheduled to ${newFrom}`, session);
      const blockIds = await bookItems(req, b._id, items, [], session);
      const after = await Booking.findOneAndUpdate({ _id: b._id }, { $set: { items, start: new Date(b.start.getTime() + shift), end: new Date(b.end.getTime() + shift), blockIds } }, { returnDocument: "after", session }).lean<BookingDoc>();
      // Each work order carries only its own vendor's items, now with the shifted dates.
      for (const w of await WorkOrder.find({ bookingId: b._id, status: "scheduled" }).session(session).lean()) {
        await WorkOrder.updateOne({ _id: w._id }, { $set: { items: items.filter((i) => i.vendorId === w.vendorId) } }, { session });
      }
      await BookingHistory.create([{ bookingId: b._id, fromStatus: b.status, toStatus: b.status, changedBy: req.user!.userId, reason: `Rescheduled from ${fromDay(b.start.getTime())} to ${newFrom}: ${reason}` }], { session });
      await audit(req, { action: "booking.reschedule", entity: "booking", entityId: b._id, before: { start: fromDay(b.start.getTime()) }, after: { start: newFrom, days: shift / dayMs }, reason }, session);
      return after!;
    });
    res.json({ data: bookingView(out, "admin") });
  });

  /* ---------- Overrides (reason mandatory, permanently logged) ---------- */
  r.post("/overrides", requirePermission("overrides.create"), validateBody(overrideInput), async (req, res) => {
    const o = req.body as z.infer<typeof overrideInput>;
    let oldValue: unknown;
    if (o.entity === "lead" && o.field === "status") {
      if (!(LEAD_STATUSES as readonly string[]).includes(o.newValue)) throw badRequest(`Status must be one of ${LEAD_STATUSES.join(", ")}`);
      const l = await Lead.findById(o.entityId).lean();
      if (!l) throw notFound("Lead not found");
      oldValue = l.status;
      await Lead.updateOne({ _id: l._id }, { $set: { status: o.newValue } });
    } else if (o.entity === "quote" && o.field === "validUntil") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.newValue) || toDay(o.newValue) < toDay(todayIST())) throw badRequest("New validity must be today or later (YYYY-MM-DD)");
      const q = await Quote.findById(o.entityId).lean<QuoteDoc>();
      if (!q) throw notFound("Quote not found");
      if (!["released", "expired"].includes(effectiveStatus(q))) throw new AppError(409, "CONFLICT", "Only released or expired quotes can have their validity extended");
      oldValue = fromDay(q.validUntil.getTime());
      await Quote.updateOne({ _id: q._id }, { $set: { validUntil: new Date(toDay(o.newValue)), status: "released" } });
    } else {
      throw badRequest(`Override of ${o.entity}.${o.field} is not supported`);
    }
    const row = await Override.create({ entity: o.entity, entityId: o.entityId, field: o.field, oldValue, newValue: o.newValue, reason: o.reason, adminUserId: req.user!.userId });
    await audit(req, { action: "override", entity: o.entity, entityId: o.entityId, before: { [o.field]: oldValue }, after: { [o.field]: o.newValue }, reason: o.reason });
    res.status(201).json({ data: { overrideId: String(row._id), entity: o.entity, entityId: o.entityId, field: o.field, oldValue, newValue: o.newValue } });
  });

  r.get("/overrides", requirePermission("overrides.create"), async (_req, res) => {
    const rows = await Override.find({}).sort({ at: -1 }).limit(200).lean();
    res.json({ data: rows.map(({ _id, ...o }) => ({ overrideId: String(_id), ...o })) });
  });

  /* ---------- Dashboard: every count is a plain query a list view can reproduce ---------- */
  r.get("/dashboard", requirePermission("leads.assign"), async (_req, res) => {
    const now = new Date();
    const today = new Date(toDay(todayIST()));
    const [leadCounts, released, approvedNoBooking, bookingCounts, activeHolds, pendingVendor, kycPending, listingsPending, dupOpen, staleLeads, holdsExpiring, expiredQuotes] = await Promise.all([
      Lead.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
      Quote.countDocuments({ status: "released", validUntil: { $gte: today } }),
      Quote.countDocuments({ status: "approved", _id: { $nin: (await Booking.find({}).select("quoteId").lean()).map((b) => b.quoteId) } }),
      Booking.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
      AvailabilityBlock.countDocuments({ kind: "hold", status: { $in: ["held", "pending_vendor"] }, expiresAt: { $gt: now } }),
      AvailabilityRequest.countDocuments({ status: "pending", respondBy: { $gt: now } }),
      Vendor.countDocuments({ kycStatus: "pending" }),
      Inventory.countDocuments({ status: "pending" }),
      DuplicateFlag.countDocuments({ resolution: "open" }),
      Lead.countDocuments({ status: "new", createdAt: { $lt: new Date(now.getTime() - 24 * 3600_000) } }),
      AvailabilityBlock.countDocuments({ kind: "hold", status: { $in: ["held", "pending_vendor"] }, expiresAt: { $gt: now, $lt: new Date(now.getTime() + 12 * 3600_000) } }),
      Quote.countDocuments({ status: "released", validUntil: { $lt: today } }),
    ]);
    const [proofsToVerify, overdueProofs, openIssues] = await Promise.all([Proof.countDocuments({ status: "uploaded" }), overdueSlots().then((x) => x.length), Issue.countDocuments({ status: { $ne: "resolved" } })]);
    const by = (rows: { _id: string; n: number }[]) => Object.fromEntries(rows.map((x) => [x._id, x.n]));
    res.json({
      data: {
        leads: by(leadCounts), bookings: by(bookingCounts),
        quotesAwaitingClient: released, approvedQuotesWithoutBooking: approvedNoBooking,
        activeHolds, pendingVendorConfirmations: pendingVendor,
        pendingApprovals: { vendorKyc: kycPending, listings: listingsPending, duplicates: dupOpen },
        exceptions: { staleLeads, holdsExpiringSoon: holdsExpiring, expiredQuotes, overdueProofs },
        proofsToVerify, openIssues,
        generatedAt: now,
      },
    });
  });

  return r;
}

