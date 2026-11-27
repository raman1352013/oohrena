import { z } from "zod";
import { gstin, mobile, pan } from "./schemas/auth.js";
import { isoDate } from "./availability.js";
import { pinCode, stateCode } from "./geo.js";
import { SELECTABLE_VENDOR_CATEGORIES } from "./vendor.js";

/**
 * Vendor onboarding wizard — the online version of the Vendor Registration & Inventory Form.
 * One .strict() schema per step (PDF section in brackets). Design: docs/VENDOR_ONBOARDING_ARCHITECTURE.md §3.2.
 */

const text = (max: number) =>
  z.string({ error: "This field is required" }).trim().min(1, "This field is required").max(max, `Use ${max} characters or fewer`);
const optionalText = (max: number) => z.string().trim().max(max, `Use ${max} characters or fewer`).optional();
const count = (max: number) => z.number({ error: "Enter a number" }).int("Use a whole number").min(0).max(max);
const hours = z.number({ error: "Enter hours" }).int("Use whole hours").min(1, "At least 1 hour").max(720, "At most 720 hours");
const uniqueList = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).max(max).refine((a) => new Set(a).size === a.length, "Remove duplicates");

/* ---------- §A business ---------- */
export const BUSINESS_TYPES = ["proprietorship", "partnership", "llp", "pvt_ltd", "individual", "other"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  proprietorship: "Proprietorship",
  partnership: "Partnership",
  llp: "LLP",
  pvt_ltd: "Pvt. Ltd.",
  individual: "Individual",
  other: "Other",
};

export const COMMUNICATION_LANGUAGES = ["english", "hindi", "other"] as const;
export const UDYAM_RE = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;

export const officeAddressInput = z
  .object({
    line1: text(200),
    line2: optionalText(200),
    city: text(80),
    district: text(80),
    stateCode,
    pin: pinCode,
  })
  .strict();

export const onboardingBusinessInput = z
  .object({
    legalName: text(200),
    tradeName: optionalText(200),
    designation: text(80),
    whatsapp: mobile.optional(),
    website: z.string().trim().url("Enter a full link starting with https://").max(300).optional(),
    officeAddress: officeAddressInput,
    businessType: z.enum(BUSINESS_TYPES, { error: "Choose a business type" }),
    yearEstablished: z
      .number({ error: "Enter a year" })
      .int()
      .min(1900, "Enter a year after 1900")
      .refine((y) => y <= new Date().getUTCFullYear(), "Year can't be in the future"),
    pan,
    gstin: gstin.optional(),
    udyam: z.string().trim().toUpperCase().regex(UDYAM_RE, "Enter a valid Udyam number").optional(),
    language: z.enum(COMMUNICATION_LANGUAGES, { error: "Choose a language" }),
  })
  .strict()
  // A GSTIN carries the PAN in characters 3–12.
  .refine((v) => !v.gstin || v.gstin.slice(2, 12) === v.pan, { path: ["gstin"], message: "GSTIN does not match the PAN" });

export const onboardingCategoryInput = z
  .object({
    categories: uniqueList(z.enum(SELECTABLE_VENDOR_CATEGORIES, { error: "Choose from the listed options" }), SELECTABLE_VENDOR_CATEGORIES.length).refine((a) => a.length > 0, "Choose at least one"),
    otherCategory: optionalText(120),
  })
  .strict()
  .refine((v) => !v.categories.includes("other") || !!v.otherCategory, { path: ["otherCategory"], message: "Describe the other category" });

/* ---------- §C territory ---------- */
export const onboardingTerritoryInput = z
  .object({
    primaryCity: text(80),
    primaryDistrict: text(80),
    stateCode,
    otherCities: uniqueList(text(80), 100).default([]),
    statesServed: uniqueList(stateCode, 36).default([]),
    networkSize: count(100_000),
    approxSites: count(1_000_000),
    outsideCity: z.boolean(),
    responseTimeH: hours,
  })
  .strict();

