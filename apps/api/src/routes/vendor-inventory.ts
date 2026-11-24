import express, { Router } from "express";
import { z } from "zod";
import {
  availabilityModeInput, availabilityQuery, blockInput,
  CATEGORY_IDS, CRITICAL_FIELDS, IMPORT_COLUMNS, LISTING_STATUSES, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_LISTING, PHOTO_MIME,
  categoryDef, inventoryCreateInput, inventoryImportInput, inventoryUpdateInput, normaliseAttributes,
  type InventoryCreateInput, type InventoryUpdateInput,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { parseCsv } from "../lib/csv.js";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { computePerceptualHash } from "../lib/phash.js";
import { saveUpload } from "../lib/storage.js";
import { withTransaction } from "../lib/tx.js";
import { currentVendor, upload } from "../middleware/upload.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { requireVendorRole } from "../middleware/auth.js";
import { Inventory, InventoryHistory, type InventoryDoc } from "../models/inventory.js";
import { addBlock, blocksFor, computeDays, removeBlock, toHoldView } from "../services/availability.js";
import { detectDuplicates, diff, flatten, nextInventoryId, submitProblems, toOwnerView, writeHistory } from "../services/inventory.js";

const listQuery = z.object({
  status: z.enum(LISTING_STATUSES).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

function toDoc(input: InventoryCreateInput, vendorId: string, userId: string) {
  return {
    vendorId, category: input.category, title: input.title, description: input.description ?? null,
    city: input.city, locality: input.locality, landmark: input.landmark ?? null, address: input.address, pin: input.pin,
    location: { type: "Point" as const, coordinates: [input.lng, input.lat] },
    attributes: normaliseAttributes(input.category, input.attributes), rate: input.rate, pricingUnit: input.pricingUnit,
    quantity: input.quantity, status: "draft" as const, createdBy: userId,
  };
}

/** Loads a listing owned by the signed-in vendor. Another vendor's ID returns 404 (never 403) so existence isn't revealed. */
async function ownListing(vendorId: string, id: string) {
  const i = await Inventory.findOne({ _id: id, vendorId }).lean<InventoryDoc>();
  if (!i) throw notFound("Listing not found");
  return i;
}

/** Module 2/4: the vendor's own inventory. */
export function vendorInventoryRoutes(cfg: Config) {
  const r = Router();

  r.get("/", requireVendorRole("owner", "manager", "accounts"), async (req, res) => {
    const v = await currentVendor(req);
    const q = parseQuery(listQuery, req);
    const filter: Record<string, unknown> = { vendorId: v._id };
    if (q.status) filter.status = q.status;
    if (q.category) filter.category = q.category;
    const [items, total] = await Promise.all([
      Inventory.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean<InventoryDoc[]>(),
      Inventory.countDocuments(filter),
    ]);
    res.json({ data: { items: items.map(toOwnerView), total, page: q.page, pageSize: q.pageSize } });
  });

  r.post("/", requireVendorRole("owner", "manager"), validateBody(inventoryCreateInput), async (req, res) => {
    const v = await currentVendor(req);
    const input = req.body as InventoryCreateInput;
    const id = await nextInventoryId(input.category);
    const doc = await Inventory.create({ _id: id, ...toDoc(input, v._id, req.user!.userId) });
    await audit(req, { action: "inventory.create", entity: "inventory", entityId: id, after: { status: "draft", category: input.category, title: input.title } });
    res.status(201).json({ data: toOwnerView(doc.toObject() as InventoryDoc) });
  });

  /**
   * Bulk import (CSV). All-or-nothing: if any row fails, nothing is created and every bad row is reported.
   * Body: { csv: "<file text>", dryRun?: boolean }.
   */
  r.post("/import", requireVendorRole("owner", "manager"), express.json({ limit: "2.5mb" }), validateBody(inventoryImportInput), async (req, res) => {
    const v = await currentVendor(req);
    const { csv, dryRun } = req.body as z.infer<typeof inventoryImportInput>;
    const rows = parseCsv(csv);
    if (rows.length < 2) throw badRequest("The file needs a header row and at least one data row");
    if (rows.length > 501) throw badRequest("Import up to 500 rows at a time");
    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const missingCols = IMPORT_COLUMNS.filter((c) => !["landmark", "description", "quantity"].includes(c) && !header.includes(c));
    if (missingCols.length) throw badRequest(`Missing columns: ${missingCols.join(", ")}`, { missingColumns: missingCols });

    const errors: { row: number; field: string; message: string }[] = [];
    const valid: InventoryCreateInput[] = [];
    rows.slice(1).forEach((cells, idx) => {
      const rec: Record<string, string> = {};
      header.forEach((h, i) => { rec[h] = (cells[i] ?? "").trim(); });
      // Headers are lower-cased, so map attr_* columns back to the template's keys case-insensitively.
      const attributes: Record<string, string> = {};
      const tmpl = categoryDef(rec["category"] ?? "")?.attributes ?? [];
      for (const [k, val] of Object.entries(rec)) {
        if (!k.startsWith("attr_") || val === "") continue;
        const key = tmpl.find((a) => a.key.toLowerCase() === k.slice(5))?.key;
        if (key) attributes[key] = val;
      }
      const parsed = inventoryCreateInput.safeParse({
        title: rec["title"], category: rec["category"], city: rec["city"], locality: rec["locality"], landmark: rec["landmark"],
        address: rec["address"], pin: rec["pin"], lat: rec["lat"], lng: rec["lng"], rate: rec["rate"],
        pricingUnit: rec["pricing_unit"], quantity: rec["quantity"] || 1, description: rec["description"], attributes,
      });
      if (parsed.success) valid.push(parsed.data);
      else for (const issue of parsed.error.issues) errors.push({ row: idx + 2, field: issue.path.join(".") || "row", message: issue.message });
    });
    if (errors.length) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `${new Set(errors.map((e) => e.row)).size} row(s) have problems. Nothing was imported.`, details: { rows: errors, validRows: valid.length } } });
    }
    if (dryRun) return res.json({ data: { created: [], validRows: valid.length, dryRun: true } });
    const created = await withTransaction(async (session) => {
      const ids: string[] = [];
      for (const input of valid) {
        const id = await nextInventoryId(input.category, session);
        await Inventory.create([{ _id: id, ...toDoc(input, v._id, req.user!.userId) }], { session });
        ids.push(id);
      }
      return ids;
    });
    await audit(req, { action: "inventory.import", entity: "vendor", entityId: v._id, after: { created: created.length, ids: created } });
    return res.status(201).json({ data: { created, validRows: valid.length, dryRun: false } });
  });

  r.get("/:id", requireVendorRole("owner", "manager", "accounts"), async (req, res) => {
    const v = await currentVendor(req);
    res.json({ data: toOwnerView(await ownListing(v._id, String(req.params.id))) });
  });

  r.get("/:id/history", requireVendorRole("owner", "manager", "accounts"), async (req, res) => {
    const v = await currentVendor(req);
    const i = await ownListing(v._id, String(req.params.id));
    const rows = await InventoryHistory.find({ inventoryId: i._id }).sort({ changedAt: -1 }).limit(200).lean();
    res.json({ data: rows.map(({ _id, ...h }) => h) });
  });

  /**
   * Edit. Draft/Rejected: free edit (Rejected returns to Draft). Pending/Suspended: locked.
   * Approved: allowed, but a change to a critical field (location, address, rate, unit, size) sends it back to Pending.
   */
  r.patch("/:id", requireVendorRole("owner", "manager"), validateBody(inventoryUpdateInput), async (req, res) => {
    const v = await currentVendor(req);
    const patch = req.body as InventoryUpdateInput;
    const out = await withTransaction(async (session) => {
      const cur = await Inventory.findOne({ _id: String(req.params.id), vendorId: v._id }).session(session).lean<InventoryDoc>();
      if (!cur) throw notFound("Listing not found");
      if (cur.status === "pending") throw new AppError(409, "CONFLICT", "This listing is under admin review and can't be edited right now");
      if (cur.status === "suspended") throw new AppError(409, "CONFLICT", "This listing is suspended. Contact OOHRENA to make changes.");

      const merged = Object.fromEntries(
        Object.entries({ ...flatten(cur), ...Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "attributes")) }).filter(([, x]) => x !== null),
      );
      const attrs = patch.attributes ? normaliseAttributes(cur.category, { ...(cur.attributes as object), ...patch.attributes }) : (cur.attributes as Record<string, unknown>);
      // Re-validate the whole record against the category template.
      const check = inventoryCreateInput.safeParse({ ...merged, category: cur.category, attributes: attrs });
      if (!check.success) throw badRequest("Please check the highlighted fields", check.error.flatten());

      const nextFlat = flatten({ ...cur, ...toDoc(check.data, cur.vendorId, cur.createdBy) });
      const changes = diff(flatten(cur), nextFlat);
      if (!changes.length) return toOwnerView(cur);
      const critical = changes.some((c) => (CRITICAL_FIELDS as readonly string[]).includes(c.field) || categoryDef(cur.category)?.attributes.some((a) => "critical" in a && a.critical && c.field === `attributes.${a.key}`));
      const set: Record<string, unknown> = { ...toDoc(check.data, cur.vendorId, cur.createdBy), version: cur.version + 1 };
      delete set.status; delete set.createdBy; delete set.vendorId; delete set.category;
      let newStatus: string = cur.status;
      if (cur.status === "rejected") newStatus = "draft";
      if (cur.status === "approved" && critical) newStatus = "pending";
      set.status = newStatus;
      if (newStatus !== cur.status) {
        set.statusReason = newStatus === "pending" ? "Critical fields changed — re-review required" : null;
        if (newStatus === "pending") set.submittedAt = new Date();
        changes.push({ field: "status", old: cur.status, new: newStatus });
      }
      const updated = await Inventory.findOneAndUpdate({ _id: cur._id }, { $set: set }, { returnDocument: "after", session }).lean<InventoryDoc>();
      await writeHistory(cur._id, changes, req.user!.userId, cur.version + 1, session);
      await audit(req, {
        action: newStatus === "pending" && cur.status === "approved" ? "inventory.update.rereview" : "inventory.update",
        entity: "inventory", entityId: cur._id,
        before: Object.fromEntries(changes.map((c) => [c.field, c.old])), after: Object.fromEntries(changes.map((c) => [c.field, c.new])),
      }, session);
      return toOwnerView(updated!);
    });
    res.json({ data: out });
  });

  /** multipart/form-data: photos=<up to 10 images ≤8 MB>, capturedAt=<ISO, optional>. Draft/Rejected/Approved only. */
  r.post("/:id/photos", requireVendorRole("owner", "manager"), upload.array("photos", MAX_PHOTOS_PER_LISTING), async (req, res) => {
    const v = await currentVendor(req);
    const i = await ownListing(v._id, String(req.params.id));
    if (i.status === "pending" || i.status === "suspended") throw new AppError(409, "CONFLICT", "Photos can't be changed while the listing is under review or suspended");
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest("Attach at least one photo");
    if ((i.photos?.length ?? 0) + files.length > MAX_PHOTOS_PER_LISTING) throw badRequest(`A listing can have at most ${MAX_PHOTOS_PER_LISTING} photos`);
    const capturedAt = req.body?.capturedAt ? new Date(String(req.body.capturedAt)) : null;
    const added = [];
    for (const f of files) {
      const s = await saveUpload(cfg, f.buffer, { kind: "inventory_photo", allowed: PHOTO_MIME, maxBytes: MAX_PHOTO_BYTES, encryptAtRest: false, ownerUserId: req.user!.userId, vendorId: v._id, originalName: f.originalname });
      const pHash = computePerceptualHash(f.buffer);
      added.push({ fileId: s._id, sha256: s.sha256, pHash, uploadedBy: req.user!.userId, uploadedAt: s.uploadedAt, capturedAt: capturedAt && !isNaN(capturedAt.getTime()) ? capturedAt : null });
    }
    const updated = await Inventory.findOneAndUpdate({ _id: i._id }, { $push: { photos: { $each: added } } }, { returnDocument: "after" }).lean<InventoryDoc>();
    await writeHistory(i._id, added.map((p) => ({ field: "photos", old: null, new: p.fileId })), req.user!.userId, i.version);
    await audit(req, { action: "inventory.photos.add", entity: "inventory", entityId: i._id, after: { fileIds: added.map((p) => p.fileId) } });
    res.status(201).json({ data: toOwnerView(updated!) });
  });

  r.delete("/:id/photos/:fileId", requireVendorRole("owner", "manager"), async (req, res) => {
    const v = await currentVendor(req);
    const i = await ownListing(v._id, String(req.params.id));
    if (i.status !== "draft" && i.status !== "rejected") throw new AppError(409, "CONFLICT", "Photos can only be removed while the listing is a draft");
    const fileId = String(req.params.fileId);
    if (!i.photos?.some((p) => p.fileId === fileId)) throw notFound("Photo not found");
    const updated = await Inventory.findOneAndUpdate({ _id: i._id }, { $pull: { photos: { fileId } } }, { returnDocument: "after" }).lean<InventoryDoc>();
    await writeHistory(i._id, [{ field: "photos", old: fileId, new: null }], req.user!.userId, i.version);
    await audit(req, { action: "inventory.photos.remove", entity: "inventory", entityId: i._id, before: { fileId } });
    res.json({ data: toOwnerView(updated!) });
  });

  /** Vendor's own calendar, including who-held-what detail that the public view hides. */
  r.get("/:id/availability", requireVendorRole("owner", "manager", "accounts"), async (req, res) => {
    const v = await currentVendor(req);
    const i = await ownListing(v._id, String(req.params.id));
    const q = parseQuery(availabilityQuery, req);
    const blocks = await blocksFor([i._id], q.from, q.to);
    res.json({ data: { inventoryId: i._id, mode: i.availabilityMode ?? "on_request", days: computeDays(i, blocks, q.from, q.to), entries: blocks.map((b) => toHoldView(b as never)) } });
  });

  r.post("/:id/availability", requireVendorRole("owner", "manager"), validateBody(blockInput), async (req, res) => {
    const v = await currentVendor(req);
    const i = await ownListing(v._id, String(req.params.id));
    if (i.status !== "approved") throw new AppError(409, "CONFLICT", "Dates can be blocked once the listing is approved");
    res.status(201).json({ data: await addBlock(req, i._id, req.body as z.infer<typeof blockInput>, "vendor") });
  });

  r.delete("/:id/availability/:blockId", requireVendorRole("owner", "manager"), async (req, res) => {
    const v = await currentVendor(req);
    const i = await ownListing(v._id, String(req.params.id));
    res.json({ data: await removeBlock(req, i._id, String(req.params.blockId), v._id) });
  });

  /** managed = vendor keeps the calendar live (holds are instant); on_request = every hold needs vendor confirmation. */
  r.patch("/:id/availability-mode", requireVendorRole("owner", "manager"), validateBody(availabilityModeInput), async (req, res) => {
    const v = await currentVendor(req);
    const i = await ownListing(v._id, String(req.params.id));
    const { mode } = req.body as z.infer<typeof availabilityModeInput>;
    await Inventory.updateOne({ _id: i._id }, { $set: { availabilityMode: mode, availabilityUpdatedAt: new Date() } });
    await writeHistory(i._id, [{ field: "availabilityMode", old: i.availabilityMode ?? "on_request", new: mode }], req.user!.userId, i.version);
    await audit(req, { action: "inventory.availability_mode", entity: "inventory", entityId: i._id, before: { mode: i.availabilityMode ?? "on_request" }, after: { mode } });
    res.json({ data: { inventoryId: i._id, mode } });
  });

  /** Draft → Pending. Checks mandatory fields and runs duplicate detection. */
  r.post("/:id/submit", requireVendorRole("owner", "manager"), async (req, res) => {
    const v = await currentVendor(req);
    const i = await ownListing(v._id, String(req.params.id));
    if (i.status !== "draft") throw new AppError(409, "INVALID_TRANSITION", `Only draft listings can be submitted (this one is ${i.status})`);
    const problems = submitProblems(i);
    if (problems.length) throw badRequest("Complete the listing before submitting", { problems });
    const updated = await Inventory.findOneAndUpdate(
      { _id: i._id, status: "draft" },
      { $set: { status: "pending", submittedAt: new Date(), statusReason: null } },
      { returnDocument: "after" },
    ).lean<InventoryDoc>();
    if (!updated) throw new AppError(409, "INVALID_TRANSITION", "Listing changed while submitting; refresh and try again");
    await writeHistory(i._id, [{ field: "status", old: "draft", new: "pending" }], req.user!.userId, i.version);
    const dups = await detectDuplicates(updated);
    await audit(req, { action: "inventory.submit", entity: "inventory", entityId: i._id, before: { status: "draft" }, after: { status: "pending", duplicateFlags: dups.length } });
    res.json({ data: toOwnerView(updated) });
  });

  return r;
}
