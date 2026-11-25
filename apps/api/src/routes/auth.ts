import { Router } from "express";
import {
  changePasswordInput,
  CONSENT_DOCUMENTS,
  CURRENT_CONSENT_VERSION,
  forgotPasswordInput,
  loginInput,
  PRIVILEGED_ROLES,
  reauthInput,
  registerClientInput,
  resetPasswordInput,
  twoFactorDisableInput,
  twoFactorEnrollStartInput,
  twoFactorEnrollVerifyInput,
  twoFactorLoginInput,
  twoFactorVerifyInput,
  verifyEmailInput,
  verifyMobileInput,
  type RegisterClientInput,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, forbidden, unauthenticated } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { withTransaction } from "../lib/tx.js";
import { newReferralCode, resolveReferredBy } from "../lib/referral-code.js";
import { hashToken, newToken, privilegedIpAllowed, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { Client, Consent, Session, TwoFactorChallenge, User } from "../models/foundation.js";
import { notify, smsDeliveryAvailable } from "../services/notifications.js";
import { randomInt } from "node:crypto";
import { dummyHashFor, endSession, hashPassword, revokeAllSessions, startSession, toSessionUser, verifyPassword } from "../services/session.js";
import { generateTwoFactorSetup, verifyTwoFactorCode } from "../services/two-factor.js";

export function consentDocs(userId: string, ip: string | undefined) {
  return CONSENT_DOCUMENTS.map((document) => ({ userId, document, version: CURRENT_CONSENT_VERSION, ip }));
}

/** Wrong-code attempts allowed per 2FA challenge / mobile OTP before it is invalidated. */
const MAX_CODE_ATTEMPTS = 5;

export function authRoutes(cfg: Config, authLimiter: import("express").RequestHandler) {
  const r = Router();

  /** Finds a live 2FA challenge of the given purpose; `fail()` counts a wrong code and burns the challenge at the limit. */
  async function loadChallenge(challengeToken: string, purpose: "login" | "setup") {
    const ch = await TwoFactorChallenge.findOne({ tokenHash: hashToken(challengeToken), purpose, expiresAt: { $gt: new Date() } });
    if (!ch) throw unauthenticated("Invalid or expired 2FA session. Please log in again.");
    const fail = async () => {
      const updated = await TwoFactorChallenge.findOneAndUpdate({ _id: ch._id }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
      if (!updated || (updated.attempts ?? 0) >= MAX_CODE_ATTEMPTS) await TwoFactorChallenge.deleteOne({ _id: ch._id });
    };
    return { ch, fail };
  }

  /** Module 1: client self-registration. Role is fixed to "client" server-side. */
  r.post("/register", authLimiter, validateBody(registerClientInput), async (req, res) => {
    const input = req.body as RegisterClientInput;
    const passwordHash = await hashPassword(cfg, input.password);
    const out = await withTransaction(async (session) => {
      const userId = await nextId("USR", session);
      const clientId = await nextId("CLT", session);
      const referralCode = await newReferralCode(session);
      const referredByCode = await resolveReferredBy(input.ref, session);
      const [user] = await User.create(
        [{ _id: userId, email: input.email, mobile: input.mobile, fullName: input.fullName, passwordHash, role: "client", status: "active", orgId: clientId, referralCode, referredByCode }],
        { session },
      );
      await Client.create([{ _id: clientId, userId, companyName: input.companyName, gstin: input.gstin ?? null }], { session });
      await Consent.create(consentDocs(userId, req.ip), { session, ordered: true });
      await audit(req, { action: "auth.register", entity: "user", entityId: userId, after: { role: "client", email: input.email, clientId, referredByCode }, userId, role: "client" }, session);
      const s = await startSession(cfg, req, res, userId, session);
      return { user: toSessionUser(user!.toObject()), ...s };
    });
    res.status(201).json({ data: out });
  });

  r.post("/login", authLimiter, validateBody(loginInput), async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await User.findOne({ email }).select("+passwordHash +failedLogins +lockedUntil +twoFactorSecretEncrypted +twoFactorRecoveryCodes");
    if (!user) {
      await verifyPassword(password, dummyHashFor(cfg));
      await audit(req, { action: "auth.login_failed", entity: "user", after: { email, reason: "unknown_email" }, userId: null, role: null });
      throw unauthenticated("Email or password is incorrect");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSec = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      throw new AppError(423, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later.", { retryAfterSec });
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      const failures = (user.failedLogins ?? 0) + 1;
      const lock = failures >= cfg.LOGIN_MAX_FAILURES;
      await User.updateOne(
        { _id: user._id },
        lock ? { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + cfg.LOGIN_LOCK_MINUTES * 60_000) } } : { $set: { failedLogins: failures } },
      );
      await audit(req, { action: lock ? "auth.locked" : "auth.login_failed", entity: "user", entityId: user._id, after: { failures }, userId: user._id, role: user.role });
      throw unauthenticated("Email or password is incorrect");
    }
    if (user.status === "suspended") {
      await audit(req, { action: "auth.login_blocked", entity: "user", entityId: user._id, after: { status: "suspended" }, userId: user._id, role: user.role });
      throw new AppError(403, "FORBIDDEN", "This account is suspended. Contact support.");
    }
    if (!privilegedIpAllowed(cfg, user.role, req.ip)) {
      await audit(req, { action: "auth.ip_blocked", entity: "user", entityId: user._id, after: { ip: req.ip ?? null }, userId: user._id, role: user.role });
      throw new AppError(403, "FORBIDDEN", "Sign-in from this network is not allowed for your role");
    }

    // 2FA requirement check
    if (user.twoFactorEnabled) {
      const challengeToken = newToken();
      await TwoFactorChallenge.create([
        {
          tokenHash: hashToken(challengeToken),
          userId: user._id,
          purpose: "login",
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      ]);
      await audit(req, { action: "auth.login_2fa_prompted", entity: "user", entityId: user._id, userId: user._id, role: user.role });
      res.json({ data: { status: "2FA_REQUIRED", challengeToken, email: user.email } });
      return;
    }

    // Mandatory 2FA check for privileged roles in production/staging
    if (cfg.REQUIRE_2FA_PRIVILEGED && PRIVILEGED_ROLES.includes(user.role as (typeof PRIVILEGED_ROLES)[number])) {
      const challengeToken = newToken();
      await TwoFactorChallenge.create([
        {
          tokenHash: hashToken(challengeToken),
          userId: user._id,
          purpose: "setup",
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      ]);
      await audit(req, { action: "auth.login_2fa_setup_required", entity: "user", entityId: user._id, userId: user._id, role: user.role });
      res.json({ data: { status: "2FA_SETUP_REQUIRED", challengeToken, email: user.email } });
      return;
    }

    await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const s = await startSession(cfg, req, res, user._id);
    await audit(req, { action: "auth.login", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    res.json({ data: { user: toSessionUser(user.toObject()), ...s } });
  });

  /** 2FA login verification with TOTP code or recovery code. */
  r.post("/2fa/login", authLimiter, validateBody(twoFactorLoginInput), async (req, res) => {
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const { ch, fail } = await loadChallenge(challengeToken, "login");

    const user = await User.findById(ch.userId).select("+twoFactorSecretEncrypted +twoFactorRecoveryCodes");
    if (!user || user.status === "suspended") throw unauthenticated("Invalid user account");

    const ver = verifyTwoFactorCode(cfg, user, code);
    if (!ver.valid) {
      await fail();
      await audit(req, { action: "auth.login_2fa_failed", entity: "user", entityId: user._id, userId: user._id, role: user.role });
      throw unauthenticated("Invalid two-factor authentication code or recovery code");
    }

    if (ver.usedRecoveryHash) {
      await User.updateOne({ _id: user._id }, { $pull: { twoFactorRecoveryCodes: ver.usedRecoveryHash } });
      await audit(req, { action: "auth.2fa_recovery_used", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    }

    await TwoFactorChallenge.deleteOne({ _id: ch._id });
    await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const s = await startSession(cfg, req, res, user._id);
    await audit(req, { action: "auth.login", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    res.json({ data: { user: toSessionUser(user.toObject()), ...s } });
  });

  /**
   * Mandatory 2FA enrolment (REQUIRE_2FA_PRIVILEGED): after a 2FA_SETUP_REQUIRED login the user scans a new secret
   * and proves it with a code. Only then is a session issued; no session exists before enrolment.
   */
  r.post("/2fa/enroll/start", authLimiter, validateBody(twoFactorEnrollStartInput), async (req, res) => {
    const { challengeToken } = req.body as { challengeToken: string };
    const { ch } = await loadChallenge(challengeToken, "setup");
    const user = await User.findById(ch.userId);
    if (!user || user.status === "suspended") throw unauthenticated("Invalid user account");
    if (user.twoFactorEnabled) throw new AppError(409, "TWO_FACTOR_ALREADY_ENABLED", "Two-factor authentication is already enabled. Log in again.");
    const setup = await generateTwoFactorSetup(cfg, user.email);
    await User.updateOne({ _id: user._id }, { $set: { twoFactorSecretEncrypted: setup.secretEncrypted, twoFactorRecoveryCodes: setup.recoveryCodeHashes } });
    await audit(req, { action: "auth.2fa_setup_started", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    res.json({ data: { uri: setup.uri, qrDataUrl: setup.qrDataUrl, recoveryCodes: setup.recoveryCodes } });
  });

  r.post("/2fa/enroll/verify", authLimiter, validateBody(twoFactorEnrollVerifyInput), async (req, res) => {
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const { ch, fail } = await loadChallenge(challengeToken, "setup");
    const user = await User.findById(ch.userId).select("+twoFactorSecretEncrypted +twoFactorRecoveryCodes");
    if (!user || user.status === "suspended") throw unauthenticated("Invalid user account");
    if (!user.twoFactorSecretEncrypted) throw badRequest("Start two-factor setup first");
    // Enrolment must be proven with the authenticator itself, not a recovery code.
    const ver = verifyTwoFactorCode(cfg, { twoFactorSecretEncrypted: user.twoFactorSecretEncrypted }, code);
    if (!ver.valid) {
      await fail();
      await audit(req, { action: "auth.2fa_enroll_failed", entity: "user", entityId: user._id, userId: user._id, role: user.role });
      throw badRequest("Invalid verification code. Please check your authenticator app.");
    }
    await TwoFactorChallenge.deleteOne({ _id: ch._id });
    await User.updateOne({ _id: user._id }, { $set: { twoFactorEnabled: true, failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await audit(req, { action: "auth.2fa_enabled", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    const s = await startSession(cfg, req, res, user._id);
    await audit(req, { action: "auth.login", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    res.json({ data: { user: toSessionUser({ ...user.toObject(), twoFactorEnabled: true }), ...s } });
  });

  /**
   * Setup 2FA (signed-in user who has not enabled it): returns secret URI, QR code data URL, and recovery codes.
   * Refused once 2FA is enabled; otherwise anyone holding the session could silently replace or switch off 2FA.
   */
  r.post("/2fa/setup", authLimiter, requireAuth, async (req, res) => {
    const current = await User.findById(req.user!.userId).select("twoFactorEnabled").lean();
    if (!current) throw unauthenticated();
    if (current.twoFactorEnabled) {
      throw new AppError(409, "TWO_FACTOR_ALREADY_ENABLED", "Two-factor authentication is already enabled. Disable it with your password and a code first.");
    }
    const setup = await generateTwoFactorSetup(cfg, req.user!.email);
    await User.updateOne(
      { _id: req.user!.userId },
      { $set: { twoFactorSecretEncrypted: setup.secretEncrypted, twoFactorRecoveryCodes: setup.recoveryCodeHashes } },
    );
    await audit(req, { action: "auth.2fa_setup_started", entity: "user", entityId: req.user!.userId });
    res.json({ data: { uri: setup.uri, qrDataUrl: setup.qrDataUrl, recoveryCodes: setup.recoveryCodes } });
  });

  /** Verify TOTP token to activate 2FA. */
  r.post("/2fa/verify", authLimiter, requireAuth, validateBody(twoFactorVerifyInput), async (req, res) => {
    const { token } = req.body as { token: string };
    const user = await User.findById(req.user!.userId).select("+twoFactorSecretEncrypted +twoFactorRecoveryCodes");
    if (!user || !user.twoFactorSecretEncrypted) throw badRequest("2FA setup has not been initiated");
    if (user.twoFactorEnabled) throw new AppError(409, "TWO_FACTOR_ALREADY_ENABLED", "Two-factor authentication is already enabled.");

    // Activation must be proven with the authenticator itself, not a recovery code.
    const ver = verifyTwoFactorCode(cfg, { twoFactorSecretEncrypted: user.twoFactorSecretEncrypted }, token);
    if (!ver.valid) throw badRequest("Invalid verification code. Please check your authenticator app.");

    await User.updateOne({ _id: user._id }, { $set: { twoFactorEnabled: true } });
    await audit(req, { action: "auth.2fa_enabled", entity: "user", entityId: user._id });
    res.json({ data: { ok: true, twoFactorEnabled: true } });
  });

  /** Disable 2FA with current password + valid TOTP code. */
  r.post("/2fa/disable", authLimiter, requireAuth, validateBody(twoFactorDisableInput), async (req, res) => {
    const { password, code } = req.body as { password: string; code: string };
    const user = await User.findById(req.user!.userId).select("+passwordHash +twoFactorSecretEncrypted +twoFactorRecoveryCodes");
    if (!user) throw unauthenticated();
    if (!user.twoFactorEnabled) throw badRequest("Two-factor authentication is not enabled");
    if (cfg.REQUIRE_2FA_PRIVILEGED && PRIVILEGED_ROLES.includes(user.role as (typeof PRIVILEGED_ROLES)[number])) {
      throw forbidden("Two-factor authentication is mandatory for this role");
    }

    if (!(await verifyPassword(password, user.passwordHash))) throw unauthenticated("Password is incorrect");
    const ver = verifyTwoFactorCode(cfg, user, code);
    if (!ver.valid) {
      await audit(req, { action: "auth.2fa_disable_failed", entity: "user", entityId: user._id });
      throw badRequest("Invalid two-factor code");
    }

    await User.updateOne({ _id: user._id }, { $set: { twoFactorEnabled: false, twoFactorSecretEncrypted: null, twoFactorRecoveryCodes: [] } });
    await audit(req, { action: "auth.2fa_disabled", entity: "user", entityId: user._id });
    res.json({ data: { ok: true } });
  });

  /** Recent re-authentication for sensitive actions. */
  r.post("/reauth", authLimiter, requireAuth, validateBody(reauthInput), async (req, res) => {
    const { password, code } = req.body as { password: string; code?: string };
    const user = await User.findById(req.user!.userId).select("+passwordHash +twoFactorSecretEncrypted +twoFactorRecoveryCodes");
    if (!user) throw unauthenticated();

    if (!(await verifyPassword(password, user.passwordHash))) {
      await audit(req, { action: "auth.reauth_failed", entity: "user", entityId: user._id });
      throw unauthenticated("Password is incorrect");
    }

    if (user.twoFactorEnabled) {
      if (!code) throw badRequest("Two-factor authentication code is required");
      const ver = verifyTwoFactorCode(cfg, user, code);
      if (!ver.valid) {
        await audit(req, { action: "auth.reauth_failed", entity: "user", entityId: user._id });
        throw unauthenticated("Invalid two-factor authentication code");
      }
      if (ver.usedRecoveryHash) await User.updateOne({ _id: user._id }, { $pull: { twoFactorRecoveryCodes: ver.usedRecoveryHash } });
    }

    const reauthAt = new Date();
    await Session.updateOne({ _id: req.sessionId }, { $set: { reauthAt } });
    await audit(req, { action: "auth.reauth", entity: "user", entityId: user._id });
    res.json({ data: { reauthenticated: true, reauthAt } });
  });

  /** Forgot password: send password reset link/instructions. */
  r.post("/forgot-password", authLimiter, validateBody(forgotPasswordInput), async (req, res) => {
    const { email } = req.body as { email: string };
    const user = await User.findOne({ email });
    if (user) {
      const resetToken = newToken();
      await User.updateOne(
        { _id: user._id },
        { $set: { passwordResetTokenHash: hashToken(resetToken), passwordResetExpiresAt: new Date(Date.now() + 3600_000) } },
      );
      await notify(
        "user.password_reset",
        [{ userId: user._id, email: user.email }],
        { resetLink: `${cfg.webUrl}/reset-password?token=${resetToken}` },
      );
      await audit(req, { action: "auth.forgot_password_requested", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    }
    // Generic message to prevent email enumeration.
    res.json({ data: { message: "If that email is registered, password reset instructions have been sent." } });
  });

  /** Reset password using single-use hashed token. */
  r.post("/reset-password", authLimiter, validateBody(resetPasswordInput), async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };
    const user = await User.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
    });
    if (!user) throw badRequest("Invalid or expired password reset token");

    const passwordHash = await hashPassword(cfg, password);
    await User.updateOne(
      { _id: user._id },
      // A completed reset (or accepted invite) proves control of the mailbox and clears any lockout.
      { $set: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null, failedLogins: 0, lockedUntil: null, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } },
    );
    await revokeAllSessions(user._id);
    await audit(req, { action: "auth.password_reset", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    res.json({ data: { message: "Password has been reset successfully. Please log in with your new password." } });
  });

  /** Change password: requires current password, revokes other sessions. */
  r.post("/change-password", requireAuth, validateBody(changePasswordInput), async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const user = await User.findById(req.user!.userId).select("+passwordHash");
    if (!user) throw unauthenticated();

    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest("Current password is incorrect");

    const passwordHash = await hashPassword(cfg, newPassword);
    await User.updateOne({ _id: user._id }, { $set: { passwordHash } });
    // Revoke all other sessions
    await Session.updateMany({ userId: user._id, _id: { $ne: req.sessionId }, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await audit(req, { action: "auth.password_changed", entity: "user", entityId: user._id });
    res.json({ data: { message: "Password changed successfully" } });
  });

  r.post("/logout", requireAuth, async (req, res) => {
    await audit(req, { action: "auth.logout", entity: "user", entityId: req.user!.userId });
    await endSession(req, res);
    res.json({ data: { ok: true } });
  });

  /** Revoke all active sessions everywhere for this account. */
  r.post("/logout-all", requireAuth, async (req, res) => {
    await audit(req, { action: "auth.logout_all", entity: "user", entityId: req.user!.userId });
    await revokeAllSessions(req.user!.userId);
    await endSession(req, res);
    res.json({ data: { ok: true } });
  });

  /** Send mobile OTP for phone verification. */
  r.post("/send-mobile-otp", authLimiter, requireAuth, async (req, res) => {
    const user = await User.findById(req.user!.userId);
    if (!user) throw unauthenticated();
    if (!smsDeliveryAvailable()) throw new AppError(503, "SMS_NOT_CONFIGURED", "Mobile verification is not available yet.");
    const otp = String(randomInt(100000, 1_000_000)); // CSPRNG, uniform 6 digits
    await User.updateOne(
      { _id: user._id },
      { $set: { mobileOtpHash: hashToken(otp), mobileOtpExpiresAt: new Date(Date.now() + 10 * 60_000), mobileOtpAttempts: 0 } },
    );
    await audit(req, { action: "auth.mobile_otp_sent", entity: "user", entityId: user._id });
    await notify(
      "auth.mobile_otp",
      [{ userId: user._id, mobile: user.mobile }],
      { otp },
    );
    res.json({ data: { message: "OTP sent to your registered mobile number", expiresInSeconds: 600 } });
  });

  /** Verify mobile OTP. */
  r.post("/verify-mobile", authLimiter, requireAuth, validateBody(verifyMobileInput), async (req, res) => {
    const { otp } = req.body as { otp: string };
    const user = await User.findById(req.user!.userId).select("+mobileOtpHash +mobileOtpExpiresAt +mobileOtpAttempts");
    if (!user || !user.mobileOtpHash || !user.mobileOtpExpiresAt || user.mobileOtpExpiresAt < new Date()) {
      throw badRequest("Invalid or expired mobile verification code");
    }
    if (user.mobileOtpHash !== hashToken(otp)) {
      const attempts = (user.mobileOtpAttempts ?? 0) + 1;
      const burnt = attempts >= MAX_CODE_ATTEMPTS;
      // After MAX_CODE_ATTEMPTS wrong tries the code is burnt and a new one must be requested.
      await User.updateOne(
        { _id: user._id },
        burnt ? { $set: { mobileOtpHash: null, mobileOtpExpiresAt: null, mobileOtpAttempts: 0 } } : { $set: { mobileOtpAttempts: attempts } },
      );
      await audit(req, { action: "auth.mobile_otp_failed", entity: "user", entityId: user._id, after: { attempts } });
      throw badRequest(burnt ? "Too many wrong codes. Request a new OTP." : "Invalid mobile verification code");
    }
    await User.updateOne(
      { _id: user._id },
      { $set: { mobileVerifiedAt: new Date(), mobileOtpHash: null, mobileOtpExpiresAt: null, mobileOtpAttempts: 0 } },
    );
    await audit(req, { action: "auth.mobile_verified", entity: "user", entityId: user._id });
    res.json({ data: { verified: true } });
  });

  /** Send email verification link. */
  r.post("/send-email-verification", authLimiter, requireAuth, async (req, res) => {
    const user = await User.findById(req.user!.userId);
    if (!user) throw unauthenticated();
    const token = newToken();
    await User.updateOne(
      { _id: user._id },
      { $set: { emailVerificationTokenHash: hashToken(token), emailVerificationExpiresAt: new Date(Date.now() + 24 * 3600_000) } },
    );
    await notify(
      "auth.verify_email",
      [{ userId: user._id, email: user.email }],
      { link: `${cfg.webUrl}/verify-email?token=${token}` },
    );
    res.json({ data: { message: "Verification link sent to your registered email" } });
  });

  /** Verify email address. */
  r.post("/verify-email", authLimiter, validateBody(verifyEmailInput), async (req, res) => {
    const { token } = req.body as { token: string };
    const user = await User.findOne({
      emailVerificationTokenHash: hashToken(token),
      emailVerificationExpiresAt: { $gt: new Date() },
    });
    if (!user) throw badRequest("Invalid or expired email verification link");

    await User.updateOne(
      { _id: user._id },
      { $set: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null } },
    );
    await audit(req, { action: "auth.email_verified", entity: "user", entityId: user._id });
    res.json({ data: { verified: true } });
  });

  r.get("/me", requireAuth, (req, res) => {
    res.json({ data: { user: req.user } });
  });

  return r;
}
