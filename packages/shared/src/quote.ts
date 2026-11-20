import { z } from "zod";
import { PRICING_UNITS, type PricingUnit } from "./inventory";
import { daysInclusive, isoDate, toDay } from "./availability";

/** Module 6 — quotation & booking rules. Totals are always computed with these functions on the server. */
export const GST_PCT = 18; // shown as CGST 9% + SGST 9%
export const DEFAULT_SERVICE_FEE_PCT = 5;
export const DEFAULT_QUOTE_VALIDITY_DAYS = 7;

/** Default billable units for a date range, by pricing unit (admin may override per line). */
export function defaultBillableUnits(unit: PricingUnit, from: string, to: string, attributes: Record<string, unknown> = {}) {
  const days = daysInclusive(from, to);
  switch (unit) {
    case "per_month":
    case "per_vehicle_month":
      return Math.round((days / 30) * 100) / 100;
    case "per_day":
    case "per_slot": // one slot in every loop, per day
      return days;
    case "per_sqft":
      return Math.max(1, Number(attributes["widthFt"] ?? 0) * Number(attributes["heightFt"] ?? 0));
    case "per_impression_block":
      return 1;
  }
}

export type QuoteLineInput = { rate: number; qty: number; billableUnits: number; production: number; installation: number };
const r2 = (n: number) => Math.round(n * 100) / 100;
const rupee = (n: number) => Math.round(n);

/** Itemised totals: media (rate × qty × billable units) + production + installation, platform fee as its own line, then GST. */
export function computeQuoteTotals(lines: QuoteLineInput[], serviceFeePct = DEFAULT_SERVICE_FEE_PCT) {
  const items = lines.map((l) => {
    const media = rupee(l.rate * l.qty * l.billableUnits);
    const production = rupee(l.production);
    const installation = rupee(l.installation);
    return { media, production, installation, lineTotal: media + production + installation };
  });
  const mediaTotal = items.reduce((a, i) => a + i.media, 0);
  const productionTotal = items.reduce((a, i) => a + i.production, 0);
  const installationTotal = items.reduce((a, i) => a + i.installation, 0);
  const subtotal = mediaTotal + productionTotal + installationTotal;
  const serviceFee = rupee((subtotal * serviceFeePct) / 100);
  const taxable = subtotal + serviceFee;
  const cgst = rupee((taxable * GST_PCT) / 200);
  const sgst = rupee((taxable * GST_PCT) / 200);
  return { items, mediaTotal, productionTotal, installationTotal, subtotal, serviceFeePct: r2(serviceFeePct), serviceFee, taxable, cgst, sgst, gst: cgst + sgst, total: taxable + cgst + sgst, currency: "INR" as const };
}
export type QuoteTotals = ReturnType<typeof computeQuoteTotals>;

