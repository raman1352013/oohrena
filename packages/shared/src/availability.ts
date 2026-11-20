import { z } from "zod";
import { CATEGORY_IDS, categoryDef } from "./inventory";

/** Module 5 — availability. Per-day capacity model:
 *  fixed-period media (hoarding, unipole, wall wrap, railway/metro): capacity = quantity, minimum period applies;
 *  LED screens: capacity = slots per loop (loop length ÷ slot length) × quantity;
 *  vehicle fleets: capacity = number of vehicles (quantity). */
export const AVAILABILITY_STATES = ["available", "hold", "pending_vendor", "booked", "blocked", "expired"] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];
export const AVAILABILITY_STATE_LABEL: Record<AvailabilityState, string> = {
  available: "Available", hold: "On hold", pending_vendor: "Pending vendor confirmation", booked: "Booked", blocked: "Blocked", expired: "Expired",
};

/** managed: the vendor keeps the calendar live. on_request: every hold needs vendor confirmation. */
export const AVAILABILITY_MODES = ["on_request", "managed"] as const;
export type AvailabilityMode = (typeof AVAILABILITY_MODES)[number];
export const SUBJECT_TO_VENDOR = "Subject to vendor confirmation";

export const FIXED_PERIOD_CATEGORIES = ["hoarding", "unipole", "wall_wrap", "railway_metro"] as const;
/** Minimum booking period in days for fixed-period media (MVP doc: defined periods such as 15/30 days). */
export const FIXED_PERIOD_MIN_DAYS = 15;
export const minDaysFor = (category: string) => ((FIXED_PERIOD_CATEGORIES as readonly string[]).includes(category) ? FIXED_PERIOD_MIN_DAYS : 1);

export type CapacityModel = "period" | "slots" | "fleet" | "units";
export function capacityFor(category: string, quantity: number, attributes: Record<string, unknown> = {}): { capacity: number; model: CapacityModel; unitLabel: string } {
  if (category === "led_screen") {
    const slot = Number(attributes["slotLengthSec"]);
    const loop = Number(attributes["loopLengthSec"]);
    const perLoop = slot > 0 && loop >= slot ? Math.floor(loop / slot) : 1;
    return { capacity: perLoop * Math.max(1, quantity), model: "slots", unitLabel: "slots" };
  }
  if (category === "erickshaw_auto" || category === "transit" || category === "mobile_led_van") {
    return { capacity: Math.max(1, quantity), model: "fleet", unitLabel: "vehicles" };
  }
  if ((FIXED_PERIOD_CATEGORIES as readonly string[]).includes(category)) return { capacity: Math.max(1, quantity), model: "period", unitLabel: quantity > 1 ? "faces" : "site" };
  return { capacity: Math.max(1, quantity), model: "units", unitLabel: categoryDef(category)?.id === "indoor_retail" ? "units" : "units" };
}

/* ---------- Dates: plain calendar days (YYYY-MM-DD), inclusive ranges, India time ---------- */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-01").refine((s) => !isNaN(Date.parse(`${s}T00:00:00Z`)), "Enter a valid date");
export const dayMs = 86_400_000;
export const toDay = (s: string) => Date.parse(`${s}T00:00:00Z`);
export const fromDay = (t: number) => new Date(t).toISOString().slice(0, 10);
export const daysInclusive = (from: string, to: string) => Math.round((toDay(to) - toDay(from)) / dayMs) + 1;
/** Today's calendar date in India (Asia/Kolkata, UTC+5:30). */
export const todayIST = (now = Date.now()) => fromDay(now + 5.5 * 3600_000);

const range = z.object({ from: isoDate, to: isoDate }).refine((r) => toDay(r.to) >= toDay(r.from), { path: ["to"], message: "End date must be on or after the start date" })
  .refine((r) => daysInclusive(r.from, r.to) <= 366, { path: ["to"], message: "Choose a range of one year or less" });

export const holdInput = z.object({
  inventoryId: z.string().trim().min(1),
  from: isoDate, to: isoDate,
  qty: z.coerce.number().int().min(1).max(10000).default(1),
  leadId: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
}).superRefine((v, ctx) => { const r = range.safeParse(v); if (!r.success) for (const i of r.error.issues) ctx.addIssue(i); });

export const blockInput = z.object({
  from: isoDate, to: isoDate,
  qty: z.coerce.number().int().min(1).max(10000).optional(),
  reason: z.string().trim().min(3, "Give a reason").max(500),
}).superRefine((v, ctx) => { const r = range.safeParse(v); if (!r.success) for (const i of r.error.issues) ctx.addIssue(i); });

export const vendorResponseInput = z.object({ response: z.enum(["confirm", "decline"]), note: z.string().trim().max(500).optional() });
export const availabilityModeInput = z.object({ mode: z.enum(AVAILABILITY_MODES) });
export const availabilityQuery = range;

export type DayAvailability = { date: string; capacity: number; used: number; free: number; state: AvailabilityState };
export type AvailabilitySummary = {
  state: "available" | "limited" | "unavailable";
  minFree: number; capacity: number; unitLabel: string;
  /** false → show SUBJECT_TO_VENDOR; never present unconfirmed availability as guaranteed. */
  confirmed: boolean;
  lastUpdatedAt: string;
};

/* ---------- Module 1: search, shortlist, leads ---------- */
export const searchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(160).optional(),
  pin: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code").optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  from: isoDate.optional(), to: isoDate.optional(),
  qty: z.coerce.number().int().min(1).max(10000).default(1),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.1).max(500).default(5),
  /** Map viewport: minLng,minLat,maxLng,maxLat */
  bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, "bbox must be minLng,minLat,maxLng,maxLat").optional(),
  onlyAvailable: z.enum(["true", "false"]).default("false"),
  includeDemo: z.enum(["true", "false"]).default("false"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
}).refine((v) => (v.from ? !!v.to : !v.to), { path: ["to"], message: "Give both start and end dates" })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { path: ["lng"], message: "Give both latitude and longitude" });

export const LEAD_SOURCES = ["web", "phone", "whatsapp", "growth_partner", "agency", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
/** MVP doc §6: New → Under Review → Assigned → Quoted → Won | Lost | Closed. */
export const LEAD_STATUSES = ["new", "under_review", "assigned", "quoted", "won", "lost", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const leadCreateInput = z.object({
  inventoryIds: z.array(z.string().trim().min(1)).max(20, "Add up to 20 media items per inquiry").default([]),
  city: z.string().trim().max(80).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  from: isoDate, to: isoDate,
  qty: z.coerce.number().int().min(1).max(10000).default(1),
  budget: z.coerce.number().positive("Budget must be more than 0").max(1e10).optional(),
  requirement: z.string().trim().min(10, "Describe your requirement (at least 10 characters)").max(3000),
}).superRefine((v, ctx) => {
  const r = range.safeParse(v); if (!r.success) for (const i of r.error.issues) ctx.addIssue(i);
  if (!v.inventoryIds.length && !v.city) ctx.addIssue({ code: "custom", path: ["city"], message: "Choose media items or tell us the city" });
});
export type LeadCreateInput = z.infer<typeof leadCreateInput>;
