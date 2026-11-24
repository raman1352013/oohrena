import { Router } from "express";
import { z } from "zod";
import {
  createStaffUserInput,
  isStaffRole,
  ROLES,
  roleAssignInput,
  staffActionApproveInput,
  staffActionRejectInput,
  userSuspendInput,
  type CreateStaffUserInput,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
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
        items: items.map((u) => ({
          ...toSessionUser(u),
          isStaff: !!u.isStaff || isStaffRole(u.role),
          pendingAction: u.pendingAction ?? null,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        })),
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
            isStaff: isStaffRole(input.role),
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

    const inviteLink = `${cfg.webUrl}/reset-password?token=${out.inviteToken}`;
    const sent = await notify("user.invited", [{ userId: out.user.userId, email: input.email }], {
      role: input.role,
      fullName: input.fullName,
      inviteLink,
    });
    const inviteSent = sent.some((n) => n.status === "sent");

    // The set-password link is a credential for the new user, so it goes only to their mailbox.
    // Local development has no mail server, so there (only) it is also returned for the admin to copy.
    const devOnly = cfg.NODE_ENV === "development" || cfg.NODE_ENV === "test";
    res.status(201).json({ data: { user: out.user, inviteSent, ...(devOnly ? { devInviteLink: inviteLink } : {}) } });
  });

  /** Suspend a user account with a mandatory reason. Requires recent re-authentication. Maker-checker for staff. */
  r.post("/users/:id/suspend", requirePermission("users.manage"), requireRecentAuth(), validateBody(userSuspendInput), async (req, res) => {
    const id = String(req.params.id);
    const { reason } = req.body as { reason: string };
    if (id === req.user!.userId) throw forbidden("You cannot suspend your own account");

    const user = await User.findById(id);
    if (!user) throw notFound("User not found");

    if (["verifier", "ops", "auditor"].includes(user.role)) {
      const pendingAction = {
        type: "suspend" as const,
        reason,
        proposedBy: req.user!.userId,
        proposedAt: new Date(),
      };
      await User.updateOne({ _id: id }, { $set: { pendingAction } });
      await audit(req, {
        action: "admin.staff_suspend_proposed",
        entity: "user",
        entityId: id,
        reason,
        after: { pendingAction },
      });
      res.status(202).json({
        data: {
          pending: true,
          message: "Staff suspension submitted for checker approval",
          pendingAction,
        },
      });
      return;
    }

    await User.updateOne({ _id: id }, { $set: { status: "suspended" } });
    await revokeAllSessions(id);
    await audit(req, { action: "admin.user_suspended", entity: "user", entityId: id, before: { status: user.status }, after: { status: "suspended" }, reason });
    res.json({ data: { ok: true, status: "suspended" } });
  });

  /** Reactivate a suspended user account. Requires recent re-authentication. Maker-checker for staff. */
  r.post("/users/:id/reactivate", requirePermission("users.manage"), requireRecentAuth(), async (req, res) => {
    const id = String(req.params.id);
    const user = await User.findById(id);
    if (!user) throw notFound("User not found");

    if (["verifier", "ops", "auditor"].includes(user.role)) {
      const reason = (req.body as any)?.reason || "Staff reinstatement requested";
      const pendingAction = {
        type: "reactivate" as const,
        reason,
        proposedBy: req.user!.userId,
        proposedAt: new Date(),
      };
      await User.updateOne({ _id: id }, { $set: { pendingAction } });
      await audit(req, {
        action: "admin.staff_reactivate_proposed",
        entity: "user",
        entityId: id,
        reason,
        after: { pendingAction },
      });
      res.status(202).json({
        data: {
          pending: true,
          message: "Staff reinstatement submitted for checker approval",
          pendingAction,
        },
      });
      return;
    }

    await User.updateOne({ _id: id }, { $set: { status: "active" } });
    await audit(req, { action: "admin.user_reactivated", entity: "user", entityId: id, before: { status: user.status }, after: { status: "active" } });
    res.json({ data: { ok: true, status: "active" } });
  });

  /** Checker approves a pending staff action (role change, suspension, reinstatement). Maker cannot approve own proposal. */
  r.post("/users/:id/approve-action", requirePermission("users.manage"), requireRecentAuth(), validateBody(staffActionApproveInput), async (req, res) => {
    const id = String(req.params.id);
    const { reason: approvalComment } = req.body as { reason?: string };
    const user = await User.findById(id);
    if (!user) throw notFound("User not found");
    if (!user.pendingAction) throw badRequest("No pending action for this user");

    if (user.pendingAction.proposedBy === req.user!.userId) {
      throw badRequest("Maker cannot approve their own staff action; another admin must review and approve (maker-checker).");
    }

    const action = user.pendingAction;
    if (action.type === "role_change") {
      const newRole = action.targetRole!;
      await User.updateOne({ _id: id }, { $set: { role: newRole, isStaff: isStaffRole(newRole), pendingAction: null } });
      await revokeAllSessions(id);
      await audit(req, {
        action: "user.role.assign",
        entity: "user",
        entityId: id,
        before: { role: user.role },
        after: { role: newRole },
        reason: approvalComment ? `${action.reason} (Approved: ${approvalComment})` : action.reason,
      });
      res.json({ data: { ok: true, role: newRole } });
    } else if (action.type === "suspend") {
      await User.updateOne({ _id: id }, { $set: { status: "suspended", pendingAction: null } });
      await revokeAllSessions(id);
      await audit(req, {
        action: "admin.user_suspended",
        entity: "user",
        entityId: id,
        before: { status: user.status },
        after: { status: "suspended" },
        reason: approvalComment ? `${action.reason} (Approved: ${approvalComment})` : action.reason,
      });
      res.json({ data: { ok: true, status: "suspended" } });
    } else if (action.type === "reactivate") {
      await User.updateOne({ _id: id }, { $set: { status: "active", pendingAction: null } });
      await audit(req, {
        action: "admin.user_reactivated",
        entity: "user",
        entityId: id,
        before: { status: user.status },
        after: { status: "active" },
        reason: approvalComment ? `${action.reason} (Approved: ${approvalComment})` : action.reason,
      });
      res.json({ data: { ok: true, status: "active" } });
    }
  });

  /** Checker rejects a pending staff action. */
  r.post("/users/:id/reject-action", requirePermission("users.manage"), requireRecentAuth(), validateBody(staffActionRejectInput), async (req, res) => {
    const id = String(req.params.id);
    const { reason } = req.body as { reason: string };
    const user = await User.findById(id);
    if (!user) throw notFound("User not found");
    if (!user.pendingAction) throw badRequest("No pending action for this user");

    const action = user.pendingAction;
    const actionObj = typeof (action as any).toObject === "function" ? (action as any).toObject() : JSON.parse(JSON.stringify(action));
    await User.updateOne({ _id: id }, { $set: { pendingAction: null } });
    await audit(req, {
      action: "admin.staff_action_rejected",
      entity: "user",
      entityId: id,
      reason,
      before: { pendingAction: actionObj },
    });
    res.json({ data: { ok: true, rejected: true } });
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

  /** Role change is logged with before/after and a mandatory reason; the user's sessions are revoked. Requires recent re-auth. Maker-checker for staff. */
  r.post("/users/:id/role", requirePermission("users.role.assign"), requireRecentAuth(), validateBody(roleAssignInput), async (req, res) => {
    const id = String(req.params.id);
    const { role, reason } = req.body as z.infer<typeof roleAssignInput>;
    if (id === req.user!.userId) throw new AppError(403, "FORBIDDEN", "You cannot change your own role");

    const before = await User.findById(id).lean();
    if (!before) throw notFound("User not found");
    if (before.role === role) return res.json({ data: toSessionUser(before) });

    if (["verifier", "ops", "auditor"].includes(role) || ["verifier", "ops", "auditor"].includes(before.role)) {
      const pendingAction = {
        type: "role_change" as const,
        targetRole: role,
        reason,
        proposedBy: req.user!.userId,
        proposedAt: new Date(),
      };
      await User.updateOne({ _id: id }, { $set: { pendingAction } });
      await audit(req, {
        action: "admin.staff_role_change_proposed",
        entity: "user",
        entityId: id,
        before: { role: before.role },
        after: { pendingRole: role },
        reason,
      });
      res.status(202).json({
        data: {
          pending: true,
          message: "Staff role change submitted for checker approval",
          pendingAction,
        },
      });
      return;
    }

    const out = await withTransaction(async (session) => {
      const after = await User.findOneAndUpdate(
        { _id: id },
        { $set: { role, isStaff: isStaffRole(role) } },
        { returnDocument: "after", session },
      ).lean();
      await revokeAllSessions(id, session);
      await audit(req, { action: "user.role.assign", entity: "user", entityId: id, before: { role: before.role }, after: { role }, reason }, session);
      return toSessionUser(after!);
    });
    res.json({ data: out });
  });

  return r;
}
