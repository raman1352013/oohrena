import { Router } from "express";
import { fromDay, partnerLeadInput, todayIST, type PartnerLeadInput } from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { requirePermission } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { Booking, Quote } from "../models/booking.js";
import { Lead } from "../models/lead.js";
import { notify } from "../services/notifications.js";

/** Module 10 / B.7: Growth Partner portal routes. */
export function partnerRoutes(cfg: Config) {
  const r = Router();

  /** Submit a new lead brought by this Growth Partner. */
  r.post("/leads", requirePermission("leads.create"), validateBody(partnerLeadInput), async (req, res) => {
    const input = req.body as PartnerLeadInput;
    let partnerId = req.user!.orgId;
    if (req.user!.role !== "growth_partner") {
      partnerId = (req.query.partnerId as string) || partnerId;
    }
    if (!partnerId) throw forbidden("No partner profile associated with this account");

    const fromDate = input.startDate ? new Date(input.startDate) : new Date(todayIST());
    const toDate = input.endDate ? new Date(input.endDate) : new Date(Date.now() + 30 * 86400_000);

    const leadId = await nextId("LD");
    const lead = await Lead.create({
      _id: leadId,
      source: "growth_partner",
      partnerId,
      createdBy: req.user!.userId,
      requirement: input.requirement,
      city: input.city,
      budget: input.budget ?? null,
      from: fromDate,
      to: toDate,
      status: "new",
      contact: {
        name: input.clientName,
        email: input.clientEmail ?? "",
        mobile: input.clientMobile,
      },
    });

    await audit(req, {
      action: "partner.lead_created",
      entity: "lead",
      entityId: leadId,
      after: { leadId, partnerId, clientName: input.clientName, city: input.city },
    });

    await notify(
      "lead.created",
      [{ userId: req.user!.userId, email: input.clientEmail ?? req.user!.email }],
      { leadId, requirement: input.requirement, clientName: input.clientName },
    );

    res.status(201).json({
      data: {
        leadId: lead._id,
        status: lead.status,
        clientName: input.clientName,
        requirement: lead.requirement,
        city: lead.city,
        createdAt: lead.createdAt,
      },
    });
  });

  /** List leads brought by this Growth Partner (own only for growth partners). */
  r.get("/leads", requirePermission("leads.read"), async (req, res) => {
    const filter: Record<string, unknown> = { source: "growth_partner" };
    if (req.user!.role === "growth_partner") {
      if (!req.user!.orgId) throw forbidden("No partner profile found");
      filter.partnerId = req.user!.orgId;
    } else if (req.query.partnerId) {
      filter.partnerId = req.query.partnerId;
    }

    const leads = await Lead.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    const leadIds = leads.map((l) => l._id);

    const [quotes, bookings] = await Promise.all([
      Quote.find({ leadId: { $in: leadIds } }).select("_id leadId status total").lean(),
      Booking.find({ leadId: { $in: leadIds } }).select("_id leadId status total subtotal start end").lean(),
    ]);

    const items = leads.map((l) => {
      const q = quotes.filter((item) => item.leadId === l._id);
      const b = bookings.find((item) => item.leadId === l._id);
      return {
        leadId: l._id,
        status: l.status,
        requirement: l.requirement,
        city: l.city,
        budget: l.budget,
        clientName: l.contact?.name ?? null,
        clientMobile: l.contact?.mobile ?? null,
        from: l.from,
        to: l.to,
        createdAt: l.createdAt,
        quotesCount: q.length,
        booking: b ? { bookingId: b._id, status: b.status, total: b.total, subtotal: b.subtotal } : null,
      };
    });

    res.json({ data: items });
  });

  /** Get earnings summary and breakdown for Growth Partners (own for GP; all/filtered for admin & finance). */
  r.get("/earnings", requirePermission("partner.earnings.read"), async (req, res) => {
    const filter: Record<string, unknown> = { source: "growth_partner" };
    let partnerId = req.user!.orgId;
    if (req.user!.role === "growth_partner") {
      if (!partnerId) throw forbidden("No partner profile found");
      filter.partnerId = partnerId;
    } else if (req.query.partnerId) {
      partnerId = req.query.partnerId as string;
      filter.partnerId = partnerId;
    }

    const leads = await Lead.find(filter).select("_id contact requirement").lean();
    const leadMap = new Map(leads.map((l) => [l._id, l]));
    const leadIds = Array.from(leadMap.keys());

    const bookings = await Booking.find({ leadId: { $in: leadIds } }).lean();

    const commissionPct = cfg.PARTNER_COMMISSION_PCT;
    let totalBookingValue = 0;
    let earnedCommission = 0;
    let pendingCommission = 0;

    const breakdown = bookings.map((b) => {
      const bVal = b.subtotal ?? b.total ?? 0;
      totalBookingValue += bVal;
      const commission = Math.round((bVal * commissionPct) / 100);

      // Earned when booking is completed/live; pending when confirmed/booked
      const isEarned = ["completed", "live"].includes(b.status);
      if (isEarned) {
        earnedCommission += commission;
      } else if (b.status === "confirmed") {
        pendingCommission += commission;
      }

      const l = leadMap.get(b.leadId);
      return {
        bookingId: b._id,
        leadId: b.leadId,
        clientName: l?.contact?.name ?? "Client",
        status: b.status,
        bookingValue: bVal,
        commissionPct,
        commissionAmount: commission,
        earned: isEarned,
      };
    });

    res.json({
      data: {
        partnerId,
        commissionRatePct: commissionPct,
        totalLeads: leads.length,
        convertedBookings: bookings.length,
        totalBookingValue,
        earnedCommission,
        pendingCommission,
        breakdown,
      },
    });
  });

  return r;
}
