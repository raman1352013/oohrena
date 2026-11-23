import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { PRIVILEGED_ROLES, scopeFor, type Permission, type Role, type Scope, type SessionUser } from "@oohrena/shared";
import type { Config } from "../config.js";
import { Session, User } from "../models/foundation.js";
import { AppError, forbidden, unauthenticated } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionId?: string;
      authVia?: "cookie" | "bearer";
      /** Scope granted by the last requirePermission check. */
      scope?: Scope;
    }
  }
}

export const SESSION_COOKIE = "oohrena_sid";
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

/** Resolves the session from the HttpOnly cookie or an Authorization: Bearer token. Never rejects. */
export function loadSession() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.get("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
    const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const token = bearer || cookie;
    if (!token) return next();
    const s = await Session.findOne({ tokenHash: hashToken(token), revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
    if (!s) return next();
    const u = await User.findById(s.userId).lean();
    if (!u || u.status === "suspended") return next();
    req.user = {
      userId: u._id,
      email: u.email,
      fullName: u.fullName,
      role: u.role as Role,
      status: u.status as SessionUser["status"],
      orgId: u.orgId ?? null,
      twoFactorEnabled: !!u.twoFactorEnabled,
      emailVerified: !!u.emailVerifiedAt,
      mobileVerified: !!u.mobileVerifiedAt,
    };
    req.sessionId = String(s._id);
    req.authVia = bearer ? "bearer" : "cookie";
    // Sliding activity marker, at most once a minute.
    if (Date.now() - new Date(s.lastSeenAt ?? 0).getTime() > 60_000) {
      await Session.updateOne({ _id: s._id }, { $set: { lastSeenAt: new Date() } });
    }
    next();
  };
}

/** Module 3 IP controls: is this address allowed for Admin/Finance? Always true when ADMIN_ALLOWED_IPS is empty. */
export function privilegedIpAllowed(cfg: Config, role: string, ip: string | undefined) {
  if (!PRIVILEGED_ROLES.includes(role as Role)) return true;
  const allowed = cfg.ADMIN_ALLOWED_IPS.split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const addr = (ip ?? "").replace(/^::ffff:/, "");
  return allowed.includes(addr);
}

/** Refuses every Admin/Finance request from an address outside ADMIN_ALLOWED_IPS (and logs it). */
export function restrictPrivilegedIps(cfg: Config) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || privilegedIpAllowed(cfg, req.user.role, req.ip)) return next();
    await audit(req, { action: "auth.ip_blocked", entity: "user", entityId: req.user.userId, after: { ip: req.ip ?? null } });
    next(new AppError(403, "FORBIDDEN", "Access from this network is not allowed for your role"));
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthenticated());
  next();
}

/** Role check from the shared matrix. Object-level (own/assigned) checks happen in each handler using req.scope. */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    const scope = scopeFor(req.user.role, permission);
    if (!scope) return next(forbidden());
    req.scope = scope;
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/**
 * Re-authentication check: sensitive actions require recent re-auth (default 10 minutes).
 * Caller must re-authenticate via POST /auth/reauth to refresh s.reauthAt.
 */
export function requireRecentAuth(maxMinutes = 10) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !req.sessionId) return next(unauthenticated());
    const s = await Session.findById(req.sessionId).lean();
    if (!s || !s.reauthAt) return next(new AppError(401, "REAUTH_REQUIRED", "Recent authentication is required for this action"));
    const ageMinutes = (Date.now() - new Date(s.reauthAt).getTime()) / 60_000;
    if (ageMinutes > maxMinutes) {
      return next(new AppError(401, "REAUTH_REQUIRED", `Please re-authenticate to perform this action (requires re-auth within ${maxMinutes} minutes)`));
    }
    next();
  };
}

/**
 * CSRF protection for cookie-authenticated, state-changing requests:
 * the Origin (or Referer) must be one of the configured frontend origins.
 * Bearer-token requests are not exposed to CSRF and skip this check.
 */
export function csrfGuard(cfg: Config) {
  const allowed = new Set(cfg.corsOrigins);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const hasCookie = !!(req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!hasCookie || req.get("authorization")?.startsWith("Bearer ")) return next();
    const origin = req.get("origin") ?? (req.get("referer") ? new URL(req.get("referer")!).origin : undefined);
    if (!origin || !allowed.has(origin)) return next(forbidden("Cross-site request blocked"));
    next();
  };
}
