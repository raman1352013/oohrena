import { Router } from "express";
import { z } from "zod";
import { LEAD_SOURCES, LEAD_STATUSES, fromDay, leadCreateInput, toDay, type LeadCreateInput } from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { AppError, forbidden, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { Shortlist } from "../models/availability.js";
import { Client, User } from "../models/foundation.js";
import { DuplicateFlag, Inventory, type InventoryDoc } from "../models/inventory.js";
import { Lead } from "../models/lead.js";
import { toPublic } from "../services/inventory.js";
import { notify } from "../services/notifications.js";

type LeadDoc = { _id: string; source: string; clientId?: string | null; inventoryIds: string[]; city?: string | null; category?: string | null; from: Date; to: Date; qty: number; budget?: number | null; requirement: string; status: string; contact?: { name?: string; email?: string; mobile?: string; company?: string } | null; createdAt: Date; updatedAt: Date };
const view = (l: LeadDoc, admin = false) => ({
  leadId: l._id, source: l.source, status: l.status, inventoryIds: l.inventoryIds, city: l.city ?? null, category: l.category ?? null,
  from: fromDay(l.from.getTime()), to: fromDay(l.to.getTime()), qty: l.qty, budget: l.budget ?? null, requirement: l.requirement,
  createdAt: l.createdAt, updatedAt: l.updatedAt,
  ...(admin ? { clientId: l.clientId ?? null, contact: l.contact ?? null } : {}),
});

/** Module 1: a client submits a requirement and gets a unique Lead ID. Leads go to the central admin inbox — never straight to a vendor. */
export function leadRoutes() {
  const r = Router();

  r.post("/", requirePermission("leads.create"), validateBody(leadCreateInput), async (req, res) => {
    if (req.user!.role !== "client") throw forbidden("Only client accounts can submit inquiries here");
    const input = req.body as LeadCreateInput;
    const client = await Client.findById(req.user!.orgId).lean();
    if (!client) throw notFound("Client profile not found");
    const ids = [...new Set(input.inventoryIds)];
    if (ids.length) {
      const items = await Inventory.find({ _id: { $in: ids }, status: "approved" }).select("_id dataType title").lean();
      const missing = ids.filter((id) => !items.some((i) => i._id === id));
      if (missing.length) throw new AppError(409, "CONFLICT", `These items are not available on the marketplace: ${missing.join(", ")}`);
      const demo = items.filter((i) => i.dataType !== "VERIFIED");
      if (demo.length) throw new AppError(409, "CONFLICT", `Demo / sample inventory can't be quoted or booked: ${demo.map((d) => d._id).join(", ")}`);
    }
    const user = await User.findById(req.user!.userId).lean();
    const leadId = await nextId("LD");
    const lead = await Lead.create({
      _id: leadId, source: "web", clientId: client._id, createdBy: req.user!.userId, inventoryIds: ids, city: input.city ?? null, category: input.category ?? null,
      from: new Date(toDay(input.from)), to: new Date(toDay(input.to)), qty: input.qty, budget: input.budget ?? null, requirement: input.requirement, status: "new",
      contact: { name: user?.fullName, email: user?.email, mobile: user?.mobile, company: client.companyName },
    });
    // Duplicate inquiry check: same client, overlapping dates, any shared item, still open → flag for Admin (not blocked).
    const dup = ids.length ? await Lead.findOne({
      _id: { $ne: leadId }, clientId: client._id, inventoryIds: { $in: ids }, status: { $in: ["new", "under_review", "assigned", "quoted"] },
      from: { $lte: lead.to }, to: { $gte: lead.from },
    }).select("_id").lean() : null;
    if (dup) {
      const [a, b] = [dup._id, leadId].sort() as [string, string];
      await DuplicateFlag.updateOne({ entityType: "lead", entityA: a, entityB: b }, { $setOnInsert: { entityType: "lead", entityA: a, entityB: b, score: 0.7, reasons: ["Same client, overlapping dates and media"], resolution: "open" } }, { upsert: true });
    }
    await audit(req, { action: "lead.create", entity: "lead", entityId: leadId, after: { source: "web", inventoryIds: ids, from: input.from, to: input.to, possibleDuplicateOf: dup?._id ?? null } });
    const admins = await User.find({ role: "admin" }).select("_id email mobile").lean();
    const recipients = [
      { userId: req.user!.userId, email: user?.email, mobile: user?.mobile },
      ...admins.map((a) => ({ userId: a._id, email: a.email, mobile: a.mobile })),
    ];
    await notify("lead.created", recipients, { leadId, requirement: input.requirement });
    res.status(201).json({ data: { ...view(lead.toObject() as LeadDoc), possibleDuplicateOf: dup?._id ?? null } });
  });

  r.get("/", requirePermission("leads.read"), async (req, res) => {
    if (req.user!.role !== "client") throw forbidden();
    const items = await Lead.find({ clientId: req.user!.orgId }).sort({ createdAt: -1 }).limit(200).lean<LeadDoc[]>();
    res.json({ data: items.map((l) => view(l)) });
  });

  /** Own lead only for clients (another client's ID → 404); Admin sees all. */
  r.get("/:id", requirePermission("leads.read"), async (req, res) => {
    const l = await Lead.findById(String(req.params.id)).lean<LeadDoc>();
    const isAdmin = req.user!.role === "admin";
    if (!l || (!isAdmin && (req.user!.role !== "client" || l.clientId !== req.user!.orgId))) throw notFound("Lead not found");
    const items = await Inventory.find({ _id: { $in: l.inventoryIds } }).lean<InventoryDoc[]>();
    res.json({ data: { ...view(l, isAdmin), items: items.filter((i) => i.status === "approved").map(toPublic) } });
  });
  return r;
}

/** Module 3 (inbox read side): every lead from every source in one queue. Assignment and quoting come next. */
export function adminLeadRoutes() {
  const r = Router();
  r.get("/leads", requirePermission("leads.assign"), async (req, res) => {
    const q = parseQuery(z.object({
      status: z.enum(LEAD_STATUSES).optional(), source: z.enum(LEAD_SOURCES).optional(),
      page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }), req);
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.source) filter.source = q.source;
    const [items, total] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean<LeadDoc[]>(),
      Lead.countDocuments(filter),
    ]);
    const dups = await DuplicateFlag.find({ entityType: "lead", resolution: "open", $or: [{ entityA: { $in: items.map((i) => i._id) } }, { entityB: { $in: items.map((i) => i._id) } }] }).lean();
    res.json({ data: { items: items.map((l) => ({ ...view(l, true), possibleDuplicates: dups.filter((d) => d.entityA === l._id || d.entityB === l._id).map((d) => (d.entityA === l._id ? d.entityB : d.entityA)) })), total, page: q.page, pageSize: q.pageSize } });
  });
  return r;
}

