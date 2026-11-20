import { Router } from "express";
import { CONSENT_DOCUMENTS, CURRENT_CONSENT_VERSION, loginInput, registerClientInput, type RegisterClientInput } from "@oohrena/shared";
import type { Config } from "../config.js";
import { AppError, unauthenticated } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { nextId } from "../lib/ids.js";
import { withTransaction } from "../lib/tx.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { Client, Consent, User } from "../models/foundation.js";
import { dummyHashFor, endSession, hashPassword, startSession, toSessionUser, verifyPassword } from "../services/session.js";

export function consentDocs(userId: string, ip: string | undefined) {
  return CONSENT_DOCUMENTS.map((document) => ({ userId, document, version: CURRENT_CONSENT_VERSION, ip }));
}

export function authRoutes(cfg: Config, authLimiter: import("express").RequestHandler) {
  const r = Router();

  /** Module 1: client self-registration. Role is fixed to "client" server-side. */
  r.post("/register", authLimiter, validateBody(registerClientInput), async (req, res) => {
    const input = req.body as RegisterClientInput;
    const passwordHash = await hashPassword(cfg, input.password);
    const out = await withTransaction(async (session) => {
      const userId = await nextId("USR", session);
      const clientId = await nextId("CLT", session);
      const [user] = await User.create(
        [{ _id: userId, email: input.email, mobile: input.mobile, fullName: input.fullName, passwordHash, role: "client", status: "active", orgId: clientId }],
        { session },
      );
      await Client.create([{ _id: clientId, userId, companyName: input.companyName, gstin: input.gstin ?? null }], { session });
      await Consent.create(consentDocs(userId, req.ip), { session, ordered: true });
      await audit(req, { action: "auth.register", entity: "user", entityId: userId, after: { role: "client", email: input.email, clientId }, userId, role: "client" }, session);
      const s = await startSession(cfg, req, res, userId, session);
      return { user: toSessionUser(user!.toObject()), ...s };
    });
    res.status(201).json({ data: out });
  });

  r.post("/login", authLimiter, validateBody(loginInput), async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await User.findOne({ email }).select("+passwordHash +failedLogins +lockedUntil");
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
    await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const s = await startSession(cfg, req, res, user._id);
    await audit(req, { action: "auth.login", entity: "user", entityId: user._id, userId: user._id, role: user.role });
    res.json({ data: { user: toSessionUser(user.toObject()), ...s } });
  });

  r.post("/logout", requireAuth, async (req, res) => {
    await audit(req, { action: "auth.logout", entity: "user", entityId: req.user!.userId });
    await endSession(req, res);
    res.json({ data: { ok: true } });
  });

  r.get("/me", requireAuth, (req, res) => {
    res.json({ data: { user: req.user } });
  });

  return r;
}
