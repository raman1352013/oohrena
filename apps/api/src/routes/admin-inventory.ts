import { Router } from "express";
import { z } from "zod";
import { CATEGORY_IDS, LISTING_STATUSES, LISTING_TRANSITIONS, availabilityQuery, blockInput, dataTypeInput, listingDecisionInput, type ListingStatus } from "@oohrena/shared";
import { addBlock, blocksFor, computeDays, removeBlock, toHoldView } from "../services/availability.js";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, notFound } from "../lib/errors.js";
import { withTransaction } from "../lib/tx.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { Vendor } from "../models/foundation.js";
import { DuplicateFlag, Inventory, InventoryHistory, type InventoryDoc } from "../models/inventory.js";
import { toOwnerView, writeHistory } from "../services/inventory.js";

const listQuery = z.object({
  status: z.enum(LISTING_STATUSES).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  vendorId: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
const NEXT: Record<"approve" | "reject" | "suspend" | "reinstate", ListingStatus> = { approve: "approved", reject: "rejected", suspend: "suspended", reinstate: "approved" };
const roundTo100 = (n: number) => Math.round(n / 100) * 100;

/** Module 3/4: listing verification, data-type control and duplicate review. */
export function adminInventoryRoutes(cfg: Config) {
  const r = Router();
  r.use(requirePermission("inventory.decide"));

  r.get("/inventory", async (req, res) => {
    const q = parseQuery(listQuery, req);
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.category) filter.category = q.category;
    if (q.vendorId) filter.vendorId = q.vendorId;
    const [items, total] = await Promise.all([
      Inventory.find(filter).sort({ submittedAt: 1, updatedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean<InventoryDoc[]>(),
      Inventory.countDocuments(filter),
    ]);
    const vendors = await Vendor.find({ _id: { $in: [...new Set(items.map((i) => i.vendorId))] } }).select("_id legalName kycStatus").lean();
    const ids = items.map((i) => i._id);
    const dups = await DuplicateFlag.find({ entityType: "inventory", resolution: "open", $or: [{ entityA: { $in: ids } }, { entityB: { $in: ids } }] }).lean();
    res.json({
      data: {
        items: items.map((i) => {
          const v = vendors.find((x) => x._id === i.vendorId);
          return {
            ...toOwnerView(i),
            vendor: v ? { vendorId: v._id, legalName: v.legalName, kycStatus: v.kycStatus } : null,
            suggestedPrice: roundTo100(i.rate * (1 + cfg.DEFAULT_MARGIN_PCT / 100)),
            openDuplicates: dups.filter((d) => d.entityA === i._id || d.entityB === i._id).map((d) => ({ flagId: String(d._id), other: d.entityA === i._id ? d.entityB : d.entityA, score: d.score, reasons: d.reasons })),
          };
        }),
        total, page: q.page, pageSize: q.pageSize,
      },
    });
  });

  r.get("/inventory/:id/history", async (req, res) => {
    const i = await Inventory.exists({ _id: String(req.params.id) });
    if (!i) throw notFound("Listing not found");
    const rows = await InventoryHistory.find({ inventoryId: String(req.params.id) }).sort({ changedAt: -1 }).limit(500).lean();
    res.json({ data: rows.map(({ _id, ...h }) => h) });
  });

  /** Approve (vendor KYC must be approved; sets indicative price + VERIFIED), reject, suspend or reinstate — reason required except approve. */
  r.post("/inventory/:id/decision", validateBody(listingDecisionInput), async (req, res) => {
    const { decision, reason, indicativePrice } = req.body as z.infer<typeof listingDecisionInput>;
    const out = await withTransaction(async (session) => {
      const i = await Inventory.findById(String(req.params.id)).session(session).lean<InventoryDoc>();
      if (!i) throw notFound("Listing not found");
      const from = i.status as ListingStatus;
      const to = NEXT[decision];
      if (!LISTING_TRANSITIONS[from].includes(to)) throw new AppError(409, "INVALID_TRANSITION", `Can't ${decision} a listing that is ${from}`);
      if (to === "approved") {
        const v = await Vendor.findById(i.vendorId).session(session).lean();
        if (v?.kycStatus !== "approved") throw new AppError(409, "CONFLICT", "Approve the vendor's KYC before approving their listings");
      }
      const set: Record<string, unknown> = { status: to, statusReason: reason ?? null };
      if (to === "approved") {
        set.approvedBy = req.user!.userId;
        set.approvedAt = new Date();
        set.indicativePrice = indicativePrice ?? i.indicativePrice ?? roundTo100(i.rate * (1 + cfg.DEFAULT_MARGIN_PCT / 100));
        // Approval verifies a real listing unless an admin has explicitly marked it as DEMO.
        if (i.dataType !== "DEMO") set.dataType = "VERIFIED";
      }
      const updated = await Inventory.findOneAndUpdate({ _id: i._id, status: from }, { $set: set }, { returnDocument: "after", session }).lean<InventoryDoc>();
      if (!updated) throw new AppError(409, "CONFLICT", "Listing changed while deciding; refresh and try again");
      const changes = [{ field: "status", old: from, new: to }];
      if (set.indicativePrice !== undefined && set.indicativePrice !== i.indicativePrice) changes.push({ field: "indicativePrice", old: (i.indicativePrice ?? null) as never, new: set.indicativePrice as never });
      if (set.dataType && set.dataType !== i.dataType) changes.push({ field: "dataType", old: (i.dataType ?? null) as never, new: set.dataType as never });
      await writeHistory(i._id, changes, req.user!.userId, i.version, session);
      await audit(req, { action: `inventory.${decision}`, entity: "inventory", entityId: i._id, before: { status: from, indicativePrice: i.indicativePrice ?? null, dataType: i.dataType ?? null }, after: { status: to, indicativePrice: updated.indicativePrice ?? null, dataType: updated.dataType ?? null }, reason: reason ?? null }, session);
      return toOwnerView(updated);
    });
    res.json({ data: out });
  });

  /** Mark DEMO (badged, never bookable) or VERIFIED, with reason. Admin only — vendors can't set this. */
  r.patch("/inventory/:id/data-type", validateBody(dataTypeInput), async (req, res) => {
    const { dataType, reason } = req.body as z.infer<typeof dataTypeInput>;
    const i = await Inventory.findById(String(req.params.id)).lean<InventoryDoc>();
    if (!i) throw notFound("Listing not found");
    if (dataType === "VERIFIED" && i.status !== "approved") throw new AppError(409, "CONFLICT", "Only approved listings can be marked VERIFIED");
    const updated = await Inventory.findOneAndUpdate({ _id: i._id }, { $set: { dataType } }, { returnDocument: "after" }).lean<InventoryDoc>();
    await writeHistory(i._id, [{ field: "dataType", old: i.dataType ?? null, new: dataType }], req.user!.userId, i.version);
    await audit(req, { action: "inventory.data_type", entity: "inventory", entityId: i._id, before: { dataType: i.dataType ?? null }, after: { dataType }, reason });
    res.json({ data: toOwnerView(updated!) });
  });

  /** Admin calendar view with every hold/block, plus block/unblock with reason. */
  r.get("/inventory/:id/availability", async (req, res) => {
    const i = await Inventory.findById(String(req.params.id)).lean<InventoryDoc>();
    if (!i) throw notFound("Listing not found");
    const q = parseQuery(availabilityQuery, req);
    const blocks = await blocksFor([i._id], q.from, q.to);
    res.json({ data: { inventoryId: i._id, mode: i.availabilityMode ?? "on_request", days: computeDays(i, blocks, q.from, q.to), entries: blocks.map((b) => toHoldView(b as never)) } });
  });

  r.post("/inventory/:id/block", validateBody(blockInput), async (req, res) => {
    const i = await Inventory.exists({ _id: String(req.params.id) });
    if (!i) throw notFound("Listing not found");
    res.status(201).json({ data: await addBlock(req, String(req.params.id), req.body as z.infer<typeof blockInput>, "admin") });
  });

  r.delete("/inventory/:id/block/:blockId", async (req, res) => {
    res.json({ data: await removeBlock(req, String(req.params.id), String(req.params.blockId)) });
  });

  r.get("/duplicates", async (req, res) => {
    const q = parseQuery(z.object({ resolution: z.enum(["open", "confirmed", "dismissed"]).default("open") }), req);
    const items = await DuplicateFlag.find({ resolution: q.resolution }).sort({ score: -1, createdAt: -1 }).limit(200).lean();
    res.json({ data: items.map(({ _id, ...d }) => ({ flagId: String(_id), ...d })) });
  });

  r.post("/duplicates/:id/resolve", validateBody(z.object({ resolution: z.enum(["confirmed", "dismissed"]), note: z.string().trim().min(3, "Add a note").max(1000) })), async (req, res) => {
    const { resolution, note } = req.body as { resolution: "confirmed" | "dismissed"; note: string };
    const d = await DuplicateFlag.findOneAndUpdate(
      { _id: String(req.params.id), resolution: "open" },
      { $set: { resolution, note, resolvedBy: req.user!.userId, resolvedAt: new Date() } },
      { returnDocument: "after" },
    ).lean().catch(() => null);
    if (!d) throw notFound("Open duplicate flag not found");
    await audit(req, { action: `duplicate.${resolution}`, entity: "duplicate_flag", entityId: String(d._id), after: { entityA: d.entityA, entityB: d.entityB, resolution }, reason: note });
    res.json({ data: { flagId: String(d._id), resolution } });
  });

  return r;
}
