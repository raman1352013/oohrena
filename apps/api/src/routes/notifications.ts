import { Router } from "express";
import { z } from "zod";
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, NOTIFICATION_STATUSES, notificationTemplateInput, notificationTemplateUpdateInput } from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { Notification, NotificationTemplate } from "../models/notification.js";
import { ensureDefaultTemplates } from "../services/notifications.js";

export function notificationRoutes() {
  const r = Router();

  /* ---------- Notification Templates (Admin) ---------- */
  r.get("/admin/notification-templates", requirePermission("notifications.manage"), async (_req, res) => {
    await ensureDefaultTemplates();
    const templates = await NotificationTemplate.find({}).sort({ event: 1, channel: 1 }).lean();
    res.json({ data: templates.map((t) => ({ ...t, id: t._id })) });
  });

  r.post("/admin/notification-templates", requirePermission("notifications.manage"), validateBody(notificationTemplateInput), async (req, res) => {
    const input = req.body as z.infer<typeof notificationTemplateInput>;
    const tplId = await nextId("TPL");
    const t = await NotificationTemplate.create({
      _id: tplId,
      templateId: tplId,
      event: input.event,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      approvedBy: req.user!.userId,
      active: input.active ?? true,
    });
    await audit(req, { action: "notification.template.create", entity: "notification_template", entityId: tplId, after: input });
    res.status(201).json({ data: { ...t.toObject(), id: t._id } });
  });

  r.put("/admin/notification-templates/:id", requirePermission("notifications.manage"), validateBody(notificationTemplateUpdateInput), async (req, res) => {
    const input = req.body as z.infer<typeof notificationTemplateUpdateInput>;
    const id = String(req.params.id);
    const before = await NotificationTemplate.findById(id).lean();
    if (!before) throw notFound("Template not found");

    const after = await NotificationTemplate.findByIdAndUpdate(
      id,
      { $set: { ...input, approvedBy: req.user!.userId } },
      { returnDocument: "after" },
    ).lean();

    await audit(req, {
      action: "notification.template.update",
      entity: "notification_template",
      entityId: id,
      before: { subject: before.subject, body: before.body, active: before.active },
      after: { subject: after!.subject, body: after!.body, active: after!.active },
    });
    res.json({ data: { ...after!, id: after!._id } });
  });

  /* ---------- Notification Delivery Logs (Admin) ---------- */
  r.get("/notifications/delivery", requirePermission("notifications.read"), async (req, res) => {
    const q = parseQuery(
      z.object({
        event: z.enum(NOTIFICATION_EVENTS).optional(),
        channel: z.enum(NOTIFICATION_CHANNELS).optional(),
        status: z.enum(NOTIFICATION_STATUSES).optional(),
        userId: z.string().trim().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req,
    );

    const filter: Record<string, unknown> = {};
    if (q.event) filter.event = q.event;
    if (q.channel) filter.channel = q.channel;
    if (q.status) filter.status = q.status;
    if (q.userId) filter.userId = q.userId;

    const [items, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      Notification.countDocuments(filter),
    ]);

    res.json({
      data: {
        items: items.map((n) => ({
          notificationId: n._id,
          userId: n.userId,
          channel: n.channel,
          template: n.template,
          event: n.event,
          recipient: n.recipient,
          status: n.status,
          sentAt: n.sentAt,
          providerRef: n.providerRef,
          error: n.error,
          createdAt: n.createdAt,
        })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      },
    });
  });

  return r;
}
