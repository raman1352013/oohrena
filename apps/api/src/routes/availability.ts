import { Router } from "express";
import { z } from "zod";
import { holdInput, vendorResponseInput, fromDay } from "@oohrena/shared";
import type { Config } from "../config.js";
import { requirePermission } from "../middleware/auth.js";
import { currentVendor } from "../middleware/upload.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { AvailabilityBlock, AvailabilityRequest } from "../models/availability.js";
import { placeHold, releaseHold, toHoldView, vendorRespond } from "../services/availability.js";

/** POST/GET/DELETE /api/v1/holds — Admin (or system) temporary holds. */
export function holdRoutes(cfg: Config) {
  const r = Router();
  r.use(requirePermission("holds.manage"));

  r.get("/", async (req, res) => {
    const q = parseQuery(z.object({ inventoryId: z.string().trim().max(30).optional(), status: z.enum(["active", "all"]).default("active") }), req);
    const filter: Record<string, unknown> = { kind: "hold" };
    if (q.inventoryId) filter.inventoryId = q.inventoryId;
    if (q.status === "active") Object.assign(filter, { status: { $in: ["held", "pending_vendor"] }, expiresAt: { $gt: new Date() } });
    const items = await AvailabilityBlock.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ data: items.map(toHoldView) });
  });

  r.post("/", validateBody(holdInput), async (req, res) => {
    res.status(201).json({ data: await placeHold(cfg, req, req.body as z.infer<typeof holdInput>) });
  });

  r.delete("/:holdId", async (req, res) => {
    const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? String(req.body.reason).trim().slice(0, 500) : "Released by admin";
    res.json({ data: await releaseHold(req, String(req.params.holdId), reason) });
  });
  return r;
}

const reqView = (r: { _id: unknown; holdId: string; inventoryId: string; from: Date; to: Date; qty: number; requestedAt: Date; respondBy: Date; status: string; respondedAt?: Date | null; note?: string | null }) => ({
  requestId: String(r._id), holdId: r.holdId, inventoryId: r.inventoryId, from: fromDay(r.from.getTime()), to: fromDay(r.to.getTime()), qty: r.qty,
  requestedAt: r.requestedAt, respondBy: r.respondBy, status: r.status === "pending" && r.respondBy.getTime() <= Date.now() ? "expired" : r.status,
  respondedAt: r.respondedAt ?? null, note: r.note ?? null,
});

/** Vendor side of the confirmation flow. */
export function availabilityRequestRoutes() {
  const r = Router();
  r.get("/", requirePermission("availability.respond"), async (req, res) => {
    const v = await currentVendor(req);
    const items = await AvailabilityRequest.find({ vendorId: v._id }).sort({ requestedAt: -1 }).limit(100).lean();
    res.json({ data: items.map(reqView) });
  });
  r.post("/:id/vendor-response", requirePermission("availability.respond"), validateBody(vendorResponseInput), async (req, res) => {
    const v = await currentVendor(req);
    const { response, note } = req.body as z.infer<typeof vendorResponseInput>;
    res.json({ data: await vendorRespond(req, v._id, String(req.params.id), response, note) });
  });
  return r;
}