/* ---------- §H execution ---------- */
export const EXECUTION_SERVICES = [
  "printing",
  "fabrication",
  "mounting",
  "digital_ops",
  "transit_branding",
  "site_inspection",
  "maintenance",
  "gps_proof",
] as const;
export type ExecutionService = (typeof EXECUTION_SERVICES)[number];
export const EXECUTION_SERVICE_LABEL: Record<ExecutionService, string> = {
  printing: "Printing / flex / vinyl",
  fabrication: "Fabrication / structural work",
  mounting: "Mounting / installation / dismantling",
  digital_ops: "LED / digital screen operations",
  transit_branding: "Transit / vehicle branding",
  site_inspection: "Site inspection / measurement / photography",
  maintenance: "Maintenance / repair / emergency replacement",
  gps_proof: "GPS-tagged, timestamped proof photos",
};

const contact = z.object({ name: text(120), mobile }).strict();

export const onboardingExecutionInput = z
  .object({
    services: uniqueList(z.enum(EXECUTION_SERVICES), EXECUTION_SERVICES.length),
    subcontractedServices: uniqueList(z.enum(EXECUTION_SERVICES), EXECUTION_SERVICES.length).default([]),
    teamSize: count(100_000),
    citiesCovered: uniqueList(text(80), 100).default([]),
    dailyCapacity: count(100_000),
    emergencyResponseH: hours,
    equipment: optionalText(500),
    usesSubcontractors: z.boolean(),
    executionContact: contact,
    escalationContact: contact.optional(),
  })
  .strict()
  .refine((v) => v.subcontractedServices.every((s) => v.services.includes(s)), {
    path: ["subcontractedServices"],
    message: "Only services you offer can be subcontracted",
  })
  .refine((v) => v.usesSubcontractors || v.subcontractedServices.length === 0, {
    path: ["usesSubcontractors"],
    message: "You marked services as subcontracted",
  });

/* ---------- §I availability & SLA ---------- */
export const AVAILABILITY_UPDATE_FREQUENCIES = ["daily", "weekly", "on_request"] as const;

export const onboardingSlaInput = z
  .object({
    updateFrequency: z.enum(AVAILABILITY_UPDATE_FREQUENCIES, { error: "Choose how often" }),
    blackoutDates: uniqueList(isoDate, 366).default([]),
    canHold: z.boolean(),
    maxHoldH: hours.optional(),
    proofWithinSla: z.boolean(),
    proofTimeH: hours,
  })
  .strict()
  .refine((v) => !v.canHold || v.maxHoldH !== undefined, { path: ["maxHoldH"], message: "Enter the maximum hold period" });

/* ---------- §K declaration ---------- */
/** Bump when the wording changes; the version is stored with every signed declaration. */
export const DECLARATION_VERSION = "2026-11";
export const DECLARATION_ITEMS = [
  { key: "infoTrue", text: "The information in this form and its attachments is true and complete." },
  { key: "ownershipDisclosed", text: "I have disclosed whether each site is owned, leased, operated or marketed under authorisation." },
  { key: "permissions", text: "I hold or will obtain all legally required permissions for my sites and execution work." },
  { key: "promptUpdates", text: "I will promptly update OOHRENA about changes in ownership, authorisation, availability, rates, site condition or permissions." },
  { key: "noFalseAvailability", text: "I will not mark an asset available if it is booked, restricted, removed or otherwise unavailable." },
  { key: "assetReviewSeparate", text: "Vendor approval does not verify every asset; each asset may be reviewed separately." },
  { key: "contactConsent", text: "OOHRENA may contact me for verification, quotations, booking requests and operations." },
  { key: "noBookingUntilConfirmed", text: "No booking is confirmed until approvals, commercial terms and written confirmation are complete." },
  { key: "policies", text: "I agree to OOHRENA's partner, confidentiality, data protection, execution and payment policies." },
] as const;
export type DeclarationKey = (typeof DECLARATION_ITEMS)[number]["key"];

const mustAccept = z.literal(true, { error: "Accept this to continue" });

export const onboardingDeclarationInput = z
  .object({
    accepted: z
      .object({
        infoTrue: mustAccept,
        ownershipDisclosed: mustAccept,
        permissions: mustAccept,
        promptUpdates: mustAccept,
        noFalseAvailability: mustAccept,
        assetReviewSeparate: mustAccept,
        contactConsent: mustAccept,
        noBookingUntilConfirmed: mustAccept,
        policies: mustAccept,
      } satisfies Record<DeclarationKey, typeof mustAccept>)
      .strict(),
    signatoryName: text(120),
    designation: text(80),
    place: text(80),
  })
  .strict();

