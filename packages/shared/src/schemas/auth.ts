import { z } from "zod";

/** Indian formats; validated server-side, mirrored in forms. */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const MOBILE_RE = /^\+?[0-9]{10,13}$/;

const trimmed = (max: number) =>
  z.string({ required_error: "This field is required" }).trim().min(1, "This field is required").max(max, `Use ${max} characters or fewer`);

export const email = z.string({ required_error: "Enter your email address" }).trim().toLowerCase().email("Enter a valid email address").max(254);
export const mobile = z.string().trim().regex(MOBILE_RE, "Enter a valid mobile number");
export const gstin = z.string().trim().toUpperCase().regex(GSTIN_RE, "Enter a valid 15-character GSTIN");
export const pan = z.string().trim().toUpperCase().regex(PAN_RE, "Enter a valid PAN");

/** Password policy: 10+ chars with upper, lower, digit and symbol. */
export const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p), {
    message: "Use upper and lower case letters, a number and a symbol",
  });

/** Consents every user accepts at onboarding (Module 10). */
export const CONSENT_DOCUMENTS = ["privacy_policy", "terms_of_use", "confidentiality_anti_circumvention"] as const;
export const CURRENT_CONSENT_VERSION = "1.0";
const acceptTerms = z.literal(true, { errorMap: () => ({ message: "You must accept the policies to continue" }) });

const address = z.object({
  line1: trimmed(200),
  line2: z.string().trim().max(200).optional(),
  city: trimmed(80),
  state: trimmed(80),
  pin: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
});

export const contactPerson = z.object({ name: trimmed(120), email: email.optional(), mobile: mobile.optional(), designation: z.string().trim().max(80).optional() });

/** POST /api/v1/auth/register — role is fixed server-side to client. */
export const registerClientInput = z.object({
  fullName: trimmed(120),
  email,
  mobile,
  password,
  companyName: trimmed(160),
  gstin: gstin.optional(),
  acceptTerms,
});

/** POST /api/v1/vendors/register — vendor starts as KYC pending. */
export const registerVendorInput = z.object({
  fullName: trimmed(120),
  email,
  mobile,
  password,
  legalName: trimmed(160),
  pan,
  gstin: gstin.optional(),
  city: trimmed(80),
  acceptTerms,
});

export const loginInput = z.object({ email, password: z.string().min(1).max(128) });

export const clientProfileUpdate = z
  .object({
    companyName: trimmed(160),
    gstin: gstin.nullable(),
    billingAddress: address,
    contacts: z.array(contactPerson).max(10),
  })
  .partial()
  .strict();

export const roleAssignInput = z.object({
  role: z.enum(["client", "vendor", "admin", "growth_partner", "finance"]),
  reason: trimmed(500),
});

export const consentInput = z.object({ document: z.enum(CONSENT_DOCUMENTS), version: trimmed(20) });

export type RegisterClientInput = z.infer<typeof registerClientInput>;
export type RegisterVendorInput = z.infer<typeof registerVendorInput>;
export type LoginInput = z.infer<typeof loginInput>;
export type ClientProfileUpdate = z.infer<typeof clientProfileUpdate>;
