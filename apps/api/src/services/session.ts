import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import type { ClientSession } from "mongoose";
import type { SessionUser } from "@oohrena/shared";
import type { Config } from "../config.js";
import { Session } from "../models/foundation.js";
import { SESSION_COOKIE, hashToken, newToken } from "../middleware/auth.js";

export const hashPassword = (cfg: Config, plain: string) => bcrypt.hash(plain, cfg.BCRYPT_COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
/** Compared against when the email is unknown, so response time doesn't reveal which emails exist. */
let dummyHash: string | undefined;
export const dummyHashFor = (cfg: Config) => (dummyHash ??= bcrypt.hashSync("not-a-real-password", cfg.BCRYPT_COST));

/** Issues a fresh session (new token on every login = session rotation) and sets the HttpOnly cookie. */
export async function startSession(cfg: Config, req: Request, res: Response, userId: string, session?: ClientSession) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + cfg.SESSION_TTL_HOURS * 3600_000);
  const now = new Date();
  await Session.create([{ tokenHash: hashToken(token), userId, expiresAt, ip: req.ip, device: req.get("user-agent")?.slice(0, 200), reauthAt: now }], { session });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cfg.secureCookies,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  // Non-browser API clients (mobile/field app, tests) may ask for a bearer token explicitly.
  return { token: req.get("x-auth-mode") === "token" ? token : undefined, expiresAt };
}

export async function endSession(req: Request, res: Response) {
  if (req.sessionId) await Session.updateOne({ _id: req.sessionId }, { $set: { revokedAt: new Date() } });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export const revokeAllSessions = (userId: string, session?: ClientSession) =>
  Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });

export const toSessionUser = (u: {
  _id: string;
  email: string;
  fullName: string;
  role: string;
  status?: string | null;
  orgId?: string | null;
  twoFactorEnabled?: boolean | null;
  emailVerifiedAt?: Date | null;
  mobileVerifiedAt?: Date | null;
}): SessionUser => ({
  userId: u._id,
  email: u.email,
  fullName: u.fullName,
  role: u.role as SessionUser["role"],
  status: (u.status ?? "active") as SessionUser["status"],
  orgId: u.orgId ?? null,
  twoFactorEnabled: !!u.twoFactorEnabled,
  emailVerified: !!u.emailVerifiedAt,
  mobileVerified: !!u.mobileVerifiedAt,
});