/** Module 1: the client's shortlist (compare via GET /inventory/compare?ids=). */
export function shortlistRoutes() {
  const r = Router();
  r.use(requirePermission("shortlist.manage"));
  const load = async (clientId: string) => {
    const s = await Shortlist.findOne({ clientId }).lean();
    const ids = (s?.items ?? []).map((i) => i.inventoryId);
    const inv = await Inventory.find({ _id: { $in: ids } }).lean<InventoryDoc[]>();
    return (s?.items ?? []).map((it) => {
      const i = inv.find((x) => x._id === it.inventoryId);
      // Items that were suspended or withdrawn stay visible as unavailable instead of silently vanishing.
      return { inventoryId: it.inventoryId, addedAt: it.addedAt, listing: i && i.status === "approved" ? toPublic(i) : null };
    });
  };
  r.get("/", async (req, res) => res.json({ data: await load(req.user!.orgId!) }));
  r.post("/", validateBody(z.object({ inventoryId: z.string().trim().min(1).max(30) })), async (req, res) => {
    const { inventoryId } = req.body as { inventoryId: string };
    if (!(await Inventory.exists({ _id: inventoryId, status: "approved" }))) throw notFound("Listing not found");
    const s = await Shortlist.findOne({ clientId: req.user!.orgId }).lean();
    if ((s?.items.length ?? 0) >= 50) throw new AppError(409, "CONFLICT", "Your shortlist can hold up to 50 items");
    await Shortlist.updateOne(
      { clientId: req.user!.orgId, "items.inventoryId": { $ne: inventoryId } },
      { $push: { items: { inventoryId, addedAt: new Date() } }, $setOnInsert: { clientId: req.user!.orgId } },
      { upsert: true },
    ).catch((e: { code?: number }) => { if (e.code !== 11000) throw e; }); // already shortlisted → no-op
    res.status(201).json({ data: await load(req.user!.orgId!) });
  });
  r.delete("/:inventoryId", async (req, res) => {
    await Shortlist.updateOne({ clientId: req.user!.orgId }, { $pull: { items: { inventoryId: String(req.params.inventoryId) } } });
    res.json({ data: await load(req.user!.orgId!) });
  });
  return r;
}
