import type { z } from "zod";
import { searchQuery, type AvailabilitySummary, type PublicListing } from "@oohrena/shared";
import { Inventory, type InventoryDoc } from "../models/inventory.js";
import { summariesFor } from "./availability.js";
import { toPublic } from "./inventory.js";

type Q = z.infer<typeof searchQuery>;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EARTH_KM = 6378.1;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type SearchResult = PublicListing & { distanceKm?: number; availability?: AvailabilitySummary };

/**
 * Module 1/5 search. Only Approved listings; VERIFIED by default (DEMO only on request, always badged and not bookable).
 * Location: city/locality/landmark/PIN text, radius around a GPS point, or a map bounding box.
 * Dates: attaches an availability summary per item; onlyAvailable drops items without free capacity.
 */
export async function searchInventory(q: Q) {
  const filter: Record<string, unknown> = { status: "approved", dataType: q.includeDemo === "true" ? { $in: ["VERIFIED", "DEMO"] } : "VERIFIED" };
  const and: Record<string, unknown>[] = [];
  if (q.city) filter.city = new RegExp(`^${esc(q.city)}$`, "i");
  if (q.locality) filter.locality = new RegExp(esc(q.locality), "i");
  if (q.landmark) and.push({ $or: [{ landmark: new RegExp(esc(q.landmark), "i") }, { title: new RegExp(esc(q.landmark), "i") }, { locality: new RegExp(esc(q.landmark), "i") }] });
  if (q.pin) filter.pin = q.pin;
  if (q.category) filter.category = q.category;
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.indicativePrice = { ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}) };
  }
  if (q.q) {
    const re = new RegExp(esc(q.q), "i");
    and.push({ $or: [{ title: re }, { city: re }, { locality: re }, { landmark: re }, { pin: q.q }, { _id: q.q.toUpperCase() }] });
  }
  if (q.lat !== undefined && q.lng !== undefined) {
    filter.location = { $geoWithin: { $centerSphere: [[q.lng, q.lat], q.radiusKm / EARTH_KM] } };
  } else if (q.bbox) {
    const [minLng, minLat, maxLng, maxLat] = q.bbox.split(",").map(Number) as [number, number, number, number];
    filter.location = { $geoWithin: { $box: [[minLng, minLat], [maxLng, maxLat]] } };
  }
  if (and.length) filter.$and = and;

  // Date filtering needs availability per item, so cap the candidate set and page in memory.
  const candidates = await Inventory.find(filter).sort({ updatedAt: -1 }).limit(500).lean<InventoryDoc[]>();
  let results: SearchResult[] = candidates.map(toPublic);
  if (q.lat !== undefined && q.lng !== undefined) {
    const p = { lat: q.lat, lng: q.lng };
    results = results.map((r) => ({ ...r, distanceKm: Math.round(haversineKm(p, r) * 10) / 10 })).sort((a, b) => a.distanceKm! - b.distanceKm!);
  }
  if (q.from && q.to) {
    const sums = await summariesFor(candidates, q.from, q.to, q.qty);
    results = results.map((r) => ({ ...r, availability: sums.get(r.inventoryId)! }));
    if (q.onlyAvailable === "true") results = results.filter((r) => r.availability!.state === "available");
  }
  const total = results.length;
  const items = results.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  return { items, total, page: q.page, pageSize: q.pageSize, truncated: candidates.length === 500 };
}
