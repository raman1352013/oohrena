import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { ROLES, VENDOR_ROLES, CONSENT_DOCUMENTS } from "@oohrena/shared";

const ts = { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } } as const;

/* ---------- ID counters (atomic $inc; never reused) ---------- */
const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, required: true, default: 0 } }, { versionKey: false });
export const Counter = mongoose.model("Counter", counterSchema, "counters");

/* ---------- Pending Maker-Checker Action on Staff ---------- */
const pendingUserActionSchema = new Schema(
  {
    type: { type: String, enum: ["role_change", "suspend", "reactivate"], required: true },
    targetRole: { type: String, enum: ROLES, default: null },
    reason: { type: String, required: true },
    proposedBy: { type: String, required: true },
    proposedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

/* ---------- Users (all roles) ---------- */
const userSchema = new Schema(
  {
    _id: { type: String, required: true }, // USR-000001
    email: { type: String, required: true, lowercase: true, trim: true },
    mobile: { type: String, required: true },
    fullName: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    vendorRole: { type: String, enum: VENDOR_ROLES, default: null },
    isStaff: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "pending", "suspended"], default: "active" },
    pendingAction: { type: pendingUserActionSchema, default: null },
    orgId: { type: String, default: null }, // CLT-/VND-/GP- profile id
    emailVerifiedAt: { type: Date, default: null },
    mobileVerifiedAt: { type: Date, default: null },
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: String, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecretEncrypted: { type: String, default: null, select: false },
    twoFactorRecoveryCodes: { type: [String], default: [], select: false },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpiresAt: { type: Date, default: null, select: false },
    mobileOtpHash: { type: String, default: null, select: false },
    mobileOtpExpiresAt: { type: Date, default: null, select: false },
    mobileOtpAttempts: { type: Number, default: 0, select: false },
  },
  ts,
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ mobile: 1 }, { unique: true });
export const User = mongoose.model("User", userSchema, "users");
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: string };

/* ---------- Sessions (opaque token, only the SHA-256 hash is stored) ---------- */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    issuedAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, default: () => new Date() },
    revokedAt: { type: Date, default: null },
    reauthAt: { type: Date, default: () => new Date() },
    ip: String,
    device: String,
  },
  { versionKey: false },
);
// Mongo removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = mongoose.model("Session", sessionSchema, "sessions");

/* ---------- Two-factor login challenges (5-minute TTL) ---------- */
const twoFactorChallengeSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    /** login = enter an existing 2FA code; setup = privileged user must enrol before a session is issued. */
    purpose: { type: String, enum: ["login", "setup"], default: "login" },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
twoFactorChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const TwoFactorChallenge = mongoose.model("TwoFactorChallenge", twoFactorChallengeSchema, "two_factor_challenges");

/* ---------- Organisation profiles ---------- */
const contactSchema = new Schema({ name: String, email: String, mobile: String, designation: String }, { _id: false });
const addressSchema = new Schema({ line1: String, line2: String, city: String, state: String, pin: String }, { _id: false });

const clientSchema = new Schema(
  {
    _id: { type: String, required: true }, // CLT-000001
    userId: { type: String, required: true, unique: true },
    companyName: { type: String, required: true },
    gstin: { type: String, default: null },
    billingAddress: { type: addressSchema, default: null },
    contacts: { type: [contactSchema], default: [] },
  },
  ts,
);
export const Client = mongoose.model("Client", clientSchema, "clients");

const vendorSchema = new Schema(
  {
    _id: { type: String, required: true }, // VND-000001
    userId: { type: String, required: true, unique: true },
    legalName: { type: String, required: true },
    pan: { type: String, required: true },
    gstin: { type: String, default: null },
    city: { type: String, required: true },
    // Module 2 / §6 transitions: pending → approved | rejected; approved ⇄ suspended
    kycStatus: { type: String, enum: ["pending", "approved", "rejected", "suspended"], default: "pending" },
    kycReason: { type: String, default: null },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
  },
  ts,
);
vendorSchema.index({ pan: 1 }, { unique: true });
export const Vendor = mongoose.model("Vendor", vendorSchema, "vendors");

/* ---------- Vendor Users (team members with sub-roles) ---------- */
const vendorUserSchema = new Schema(
  {
    _id: { type: String, required: true }, // VNU-000001
    vendorId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: VENDOR_ROLES, required: true },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    invitedBy: { type: String, default: null },
  },
  ts,
);
vendorUserSchema.index({ vendorId: 1, userId: 1 }, { unique: true });
export const VendorUser = mongoose.model("VendorUser", vendorUserSchema, "vendor_users");
export type VendorUserDoc = InferSchemaType<typeof vendorUserSchema> & { _id: string };

const partnerSchema = new Schema(
  { _id: { type: String, required: true }, userId: { type: String, required: true, unique: true }, name: { type: String, required: true }, city: String },
  ts,
);
export const GrowthPartner = mongoose.model("GrowthPartner", partnerSchema, "growth_partners");

/* ---------- Consents (policy + agreement acceptance, versioned) ---------- */
const consentSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    document: { type: String, enum: CONSENT_DOCUMENTS, required: true },
    version: { type: String, required: true },
    acceptedAt: { type: Date, required: true, default: () => new Date() },
    ip: String,
  },
  { versionKey: false },
);
consentSchema.index({ userId: 1, document: 1, version: 1 }, { unique: true });
export const Consent = mongoose.model("Consent", consentSchema, "consents");

/* ---------- System events (errors, deploys, backups) ---------- */
const systemEventSchema = new Schema(
  { type: { type: String, enum: ["error", "deploy", "backup", "restore"], required: true }, detail: Schema.Types.Mixed, at: { type: Date, default: () => new Date() } },
  { versionKey: false },
);
export const SystemEvent = mongoose.model("SystemEvent", systemEventSchema, "system_events");
