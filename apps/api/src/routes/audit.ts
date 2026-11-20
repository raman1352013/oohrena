import { Router } from "express";
import { z } from "zod";
import { renderPdf } from "../lib/pdf.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery } from "../middleware/validate.js";
import { AuditLog } from "../models/audit-log.js";
import { logReportExport, toCsvRow } from "../services/reports.js";

const query = z.object({
  userId: z.string().trim().max(40).optional(),
  entity: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(60).optional(),
  action: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  format: z.enum(["json", "csv", "pdf"]).default("json"),
});

/** Module 3/9: searchable, read-only audit trail (Admin, Finance/Audit). No write routes exist. */
export function auditRoutes() {
  const r = Router();
  r.get("/", requirePermission("audit.read"), async (req, res) => {
    const q = parseQuery(query, req);
    const filter: Record<string, unknown> = {};
    for (const k of ["userId", "entity", "entityId", "action"] as const) if (q[k]) filter[k] = q[k];
    if (q.from || q.to) filter.at = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };

    if (q.format === "json") {
      const [items, total] = await Promise.all([
        AuditLog.find(filter).sort({ at: -1, _id: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
        AuditLog.countDocuments(filter),
      ]);
      return res.json({ data: { items: items.map(({ _id, ...rest }) => ({ logId: String(_id), ...rest })), total, page: q.page, pageSize: q.pageSize } });
    }

    const exportLimit = 1000;
    const items = await AuditLog.find(filter).sort({ at: -1, _id: -1 }).limit(exportLimit).lean();
    await logReportExport(req, "audit", filter, q.format);

    res.setHeader("Content-Disposition", `attachment; filename="audit-log.${q.format}"`);

    if (q.format === "csv") {
      const lines = [toCsvRow(["Timestamp", "User ID", "Role", "Action", "Entity", "Entity ID", "Reason", "IP"])];
      for (const i of items) {
        lines.push(toCsvRow([i.at.toISOString(), i.userId, i.role, i.action, i.entity, i.entityId, i.reason, i.ip]));
      }
      return res.type("text/csv").send(lines.join("\n"));
    }

    const pdf = await renderPdf("Audit Trail Export", `Generated ${new Date().toISOString()} · Filtered records`, [
      { kind: "heading", text: "Audit Events" },
      {
        kind: "table",
        head: ["Timestamp", "User", "Role", "Action", "Entity", "Entity ID"],
        rows: items.slice(0, 50).map((i) => [i.at.toISOString().slice(0, 16), i.userId ?? "system", i.role ?? "—", i.action, i.entity, i.entityId ?? "—"]),
      },
    ]);
    return res.type("application/pdf").send(pdf);
  });
  return r;
}
