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

export const KYC_DOC_TYPES = ["pan", "gst", "authorisation", "address_proof", "other"] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];
export const KYC_DOC_LABEL: Record<KycDocType, string> = {
  pan: "PAN card",
  gst: "GST certificate",
  authorisation: "Site authorisation / permission",
  address_proof: "Business address proof",
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
