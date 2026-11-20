import { z } from "zod";

/** Module 4 — media categories, ID codes and category-specific attribute templates. */
export type AttrType = "number" | "text" | "boolean";
export type AttrDef = { key: string; label: string; type: AttrType; required: boolean; unit?: string; critical?: boolean };

const W: AttrDef = { key: "widthFt", label: "Width", type: "number", required: true, unit: "ft", critical: true };
const H: AttrDef = { key: "heightFt", label: "Height", type: "number", required: true, unit: "ft", critical: true };
const LIT: AttrDef = { key: "illuminated", label: "Illuminated", type: "boolean", required: false };
const FLEET: AttrDef = { key: "fleetSize", label: "Fleet size", type: "number", required: true, unit: "vehicles", critical: true };
const PANEL: AttrDef = { key: "panelSize", label: "Branding panel size", type: "text", required: false };

export const CATEGORY_DEFS = [
  { id: "hoarding", code: "HRD", name: "Hoarding / Billboard", units: ["per_month", "per_day", "per_sqft"], attributes: [W, H, LIT, { key: "facing", label: "Facing / traffic direction", type: "text", required: false }] },
  { id: "unipole", code: "UNP", name: "Unipole", units: ["per_month", "per_day"], attributes: [W, H, LIT] },
  { id: "wall_wrap", code: "WLW", name: "Wall wrap", units: ["per_month", "per_sqft"], attributes: [W, H, LIT] },
  { id: "erickshaw_auto", code: "VEH", name: "E-rickshaw / Auto branding", units: ["per_vehicle_month"], attributes: [FLEET, PANEL] },
  { id: "transit", code: "TRN", name: "Bus / Cab / Transit", units: ["per_vehicle_month", "per_month"], attributes: [FLEET, PANEL, { key: "routes", label: "Routes covered", type: "text", required: false }] },
  {
    id: "railway_metro", code: "MTR", name: "Railway / Metro (authorised)", units: ["per_month", "per_day"],
    attributes: [W, H, { key: "authorisationRef", label: "Authority permission / licence no.", type: "text", required: true, critical: true }],
  },
  {
    id: "led_screen", code: "LED", name: "LED screen", units: ["per_slot", "per_month", "per_day", "per_impression_block"],
    attributes: [
      W, H,
      { key: "slotLengthSec", label: "Slot length", type: "number", required: true, unit: "sec", critical: true },
      { key: "loopLengthSec", label: "Loop length", type: "number", required: true, unit: "sec", critical: true },
      { key: "operatingHours", label: "Operating hours", type: "text", required: false },
    ],
  },
  { id: "mobile_led_van", code: "LVN", name: "Mobile LED van", units: ["per_day", "per_month"], attributes: [FLEET, { key: "screenSize", label: "Screen size", type: "text", required: false }, { key: "routes", label: "Routes covered", type: "text", required: false }] },
  { id: "indoor_retail", code: "IND", name: "Indoor / Retail media", units: ["per_month", "per_slot", "per_day"], attributes: [{ key: "venueType", label: "Venue type", type: "text", required: true }, { key: "screenCount", label: "Screens / panels", type: "number", required: false }, PANEL] },
] as const satisfies readonly { id: string; code: string; name: string; units: readonly string[]; attributes: readonly AttrDef[] }[];

export type CategoryId = (typeof CATEGORY_DEFS)[number]["id"];
export const CATEGORY_IDS = CATEGORY_DEFS.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const categoryDef = (id: string) => CATEGORY_DEFS.find((c) => c.id === id);

export const PRICING_UNITS = ["per_month", "per_day", "per_slot", "per_vehicle_month", "per_sqft", "per_impression_block"] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];
export const PRICING_UNIT_LABEL: Record<PricingUnit, string> = {
  per_month: "per month", per_day: "per day", per_slot: "per slot", per_vehicle_month: "per vehicle / month", per_sqft: "per sq ft", per_impression_block: "per impression block",
};

/** Listing lifecycle (MVP doc §6): Draft → Pending → Approved | Rejected; Approved ⇄ Suspended; Rejected → Draft. */
export const LISTING_STATUSES = ["draft", "pending", "approved", "rejected", "suspended"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const LISTING_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ["pending"],
  pending: ["approved", "rejected"],
  approved: ["suspended", "pending"], // → pending when a critical field is edited
  suspended: ["approved"],
  rejected: ["draft"],
};
export const DATA_TYPES = ["DEMO", "VERIFIED"] as const;
export type DataType = (typeof DATA_TYPES)[number];

/** Fields whose change on an approved listing sends it back to admin review. */
export const CRITICAL_FIELDS = ["lat", "lng", "address", "city", "pin", "rate", "pricingUnit"] as const;

