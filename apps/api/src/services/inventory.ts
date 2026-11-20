import type { ClientSession } from "mongoose";
import { categoryDef, formatInventoryId, type PublicListing } from "@oohrena/shared";
import { arePhotosSimilar } from "../lib/phash.js";
import { Counter } from "../models/foundation.js";
import { DuplicateFlag, Inventory, InventoryHistory, type InventoryDoc } from "../models/inventory.js";

export async function nextInventoryId(category: string, session?: ClientSession) {
  const def = categoryDef(category);
  if (!def) throw new Error(`Unknown category ${category}`);
  const doc = await Counter.findOneAndUpdate({ _id: `INV-${def.code}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", session }).lean();
  return formatInventoryId(def.code, doc!.seq);
}

type Flat = Record<string, unknown>;
/** Flattens a listing into comparable fields for history rows. */
export function flatten(i: Pick<InventoryDoc, "title" | "description" | "city" | "locality" | "landmark" | "address" | "pin" | "location" | "attributes" | "rate" | "pricingUnit" | "quantity">): Flat {
  const [lng, lat] = i.location?.coordinates ?? [];
  const out: Flat = {
    title: i.title, description: i.description ?? null, city: i.city, locality: i.locality, landmark: i.landmark ?? null,
    address: i.address, pin: i.pin, lat: lat ?? null, lng: lng ?? null, rate: i.rate, pricingUnit: i.pricingUnit, quantity: i.quantity,
  };
  for (const [k, v] of Object.entries((i.attributes ?? {}) as Flat)) out[`attributes.${k}`] = v;
  return out;
}

export function diff(before: Flat, after: Flat) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)).map((k) => ({ field: k, old: before[k] ?? null, new: after[k] ?? null }));
}

export async function writeHistory(inventoryId: string, changes: { field: string; old: unknown; new: unknown }[], by: string, version: number, session?: ClientSession) {
  if (!changes.length) return;
  const at = new Date();
  await InventoryHistory.insertMany(changes.map((c) => ({ inventoryId, ...c, changedBy: by, changedAt: at, version })), { session });
}

/** Mandatory-field check before a listing may leave Draft. Returns human-readable problems. */
export function submitProblems(i: InventoryDoc): string[] {
  const p: string[] = [];
  const def = categoryDef(i.category);
  for (const a of def?.attributes ?? []) {
    const v = (i.attributes as Flat | undefined)?.[a.key];
    if (a.required && (v === undefined || v === null || v === "")) p.push(`${a.label} is required`);
  }
  if (!i.photos?.length) p.push("Add at least one photo of the site");
  return p;
}

/**
 * Module 3: flags likely duplicates — same category within 30 m (score 0.6, +0.2 if same vendor),
 * or an identical photo on another listing (score 0.9). Admin confirms or dismisses.
 */
export async function detectDuplicates(item: InventoryDoc) {
  const flags: { other: string; score: number; reasons: string[] }[] = [];
  const near = await Inventory.find({
    _id: { $ne: item._id },
    category: item.category,
    status: { $in: ["pending", "approved", "suspended"] },
    location: { $nearSphere: { $geometry: { type: "Point", coordinates: item.location!.coordinates }, $maxDistance: 30 } },
  }).select("_id vendorId").limit(20).lean();
  for (const o of near) {
    const sameVendor = o.vendorId === item.vendorId;
    flags.push({ other: o._id, score: sameVendor ? 0.8 : 0.6, reasons: ["Same category within 30 m", ...(sameVendor ? ["Same vendor"] : [])] });
  }
  const hashes = (item.photos ?? []).map((p) => p.sha256);
  if (hashes.length) {
    const samePhoto = await Inventory.find({ _id: { $ne: item._id }, "photos.sha256": { $in: hashes } }).select("_id").limit(20).lean();
    for (const o of samePhoto) {
      const f = flags.find((x) => x.other === o._id);
      if (f) { f.score = Math.max(f.score, 0.9); f.reasons.push("Identical photo"); }
      else flags.push({ other: o._id, score: 0.9, reasons: ["Identical photo"] });
    }
  }
  const pHashes = (item.photos ?? []).map((p: any) => p.pHash).filter(Boolean);
  if (pHashes.length) {
    const candidates = await Inventory.find({ _id: { $ne: item._id }, "photos.pHash": { $exists: true, $ne: null } }).select("_id photos").limit(50).lean();
    for (const other of candidates) {
      const otherHashes = (other.photos ?? []).map((p: any) => p.pHash).filter(Boolean);
      const isVisuallySimilar = pHashes.some((h1: string) => otherHashes.some((h2: string) => arePhotosSimilar(h1, h2)));
      if (isVisuallySimilar) {
        const f = flags.find((x) => x.other === other._id);
        if (f) {
          f.score = Math.max(f.score, 0.85);
          if (!f.reasons.includes("Visually similar photo")) f.reasons.push("Visually similar photo");
        } else {
          flags.push({ other: other._id, score: 0.85, reasons: ["Visually similar photo"] });
        }
      }
    }
  }
  for (const f of flags) {
    const [a, b] = [item._id, f.other].sort() as [string, string];
    await DuplicateFlag.updateOne(
      { entityType: "inventory", entityA: a, entityB: b },
      { $setOnInsert: { entityType: "inventory", entityA: a, entityB: b, resolution: "open" }, $max: { score: f.score }, $addToSet: { reasons: { $each: f.reasons } } },
      { upsert: true },
    );
  }
  return flags;
}

const photoUrl = (inventoryId: string, fileId: string) => `/api/v1/inventory/${inventoryId}/photos/${fileId}`;
const vendorPhotoUrl = (fileId: string) => `/api/v1/files/${fileId}`;

/** Public view — never includes vendorId, vendor rate, address line or documents. */
export function toPublic(i: InventoryDoc): PublicListing {
  const def = categoryDef(i.category)!;
  const [lng, lat] = i.location!.coordinates as [number, number];
  const verified = i.status === "approved" && i.dataType === "VERIFIED";
  return {
    inventoryId: i._id, title: i.title, category: i.category as PublicListing["category"], categoryName: def.name,
    ...(i.description ? { description: i.description } : {}),
    city: i.city, locality: i.locality, ...(i.landmark ? { landmark: i.landmark } : {}), pin: i.pin, lat, lng,
    attributes: (i.attributes ?? {}) as PublicListing["attributes"],
    pricingUnit: i.pricingUnit as PublicListing["pricingUnit"], indicativePrice: i.indicativePrice ?? null, quantity: i.quantity,
    photos: (i.photos ?? []).map((p) => photoUrl(i._id, p.fileId)),
    dataType: (i.dataType ?? null) as PublicListing["dataType"], verified, bookable: verified && !!i.indicativePrice,
    updatedAt: new Date(i.updatedAt).toISOString(),
  };
}

/** Vendor's own view and Admin's view: everything, including the private rate. */
export function toOwnerView(i: InventoryDoc) {
  const [lng, lat] = i.location!.coordinates as [number, number];
  return {
    inventoryId: i._id, vendorId: i.vendorId, category: i.category, categoryName: categoryDef(i.category)?.name ?? i.category,
    title: i.title, description: i.description ?? null, city: i.city, locality: i.locality, landmark: i.landmark ?? null,
    address: i.address, pin: i.pin, lat, lng, attributes: i.attributes ?? {}, rate: i.rate, pricingUnit: i.pricingUnit,
    quantity: i.quantity, indicativePrice: i.indicativePrice ?? null,
    photos: (i.photos ?? []).map((p) => ({ fileId: p.fileId, url: vendorPhotoUrl(p.fileId), uploadedAt: p.uploadedAt, capturedAt: p.capturedAt ?? null })),
    status: i.status, statusReason: i.statusReason ?? null, dataType: i.dataType ?? null, version: i.version,
    submittedAt: i.submittedAt ?? null, approvedAt: i.approvedAt ?? null, createdAt: i.createdAt, updatedAt: i.updatedAt,
  };
}
