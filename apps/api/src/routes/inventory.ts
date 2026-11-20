import { Router } from "express";
import { z } from "zod";
import { CATEGORY_DEFS, CATEGORY_IDS, PRICING_UNIT_LABEL, SUBJECT_TO_VENDOR, availabilityQuery, capacityFor, minDaysFor, searchQuery } from "@oohrena/shared";
import type { Config } from "../config.js";
import { badRequest, notFound } from "../lib/errors.js";
import { blocksFor, computeDays, summarise } from "../services/availability.js";
import { searchInventory } from "../services/search.js";
import { readUpload } from "../lib/storage.js";
import { parseQuery } from "../middleware/validate.js";
import { StoredFile } from "../models/files.js";
import { Inventory, type InventoryDoc } from "../models/inventory.js";
import { toPublic } from "../services/inventory.js";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const catalogueQuery = z.object({
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(80).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  pin: z.string().trim().regex(/^[0-9]{6}$/).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  /** Include DEMO/sample records (always badged, never bookable). */
  includeDemo: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

/**
 * Module 4: public catalogue. Only Approved listings ever leave this router.
 * Default: Approved + VERIFIED. Vendor identity, vendor rate and documents are never returned.
 */
export function inventoryRoutes(cfg: Config) {
  const r = Router();

  r.get("/categories", (_req, res) => {
    res.json({ data: CATEGORY_DEFS.map((c) => ({ ...c, unitLabels: c.units.map((u) => ({ unit: u, label: PRICING_UNIT_LABEL[u] })) })) });
  });

  r.get("/", async (req, res) => {
    const q = parseQuery(catalogueQuery, req);
    const filter: Record<string, unknown> = { status: "approved", dataType: q.includeDemo === "true" ? { $in: ["VERIFIED", "DEMO"] } : "VERIFIED" };
    if (q.city) filter.city = new RegExp(`^${escapeRe(q.city)}$`, "i");
    if (q.category) filter.category = q.category;
    if (q.pin) filter.pin = q.pin;
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      filter.indicativePrice = { ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}) };
    }
    if (q.q) {
      const re = new RegExp(escapeRe(q.q), "i");
      filter.$or = [{ title: re }, { city: re }, { locality: re }, { landmark: re }, { pin: q.q }, { _id: q.q.toUpperCase() }];
    }
    const [items, total] = await Promise.all([
      Inventory.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean<InventoryDoc[]>(),
      Inventory.countDocuments(filter),
    ]);
    res.json({ data: { items: items.map(toPublic), total, page: q.page, pageSize: q.pageSize } });
  });

  /** Module 1/5: search by text, city, locality, landmark, PIN, GPS radius, budget, category and dates. */
  r.get("/search", async (req, res) => {
    res.json({ data: await searchInventory(parseQuery(searchQuery, req)) });
  });

  /** Map view: same filters, constrained to a bounding box (bbox=minLng,minLat,maxLng,maxLat) or radius. */
  r.get("/search/geo", async (req, res) => {
    const q = parseQuery(searchQuery, req);
    if (!q.bbox && q.lat === undefined) throw badRequest("Give a map bounding box (bbox) or a point (lat, lng)");
    res.json({ data: await searchInventory({ ...q, pageSize: 100 }) });
  });

  /** Side-by-side compare of up to 4 approved listings. */
  r.get("/compare", async (req, res) => {
    const { ids } = parseQuery(z.object({ ids: z.string().trim().min(1) }), req);
    const list = [...new Set(ids.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 4);
    const items = await Inventory.find({ _id: { $in: list }, status: "approved" }).lean<InventoryDoc[]>();
    res.json({ data: list.map((id) => items.find((i) => i._id === id)).filter(Boolean).map((i) => toPublic(i!)) });
  });

  r.get("/:id", async (req, res) => {
    const i = await Inventory.findOne({ _id: String(req.params.id), status: "approved" }).lean<InventoryDoc>();
    if (!i) throw notFound("Listing not found");
    res.json({ data: toPublic(i) });
  });

  /** Day-by-day calendar for an approved listing. Never reveals who holds a date. */
  r.get("/:id/availability", async (req, res) => {
    const q = parseQuery(availabilityQuery, req);
    const i = await Inventory.findOne({ _id: String(req.params.id), status: "approved" }).lean<InventoryDoc>();
    if (!i) throw notFound("Listing not found");
    const days = computeDays(i, await blocksFor([i._id], q.from, q.to), q.from, q.to);
    const cap = capacityFor(i.category, i.quantity, i.attributes as Record<string, unknown>);
    res.json({ data: { inventoryId: i._id, from: q.from, to: q.to, mode: i.availabilityMode, capacityModel: cap.model, unitLabel: cap.unitLabel, minDays: minDaysFor(i.category), summary: summarise(i, days, 1), note: i.availabilityMode === "managed" ? null : SUBJECT_TO_VENDOR, days } });
  });

  /** Photos of approved listings are public; everything else goes through /files with an ownership check. */
  r.get("/:id/photos/:fileId", async (req, res) => {
    const i = await Inventory.findOne({ _id: String(req.params.id), status: "approved", "photos.fileId": String(req.params.fileId) }).select("_id").lean();
    if (!i) throw notFound("Photo not found");
    const f = await StoredFile.findById(String(req.params.fileId)).lean();
    if (!f || f.kind !== "inventory_photo") throw notFound("Photo not found");
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(await readUpload(cfg, f));
  });

  return r;
}
