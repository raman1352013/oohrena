import { Router } from "express";
import mongoose from "mongoose";
import type { z } from "zod";
import { consentInput } from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { Consent, SystemEvent } from "../models/foundation.js";

/** GET /api/v1/system/health — no sensitive data. */
export function healthRoutes() {
  const r = Router();
  r.get("/health", (_req, res) => {
    const db = mongoose.connection.readyState === 1 ? "up" : "down";
    res.status(db === "up" ? 200 : 503).json({ data: { status: db === "up" ? "ok" : "degraded", db, time: new Date().toISOString() } });
  });
  return r;
}

/** GET/POST /api/v1/consents — the caller's own policy/agreement acceptances. */
export function consentRoutes() {
  const r = Router();
  r.get("/", requireAuth, async (req, res) => {
    const items = await Consent.find({ userId: req.user!.userId }).sort({ acceptedAt: -1 }).lean();
    res.json({ data: items.map(({ _id, ...c }) => ({ consentId: String(_id), ...c })) });
  });
  r.post("/", requireAuth, validateBody(consentInput), async (req, res) => {
    const { document, version } = req.body as z.infer<typeof consentInput>;
    const doc = await Consent.findOneAndUpdate(
      { userId: req.user!.userId, document, version },
      { $setOnInsert: { userId: req.user!.userId, document, version, acceptedAt: new Date(), ip: req.ip } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    await audit(req, { action: "consent.accept", entity: "consent", entityId: String(doc!._id), after: { document, version } });
    res.status(201).json({ data: { consentId: String(doc!._id), document, version, acceptedAt: doc!.acceptedAt } });
  });
  return r;
}

/** GET /api/v1/admin/system/deployments — read-only deployment history. */
export function adminSystemRoutes() {
  const r = Router();
  r.get("/system/deployments", requirePermission("system.deployments.read"), async (_req, res) => {
    const items = await SystemEvent.find({ type: { $in: ["deploy", "backup", "restore"] } }).sort({ at: -1 }).limit(100).lean();
    res.json({ data: items });
  });
  return r;
}
