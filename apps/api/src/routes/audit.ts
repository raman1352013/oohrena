import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery } from "../middleware/validate.js";
import { AuditLog } from "../models/audit-log.js";

const query = z.object({
  userId: z.string().trim().max(40).optional(),
  entity: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(60).optional(),
  action: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Module 3/9: searchable, read-only audit trail (Admin, Finance/Audit). No write routes exist. */
export function auditRoutes() {
  const r = Router();
  r.get("/", requirePermission("audit.read"), async (req, res) => {
    const q = parseQuery(query, req);
    const filter: Record<string, unknown> = {};
    for (const k of ["userId", "entity", "entityId", "action"] as const) if (q[k]) filter[k] = q[k];
    if (q.from || q.to) filter.at = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ at: -1, _id: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ data: { items: items.map(({ _id, ...rest }) => ({ logId: String(_id), ...rest })), total, page: q.page, pageSize: q.pageSize } });
  });
  return r;
}