/* ---------- steps ---------- */
/** Steps saved through PATCH /vendors/me/onboarding/:step. */
export const ONBOARDING_STEPS = ["business", "category", "territory", "execution", "sla"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export const ONBOARDING_STEP_SCHEMAS = {
  business: onboardingBusinessInput,
  category: onboardingCategoryInput,
  territory: onboardingTerritoryInput,
  execution: onboardingExecutionInput,
  sla: onboardingSlaInput,
} as const satisfies Record<OnboardingStep, z.ZodType>;
export const isOnboardingStep = (s: string): s is OnboardingStep => (ONBOARDING_STEPS as readonly string[]).includes(s);

/** Everything the wizard shows, in order. documents and bank reuse the KYC and bank screens; declaration is the submit. */
export const WIZARD_STEPS = [...ONBOARDING_STEPS, "documents", "bank", "declaration"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export const WIZARD_STEP_LABEL: Record<WizardStep, string> = {
  business: "Business",
  category: "Category",
  territory: "Territory",
  execution: "Execution",
  sla: "Availability & SLA",
  documents: "Documents",
  bank: "Bank",
  declaration: "Declaration",
};

export type OnboardingBusinessInput = z.infer<typeof onboardingBusinessInput>;
export type OnboardingCategoryInput = z.infer<typeof onboardingCategoryInput>;
export type OnboardingTerritoryInput = z.infer<typeof onboardingTerritoryInput>;
export type OnboardingExecutionInput = z.infer<typeof onboardingExecutionInput>;
export type OnboardingSlaInput = z.infer<typeof onboardingSlaInput>;
export type OnboardingDeclarationInput = z.infer<typeof onboardingDeclarationInput>;

/** Shape of GET /vendors/me/onboarding. */
export type OnboardingState = {
  steps: Record<WizardStep, boolean>;
  submittedAt: string | null;
  data: Partial<{
    business: OnboardingBusinessInput;
    category: OnboardingCategoryInput;
    territory: OnboardingTerritoryInput;
    execution: OnboardingExecutionInput;
    sla: OnboardingSlaInput;
  }>;
};

/* ---------- Admin review = vendor form §L "Office use" (T8) ---------- */

export const REVIEW_CHECKS = ["pending", "verified", "rejected"] as const;
export type ReviewCheck = (typeof REVIEW_CHECKS)[number];
export const ASSET_REVIEW = ["pending", "partial", "verified", "rejected"] as const;
export type AssetReview = (typeof ASSET_REVIEW)[number];
export const RATE_CARD_REVIEW = ["pending", "approved", "clarification"] as const;
export type RateCardReview = (typeof RATE_CARD_REVIEW)[number];

/** Checklist items that can be rejected; any rejection needs a reason (AGENTS.md §4.7). */
export const REVIEW_REJECTABLE = ["identity", "ownership", "assets", "permission"] as const;

export const vendorReviewInput = z
  .object({
    identity: z.enum(REVIEW_CHECKS),
    ownership: z.enum(REVIEW_CHECKS),
    assets: z.enum(ASSET_REVIEW),
    permission: z.enum(REVIEW_CHECKS),
    rateCard: z.enum(RATE_CARD_REVIEW),
    siteVisitRequired: z.boolean(),
    territoryNote: z.string().trim().max(500).default(""),
    remarks: z.string().trim().max(2000).default(""),
    nextReviewDate: isoDate.nullable().default(null),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((v) => !reviewHasRejection(v) || (v.reason?.length ?? 0) >= 3, {
    path: ["reason"],
    message: "Give a reason for the rejected item (at least 3 characters)",
  });
export type VendorReviewInput = z.infer<typeof vendorReviewInput>;

/** Stored review (what the API returns). */
export type VendorReview = Omit<VendorReviewInput, "reason"> & {
  reason: string | null;
  reviewedBy: string;
  reviewedAt: string;
};

export function reviewHasRejection(v: { identity: ReviewCheck; ownership: ReviewCheck; assets: AssetReview; permission: ReviewCheck }): boolean {
  return REVIEW_REJECTABLE.some((k) => v[k] === "rejected");
}
