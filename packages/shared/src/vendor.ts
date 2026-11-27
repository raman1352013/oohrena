import { z } from "zod";

/** Module 2/3 — vendor KYC. Pending → Approved | Rejected; Approved ⇄ Suspended; Rejected → Pending (vendor resubmits). */
export const KYC_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export const KYC_TRANSITIONS: Record<KycStatus, readonly KycStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["suspended"],
  suspended: ["approved"],
  rejected: ["pending"],
};

/** Vendor form §F document checklist. */
export const KYC_DOC_TYPES = [
  "pan",
  "gst",
  "business_registration",
  "ownership_proof",
  "municipal_permission",
  "authorisation",
  "address_proof",
  "rate_card",
  "cancelled_cheque",
  "other",
] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];
export const KYC_DOC_LABEL: Record<KycDocType, string> = {
  pan: "PAN card",
  gst: "GST certificate",
  business_registration: "Business registration proof",
  ownership_proof: "Ownership / lease / site-control proof",
  municipal_permission: "Municipal / authority permission",
  authorisation: "Authorisation from site owner",
  address_proof: "Business address proof",
  rate_card: "Rate card",
  cancelled_cheque: "Cancelled cheque / bank proof",
  other: "Other supporting document",
};
/** Documents a vendor must upload before admin can approve KYC. */
export const REQUIRED_KYC_DOCS: readonly KycDocType[] = ["pan"];

export const kycDecisionInput = z
  .object({ decision: z.enum(["approve", "reject", "suspend", "reinstate"]), reason: z.string().trim().max(1000).optional() })
  .refine((v) => v.decision === "approve" || v.decision === "reinstate" || (v.reason && v.reason.length >= 3), { path: ["reason"], message: "Give a reason (at least 3 characters)" });

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const vendorBankInput = z.object({
  accountName: z.string().trim().min(2, "Enter the account holder name").max(160),
  accountNo: z.string().trim().regex(/^[0-9]{9,18}$/, "Account number must be 9–18 digits"),
  ifsc: z.string().trim().toUpperCase().regex(IFSC_RE, "Enter a valid 11-character IFSC"),
  bankName: z.string().trim().max(120).optional(),
});

/** Allowed upload types, checked by file signature on the server (not by extension). */
export const DOC_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_LISTING = 10;

/** Vendor form §B partner category (asked at sign-up). */
/** Every value that may be stored. "proposed_super_vendor" stays only so older sign-ups still load. */
export const VENDOR_CATEGORIES = ["media_owner", "aggregator", "execution_partner", "agency", "proposed_super_vendor", "other"] as const;
/**
 * What a vendor may pick at sign-up and in onboarding. Super Vendor is never self-selected: Admin invites,
 * the vendor accepts, a second admin approves (founder blueprint §5.3, "no self-assigned elevation").
 */
export const SELECTABLE_VENDOR_CATEGORIES = ["media_owner", "aggregator", "execution_partner", "agency", "other"] as const;
export type SelectableVendorCategory = (typeof SELECTABLE_VENDOR_CATEGORIES)[number];
export const isSelectableVendorCategory = (c: string): c is SelectableVendorCategory =>
  (SELECTABLE_VENDOR_CATEGORIES as readonly string[]).includes(c);
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];
export const VENDOR_CATEGORY_LABEL: Record<VendorCategory, string> = {
  media_owner: "Media owner / site owner",
  aggregator: "Authorised operator / aggregator",
  execution_partner: "Execution partner",
  agency: "Agency / media buying",
  // Old sign-ups only; shown to Admin as a lead for a future invite, never as a role.
  proposed_super_vendor: "Interested in regional partnership",
  other: "Other",
};

