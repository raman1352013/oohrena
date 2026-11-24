import crypto from "node:crypto";
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
  actorType?: "user" | "system" | "impersonation";
  requestId?: string | null;
  ip?: string | null;
  device?: string | null;
};

/** Never put secrets in before/after — strip them here as a last line of defence. */
const SECRET_KEYS = new Set([
  "password",
  "passwordHash",
  "tokenHash",
  "token",
  "accountNo",
  "totpSecret",
  "twoFactorSecretEncrypted",
  "twoFactorRecoveryCodes",
]);

export function redact(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v ?? null;
  if (Array.isArray(v)) return v.map(redact);
  if (v instanceof Date) return v;
  const plain = typeof (v as any).toObject === "function" ? (v as any).toObject() : v;
  return Object.fromEntries(
    Object.entries(plain as Record<string, unknown>)
      .filter(([k]) => !SECRET_KEYS.has(k))
      .map(([k, x]) => [k, redact(x)]),
  );
}

export function computeLogHash(entry: {
  prevHash: string;
  at: Date | string;
  userId?: string | null;
  role?: string | null;
  actorType?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
}): string {
  const payload = JSON.stringify({
    prevHash: entry.prevHash,
    at: entry.at instanceof Date ? entry.at.toISOString() : entry.at,
    userId: entry.userId ?? null,
    role: entry.role ?? null,
    actorType: entry.actorType ?? "user",
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    requestId: entry.requestId ?? null,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function audit(req: Request | null, e: AuditEntry, session?: ClientSession) {
  const at = new Date();
  const userId = e.userId !== undefined ? e.userId : (req?.user?.userId ?? null);
  const role = e.role !== undefined ? e.role : (req?.user?.role ?? null);
  const actorType = e.actorType ?? ((req as any)?.impersonator ? "impersonation" : userId ? "user" : "system");
  const ip = e.ip !== undefined ? e.ip : (req?.ip ?? null);
  const userAgent = req?.get("user-agent")?.slice(0, 300) ?? null;
  const device = e.device !== undefined ? e.device : userAgent;
  const requestId = e.requestId !== undefined ? e.requestId : ((req?.headers?.["x-request-id"] as string) ?? null);
  const redactedBefore = redact(e.before);
  const redactedAfter = redact(e.after);

  // Retrieve the latest audit log entry to link the hash chain
  const lastLog = await AuditLog.findOne({}, { hash: 1 }).sort({ _id: -1 }).session(session ?? null).lean();
  const prevHash = lastLog?.hash ?? "GENESIS";

  const hash = computeLogHash({
    prevHash,
    at,
    userId,
    role,
    actorType,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    before: redactedBefore,
    after: redactedAfter,
    reason: e.reason ?? null,
    requestId,
  });

  await AuditLog.create(
    [
      {
        at,
        userId,
        role,
        actorType,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        before: redactedBefore,
        after: redactedAfter,
        reason: e.reason ?? null,
        ip,
        device,
        userAgent,
        requestId,
        prevHash,
        hash,
      },
    ],
    { session },
  );
}

export function verifyAuditChain(
  logs: Array<{
    prevHash: string;
    hash: string;
    at: Date | string;
    userId?: string | null;
    role?: string | null;
    actorType?: string;
    action: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
    requestId?: string | null;
  }>,
): { valid: boolean; brokenAt?: number; reason?: string } {
  for (let i = 0; i < logs.length; i++) {
    const current = logs[i]!;
    // 1. Verify self-hash matches payload
    const expectedHash = computeLogHash({
      prevHash: current.prevHash,
      at: current.at,
      userId: current.userId,
      role: current.role,
      actorType: current.actorType,
      action: current.action,
      entity: current.entity,
      entityId: current.entityId,
      before: current.before,
      after: current.after,
      reason: current.reason,
      requestId: current.requestId,
    });
    if (expectedHash !== current.hash) {
      return { valid: false, brokenAt: i, reason: `Hash mismatch at index ${i}` };
    }
    // 2. Verify prevHash matches previous item's hash
    if (i > 0) {
      const prev = logs[i - 1]!;
      if (current.prevHash !== prev.hash) {
        return { valid: false, brokenAt: i, reason: `Chain broken between index ${i - 1} and ${i}` };
      }
    }
  }
  return { valid: true };
}