/* ---------- Statuses (MVP doc §6) ---------- */
/** Draft → Released → Approved | Rejected | Revision Requested → (new version); Released → Expired. Superseded = an older version after a revision. */
export const QUOTE_STATUSES = ["draft", "released", "approved", "rejected", "revision_requested", "expired", "superseded"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
/** Draft → Confirmed → Live → Completed → Closed; Draft/Confirmed → Cancelled. */
export const BOOKING_STATUSES = ["draft", "confirmed", "live", "completed", "closed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ["confirmed", "cancelled"], confirmed: ["live", "cancelled"], live: ["completed"], completed: ["closed"], closed: [], cancelled: [],
};
/** Scheduled → Installed/Live → Inspection Due → Completed; any → Issue Raised → (previous). Execution updates arrive with Module 7. */
export const WORK_ORDER_STATUSES = ["scheduled", "installed", "inspection_due", "completed", "issue_raised", "cancelled"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const LEAD_TRANSITIONS = {
  new: ["under_review", "closed"], under_review: ["assigned", "closed", "lost"], assigned: ["assigned", "quoted", "closed", "lost"],
  quoted: ["quoted", "won", "lost", "closed"], won: ["closed"], lost: [], closed: [],
} as const;

/* ---------- Cancellation fee schedule (applied by the system) ---------- */
/** Fee as % of the booking total, by days between the cancellation date and campaign start. First matching rule wins. */
export const CANCELLATION_RULES = [
  { minDaysBefore: 30, feePct: 10, label: "30+ days before start: 10% fee" },
  { minDaysBefore: 15, feePct: 25, label: "15–29 days before start: 25% fee" },
  { minDaysBefore: 7, feePct: 50, label: "7–14 days before start: 50% fee" },
  { minDaysBefore: -Infinity, feePct: 100, label: "Less than 7 days before start or already started: no refund" },
] as const;
export function cancellationFor(total: number, startDate: string, cancelDate: string) {
  const daysBefore = Math.round((toDay(startDate) - toDay(cancelDate)) / 86_400_000);
  const rule = CANCELLATION_RULES.find((r) => daysBefore >= r.minDaysBefore)!;
  const fee = Math.round((total * rule.feePct) / 100);
  return { daysBefore, feePct: rule.feePct, rule: rule.label, fee, refundable: total - fee };
}

/* ---------- Inputs ---------- */
const money = (msg: string) => z.coerce.number({ error: msg }).min(0, msg).max(1e10);
export const quoteItemInput = z.object({
  inventoryId: z.string().trim().min(1),
  from: isoDate, to: isoDate,
  qty: z.coerce.number().int().min(1).max(10000).default(1),
  /** Client rate per pricing unit (defaults to the listing's indicative price). */
  rate: money("Enter the client rate").refine((n) => n > 0, "Rate must be more than 0").optional(),
  billableUnits: z.coerce.number().positive().max(100000).optional(),
  production: money("Enter production cost").default(0),
  installation: money("Enter installation cost").default(0),
  /** Vendor cost for this line — private to Admin/Finance; used for margin and the vendor payable. */
  vendorCost: money("Enter vendor cost").optional(),
  description: z.string().trim().max(300).optional(),
}).refine((v) => toDay(v.to) >= toDay(v.from), { path: ["to"], message: "End date must be on or after the start date" });

export const quoteCreateInput = z.object({
  leadId: z.string().trim().min(1),
  validUntil: isoDate.optional(),
  serviceFeePct: z.coerce.number().min(0).max(50).default(DEFAULT_SERVICE_FEE_PCT),
  items: z.array(quoteItemInput).min(1, "Add at least one media item").max(20),
  terms: z.string().trim().max(3000).optional(),
});
export const quoteUpdateInput = quoteCreateInput.omit({ leadId: true }).partial();
export const quoteDecisionInput = z.object({
  decision: z.enum(["approve", "reject", "revise"]),
  comment: z.string().trim().max(2000).optional(),
}).refine((v) => v.decision === "approve" || (v.comment && v.comment.length >= 3), { path: ["comment"], message: "Tell us why (at least 3 characters)" });

export const leadAssignInput = z.object({ vendorId: z.string().trim().min(1), note: z.string().trim().max(1000).optional() });
export const leadStatusInput = z.object({ status: z.enum(["under_review", "lost", "closed"]), reason: z.string().trim().max(1000).optional() })
  .refine((v) => v.status === "under_review" || (v.reason && v.reason.length >= 3), { path: ["reason"], message: "Give a reason" });
export const adminLeadCreateInput = z.object({
  source: z.enum(["phone", "whatsapp", "growth_partner", "agency", "other"]),
  clientId: z.string().trim().optional(),
  contact: z.object({ name: z.string().trim().min(2).max(120), company: z.string().trim().max(160).optional(), email: z.string().trim().email().optional(), mobile: z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Enter a valid mobile number") }),
  inventoryIds: z.array(z.string().trim()).max(20).default([]),
  city: z.string().trim().max(80).optional(),
  from: isoDate, to: isoDate,
  budget: z.coerce.number().positive().optional(),
  requirement: z.string().trim().min(10, "Describe the requirement (at least 10 characters)").max(3000),
});
export const bookingCreateInput = z.object({ quoteId: z.string().trim().min(1) });
export const workOrderInput = z.object({ instructions: z.string().trim().min(5, "Add campaign instructions").max(5000), creativeNote: z.string().trim().max(2000).optional() });
export const bookingCancelInput = z.object({ reason: z.string().trim().min(3, "Give a reason").max(1000) });
export const bookingRescheduleInput = z.object({ newFrom: isoDate, reason: z.string().trim().min(3, "Give a reason").max(1000) });
export const overrideInput = z.object({
  entity: z.enum(["lead", "quote"]),
  entityId: z.string().trim().min(1),
  field: z.enum(["status", "validUntil"]),
  newValue: z.string().trim().min(1).max(40),
  reason: z.string({ error: "A reason is required for every override" }).trim().min(5, "A reason is required for every override (at least 5 characters)").max(1000),
});

export { PRICING_UNITS };
