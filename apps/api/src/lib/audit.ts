import type { Request } from "express";
import type { ClientSession } from "mongoose";
import { AuditLog } from "../models/audit-log.js";

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  /** Override the actor (e.g. a login attempt before a session exists). */
  userId?: string | null;
  role?: string | null;
};

/** Never put secrets in before/after — strip them here as a last line of defence. */
const SECRET_KEYS = new Set(["password", "passwordHash", "tokenHash", "token", "accountNo", "totpSecret"]);
function redact(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v ?? null;
  if (Array.isArray(v)) return v.map(redact);
  if (v instanceof Date) return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !SECRET_KEYS.has(k)).map(([k, x]) => [k, redact(x)]));
}

export async function audit(req: Request | null, e: AuditEntry, session?: ClientSession) {
  await AuditLog.create(
    [
      {
        userId: e.userId !== undefined ? e.userId : (req?.user?.userId ?? null),
        role: e.role !== undefined ? e.role : (req?.user?.role ?? null),
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        before: redact(e.before),
        after: redact(e.after),
        reason: e.reason ?? null,
        ip: req?.ip ?? null,
        userAgent: req?.get("user-agent")?.slice(0, 300) ?? null,
      },
    ],
    { session },
  );
}
