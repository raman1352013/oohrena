import { Router } from "express";
import { z } from "zod";
import { ROLES, roleAssignInput } from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { AppError, notFound } from "../lib/errors.js";
import { withTransaction } from "../lib/tx.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { User } from "../models/foundation.js";
import { revokeAllSessions, toSessionUser } from "../services/session.js";

const listQuery = z.object({
  role: z.enum(ROLES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Module 10: admin user management. */
export function adminUserRoutes() {
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
    res.json({ data: { items: items.map((u) => ({ ...toSessionUser(u), lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })), total, page: q.page, pageSize: q.pageSize } });
  });

  /** Role change is logged with before/after and a mandatory reason; the user's sessions are revoked. */
  r.post("/users/:id/role", requirePermission("users.role.assign"), validateBody(roleAssignInput), async (req, res) => {
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
