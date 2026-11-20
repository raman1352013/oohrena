import { Router } from "express";
import { z } from "zod";
import { createStaffUserInput, ROLES, roleAssignInput, type CreateStaffUserInput } from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, conflict, forbidden, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { withTransaction } from "../lib/tx.js";
import { hashToken, newToken, requirePermission, requireRecentAuth } from "../middleware/auth.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { GrowthPartner, Session, User } from "../models/foundation.js";
import { notify } from "../services/notifications.js";
import { hashPassword, revokeAllSessions, toSessionUser } from "../services/session.js";

const listQuery = z.object({
  role: z.enum(ROLES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Module 10: admin user management. */
export function adminUserRoutes(cfg: Config) {
  const r = Router();

  r.get("/users", requirePermission("users.manage"), async (req, res) => {
    const q = parseQuery(listQuery, req);
    const filter: Record<string, unknown> = {};
    if (q.role) filter.role = q.role;
    if (q.q) filter.$or = [{ email: new RegExp(escapeRe(q.q), "i") }, { fullName: new RegExp(escapeRe(q.q), "i") }, { _id: q.q }];
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      User.countDocuments(filter),
    ]);
    res.json({
      data: {
        items: items.map((u) => ({ ...toSessionUser(u), lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      },
    });
  });

  /** Create named Admin/Finance/Growth Partner user; dispatches invite notification with set-password link. */
  r.post("/users", requirePermission("users.manage"), validateBody(createStaffUserInput), async (req, res) => {
    const input = req.body as CreateStaffUserInput;
    const existing = await User.findOne({ $or: [{ email: input.email }, { mobile: input.mobile }] }).lean();
    if (existing) {
      throw conflict(existing.email === input.email ? "Email is already registered" : "Mobile number is already registered");
    }

    const inviteToken = newToken();
    const tempPassword = newToken();
    const passwordHash = await hashPassword(cfg, tempPassword);

    const out = await withTransaction(async (session) => {
      const userId = await nextId("USR", session);
      let orgId: string | null = null;
      if (input.role === "growth_partner") {
        orgId = await nextId("GP", session);
        await GrowthPartner.create([{ _id: orgId, userId, name: input.fullName }], { session });
      }

      const [user] = await User.create(
        [
          {
            _id: userId,
            email: input.email,
            mobile: input.mobile,
            fullName: input.fullName,
            passwordHash,
            role: input.role,
            status: "active",
            orgId,
            createdBy: req.user!.userId,
            passwordResetTokenHash: hashToken(inviteToken),
            passwordResetExpiresAt: new Date(Date.now() + 7 * 86400_000), // 7-day invite validity
          },
        ],
        { session },
      );

      await audit(
        req,
        {
          action: "admin.user_created",
          entity: "user",
          entityId: userId,
          after: { role: input.role, email: input.email, fullName: input.fullName, orgId },
        },
        session,
      );

      return { user: toSessionUser(user!.toObject()), inviteToken };
    });

    await notify(
      "user.invited",
      [{ userId: out.user.userId, email: input.email }],
      {
        role: input.role,
        fullName: input.fullName,
        inviteLink: `/reset-password?token=${out.inviteToken}`,
      },
    );

    res.status(201).json({ data: out });
  });

  /** Suspend a user account. Requires recent re-authentication. */
  r.post("/users/:id/suspend", requirePermission("users.manage"), requireRecentAuth(), async (req, res) => {
    const id = String(req.params.id);
    if (id === req.user!.userId) throw forbidden("You cannot suspend your own account");

    const user = await User.findById(id);
    if (!user) throw notFound("User not found");

    await User.updateOne({ _id: id }, { $set: { status: "suspended" } });
    await revokeAllSessions(id);
    await audit(req, { action: "admin.user_suspended", entity: "user", entityId: id, before: { status: user.status }, after: { status: "suspended" } });
    res.json({ data: { ok: true, status: "suspended" } });
  });

  /** Reactivate a suspended user account. Requires recent re-authentication. */
  r.post("/users/:id/reactivate", requirePermission("users.manage"), requireRecentAuth(), async (req, res) => {
    const id = String(req.params.id);
    const user = await User.findById(id);
    if (!user) throw notFound("User not found");

    await User.updateOne({ _id: id }, { $set: { status: "active" } });
    await audit(req, { action: "admin.user_reactivated", entity: "user", entityId: id, before: { status: user.status }, after: { status: "active" } });
    res.json({ data: { ok: true, status: "active" } });
  });

  /** List active sessions for a user. */
  r.get("/users/:id/sessions", requirePermission("users.manage"), async (req, res) => {
    const id = String(req.params.id);
    const sessions = await Session.find({ userId: id, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastSeenAt: -1 })
      .lean();

    res.json({
      data: sessions.map((s) => ({
        sessionId: String(s._id),
        issuedAt: s.issuedAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        ip: s.ip,
        device: s.device,
        current: String(s._id) === req.sessionId,
      })),
    });
  });

  /** Revoke a specific session for a user. */
  r.delete("/users/:id/sessions/:sessionId", requirePermission("users.manage"), async (req, res) => {
    const id = String(req.params.id);
    const sessionId = String(req.params.sessionId);
    await Session.updateOne({ _id: sessionId, userId: id }, { $set: { revokedAt: new Date() } });
    await audit(req, { action: "admin.session_revoked", entity: "session", entityId: sessionId });
    res.json({ data: { ok: true } });
  });

  /** Revoke all active sessions for a user. */
  r.delete("/users/:id/sessions", requirePermission("users.manage"), async (req, res) => {
    const id = String(req.params.id);
    await revokeAllSessions(id);
    await audit(req, { action: "admin.sessions_revoked_all", entity: "user", entityId: id });
    res.json({ data: { ok: true } });
  });

  /** Role change is logged with before/after and a mandatory reason; the user's sessions are revoked. Requires recent re-auth. */
  r.post("/users/:id/role", requirePermission("users.role.assign"), requireRecentAuth(), validateBody(roleAssignInput), async (req, res) => {
    const id = String(req.params.id);
    const { role, reason } = req.body as z.infer<typeof roleAssignInput>;
    if (id === req.user!.userId) throw new AppError(403, "FORBIDDEN", "You cannot change your own role");
    const out = await withTransaction(async (session) => {
      const before = await User.findById(id).session(session).lean();
      if (!before) throw notFound("User not found");
      if (before.role === role) return toSessionUser(before);
      const after = await User.findOneAndUpdate({ _id: id }, { $set: { role } }, { returnDocument: "after", session }).lean();
      await revokeAllSessions(id, session);
      await audit(req, { action: "user.role.assign", entity: "user", entityId: id, before: { role: before.role }, after: { role }, reason }, session);
      return toSessionUser(after!);
    });
    res.json({ data: out });
  });

  return r;
}
