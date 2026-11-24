import type { Role, VendorRole } from "./roles";

/**
 * API contract: every success is `{ data }`, every failure is `{ error }`.
 * HTTP status carries the class (400 validation, 401 unauthenticated, 403 forbidden,
 * 404 not found / not yours, 409 conflict, 423 locked, 429 throttled).
 */
export type ApiSuccess<T> = { data: T };
export type ApiError = { error: { code: ErrorCode; message: string; details?: unknown } };

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ACCOUNT_LOCKED"
  | "RATE_LIMITED"
  | "INVALID_TRANSITION"
  | "REAUTH_REQUIRED"
  | "TWO_FACTOR_REQUIRED"
  | "TWO_FACTOR_ALREADY_ENABLED"
  | "SMS_NOT_CONFIGURED"
  | "INTERNAL_ERROR";

export type SessionUser = {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  vendorRole?: VendorRole;
  status: "active" | "pending" | "suspended";
  /** CLT-/VND-/GP- id of the organisation profile tied to this login, if any. */
  orgId: string | null;
  twoFactorEnabled?: boolean;
  emailVerified?: boolean;
  mobileVerified?: boolean;
};