const num = (msg: string) => z.coerce.number({ error: msg }).finite(msg);
const req = (max: number) => z.string({ error: "This field is required" }).trim().min(1, "This field is required").max(max, `Use ${max} characters or fewer`);
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const listingCore = z.object({
  category: z.enum(CATEGORY_IDS, { error: "Choose a media category" }),
  title: req(140),
  description: opt(2000),
  city: req(80),
  locality: req(120),
  landmark: opt(160),
  address: req(300),
  pin: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
  lat: num("Enter latitude").min(6, "Latitude must be inside India").max(37.5, "Latitude must be inside India"),
  lng: num("Enter longitude").min(68, "Longitude must be inside India").max(97.5, "Longitude must be inside India"),
  rate: num("Enter your rate").positive("Rate must be more than 0").max(1e9),
  pricingUnit: z.enum(PRICING_UNITS, { error: "Choose a pricing unit" }),
  quantity: z.coerce.number().int("Use a whole number").min(1, "Quantity must be at least 1").max(100000).default(1),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

/** Checks category-specific required attributes and that the pricing unit fits the category. */
function checkCategory(v: { category: string; pricingUnit?: string; attributes?: Record<string, unknown> }, ctx: z.RefinementCtx) {
  const def = categoryDef(v.category);
  if (!def) return;
  if (v.pricingUnit && !(def.units as readonly string[]).includes(v.pricingUnit)) {
    ctx.addIssue({ code: "custom", path: ["pricingUnit"], message: `${def.name} is priced ${def.units.map((u) => PRICING_UNIT_LABEL[u]).join(" or ")}` });
  }
  const attrs = v.attributes ?? {};
  for (const a of def.attributes) {
    const val = attrs[a.key];
    const empty = val === undefined || val === null || val === "";
    if (a.required && empty) ctx.addIssue({ code: "custom", path: ["attributes", a.key], message: `${a.label} is required` });
    if (!empty && a.type === "number" && !(Number(val) > 0)) ctx.addIssue({ code: "custom", path: ["attributes", a.key], message: `${a.label} must be a positive number` });
  }
}

/** POST /vendors/me/inventory — every mandatory field is required up front; photos are required at submit. */
export const inventoryCreateInput = listingCore.superRefine(checkCategory);
/** PATCH /vendors/me/inventory/:id — category cannot change; re-validated against the stored category server-side. */
export const inventoryUpdateInput = listingCore.omit({ category: true }).partial().strict();

/** Normalises attribute values to the template's types and drops unknown keys. */
export function normaliseAttributes(category: string, attrs: Record<string, unknown>) {
  const def = categoryDef(category);
  const out: Record<string, string | number | boolean> = {};
  for (const a of def?.attributes ?? []) {
    const v = attrs[a.key];
    if (v === undefined || v === null || v === "") continue;
    out[a.key] = a.type === "number" ? Number(v) : a.type === "boolean" ? v === true || v === "true" || v === "yes" || v === "1" : String(v).trim();
  }
  return out;
}

export const listingDecisionInput = z
  .object({
    decision: z.enum(["approve", "reject", "suspend", "reinstate"]),
    reason: z.string().trim().max(1000).optional(),
    /** Client-facing indicative price set by admin on approval (vendor rate stays private). */
    indicativePrice: z.coerce.number().positive().max(1e10).optional(),
  })
  .refine((v) => v.decision === "approve" || v.decision === "reinstate" || (v.reason && v.reason.length >= 3), { path: ["reason"], message: "Give a reason (at least 3 characters)" });

export const dataTypeInput = z.object({ dataType: z.enum(DATA_TYPES), reason: z.string().trim().min(3, "Give a reason").max(1000) });

export const inventoryImportInput = z.object({ csv: z.string().min(1, "The file is empty").max(2_000_000, "File is too large (max 2 MB)"), dryRun: z.boolean().optional() });

/** CSV columns for bulk import; attributes go in attr_<key> columns. */
export const IMPORT_COLUMNS = ["title", "category", "city", "locality", "landmark", "address", "pin", "lat", "lng", "rate", "pricing_unit", "quantity", "description"] as const;

export type InventoryCreateInput = z.infer<typeof inventoryCreateInput>;
export type InventoryUpdateInput = z.infer<typeof inventoryUpdateInput>;

/** What the public catalogue returns: never vendor identity, vendor rate or documents. */
export type PublicListing = {
  inventoryId: string;
  title: string;
  category: CategoryId;
  categoryName: string;
  description?: string;
  city: string;
  locality: string;
  landmark?: string;
  pin: string;
  lat: number;
  lng: number;
  attributes: Record<string, string | number | boolean>;
  pricingUnit: PricingUnit;
  indicativePrice: number | null;
  quantity: number;
  photos: string[];
  dataType: DataType | null;
  verified: boolean;
  bookable: boolean;
  updatedAt: string;
};
