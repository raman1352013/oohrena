import type { Request } from "express";
import type { z } from "zod";
import {
  DEFAULT_QUOTE_VALIDITY_DAYS, computeQuoteTotals, defaultBillableUnits, fromDay, quoteCreateInput, quoteItemInput, toDay, todayIST,
  type PricingUnit,
} from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { LeadAssignment, Quote } from "../models/booking.js";
import { Vendor } from "../models/foundation.js";
import { Inventory, type InventoryDoc } from "../models/inventory.js";
import { Lead } from "../models/lead.js";
import { placeHold, releaseHoldIds } from "./availability.js";

type ItemIn = z.infer<typeof quoteItemInput>;
export type QuoteDoc = {
  _id: string; quoteNo: string; version: number; leadId: string; clientId?: string | null; status: string; validUntil: Date;
  items: { inventoryId: string; vendorId: string; title: string; category: string; city: string; pricingUnit: string; from: Date; to: Date; qty: number; rate: number; billableUnits: number; production: number; installation: number; media: number; lineTotal: number; vendorCost: number; description?: string | null }[];
  mediaTotal: number; productionTotal: number; installationTotal: number; subtotal: number; serviceFeePct: number; serviceFee: number; taxable: number; cgst: number; sgst: number; gst: number; total: number;
  currency: string; terms?: string | null; holdIds: string[]; releasedAt?: Date | null; decision?: string | null; decisionComment?: string | null; decidedAt?: Date | null; createdAt: Date; updatedAt: Date;
};

/** Released quotes past their validity date read as Expired, even before any job updates them. */
export const effectiveStatus = (q: Pick<QuoteDoc, "status" | "validUntil">) =>
  q.status === "released" && toDay(fromDay(q.validUntil.getTime())) < toDay(todayIST()) ? "expired" : q.status;

export function quoteView(q: QuoteDoc, audience: "admin" | "client") {
  const vendorCost = q.items.reduce((a, i) => a + i.vendorCost, 0);
  return {
    quoteId: q._id, quoteNo: q.quoteNo, version: q.version, leadId: q.leadId, status: effectiveStatus(q),
    validUntil: fromDay(q.validUntil.getTime()), currency: q.currency, terms: q.terms ?? null,
    items: q.items.map((i) => ({
      inventoryId: i.inventoryId, title: i.title, category: i.category, city: i.city, pricingUnit: i.pricingUnit,
      from: fromDay(i.from.getTime()), to: fromDay(i.to.getTime()), qty: i.qty, rate: i.rate, billableUnits: i.billableUnits,
      media: i.media, production: i.production, installation: i.installation, lineTotal: i.lineTotal, description: i.description ?? null,
      ...(audience === "admin" ? { vendorId: i.vendorId, vendorCost: i.vendorCost } : {}),
    })),
    mediaTotal: q.mediaTotal, productionTotal: q.productionTotal, installationTotal: q.installationTotal, subtotal: q.subtotal,
    serviceFeePct: q.serviceFeePct, serviceFee: q.serviceFee, cgst: q.cgst, sgst: q.sgst, gst: q.gst, total: q.total,
    releasedAt: q.releasedAt ?? null, decision: q.decision ?? null, decisionComment: q.decisionComment ?? null, decidedAt: q.decidedAt ?? null,
    createdAt: q.createdAt, updatedAt: q.updatedAt,
    ...(audience === "admin" ? { holdIds: q.holdIds, vendorCostTotal: vendorCost, margin: q.subtotal - vendorCost } : {}),
  };
}

/**
 * Prices each line server-side from the listing (client-sent totals are never used):
 * the item must be approved + VERIFIED, its vendor KYC-approved and assigned to this lead.
 */
async function priceItems(leadId: string, items: ItemIn[], serviceFeePct: number) {
  const inv = await Inventory.find({ _id: { $in: items.map((i) => i.inventoryId) } }).lean<InventoryDoc[]>();
  const assigned = new Set((await LeadAssignment.find({ leadId, status: "active" }).lean()).map((a) => a.vendorId));
  const vendors = await Vendor.find({ _id: { $in: inv.map((i) => i.vendorId) } }).select("_id kycStatus").lean();
  const problems: string[] = [];
  const lines = items.map((it) => {
    const l = inv.find((x) => x._id === it.inventoryId);
    if (!l || l.status !== "approved") { problems.push(`${it.inventoryId} is not an approved listing`); return null; }
    if (l.dataType !== "VERIFIED") { problems.push(`${it.inventoryId} is demo/unverified inventory and can't be quoted`); return null; }
    if (vendors.find((v) => v._id === l.vendorId)?.kycStatus !== "approved") problems.push(`${it.inventoryId}: vendor ${l.vendorId} is not KYC-approved`);
    if (!assigned.has(l.vendorId)) problems.push(`${it.inventoryId}: assign vendor ${l.vendorId} to this lead first`);
    const unit = l.pricingUnit as PricingUnit;
    const billableUnits = it.billableUnits ?? defaultBillableUnits(unit, it.from, it.to, l.attributes as Record<string, unknown>);
    const rate = it.rate ?? l.indicativePrice ?? 0;
    if (!(rate > 0)) problems.push(`${it.inventoryId}: enter a client rate`);
    return {
      inventoryId: l._id, vendorId: l.vendorId, title: l.title, category: l.category, city: l.city, pricingUnit: unit,
      from: new Date(toDay(it.from)), to: new Date(toDay(it.to)), qty: it.qty, rate, billableUnits,
      production: it.production, installation: it.installation,
      vendorCost: it.vendorCost ?? Math.round(l.rate * it.qty * billableUnits), description: it.description ?? null,
    };
  });
  if (problems.length) throw new AppError(409, "CONFLICT", "This quote can't be priced yet", { problems });
  const ok = lines.filter((x): x is NonNullable<typeof x> => !!x);
  const totals = computeQuoteTotals(ok, serviceFeePct);
  const priced = ok.map((l, i) => ({ ...l, media: totals.items[i]!.media, lineTotal: totals.items[i]!.lineTotal }));
  const { items: _ignore, ...sums } = totals;
  return { items: priced, ...sums };
}

const defaultValidity = () => fromDay(toDay(todayIST()) + DEFAULT_QUOTE_VALIDITY_DAYS * 86_400_000);
function checkValidity(v: string) {
  if (toDay(v) < toDay(todayIST())) throw badRequest("Validity date can't be in the past", { fieldErrors: { validUntil: ["Validity date can't be in the past"] } });
}

export async function createQuote(req: Request, input: z.infer<typeof quoteCreateInput>) {
  const lead = await Lead.findById(input.leadId).lean();
  if (!lead) throw notFound("Lead not found");
  if (!["under_review", "assigned", "quoted"].includes(lead.status)) throw new AppError(409, "INVALID_TRANSITION", `Can't quote a lead that is ${lead.status}`);
  if (await Quote.exists({ leadId: lead._id, status: { $in: ["draft", "released", "revision_requested", "approved"] } })) {
    throw new AppError(409, "CONFLICT", "This lead already has an open quote — revise it instead");
  }
  const validUntil = input.validUntil ?? defaultValidity();
  checkValidity(validUntil);
  const priced = await priceItems(lead._id, input.items, input.serviceFeePct);
  const quoteNo = await nextId("QT");
  const q = await Quote.create({
    _id: `${quoteNo}-V1`, quoteNo, version: 1, leadId: lead._id, clientId: lead.clientId ?? null, status: "draft",
    validUntil: new Date(toDay(validUntil)), terms: input.terms ?? null, createdBy: req.user!.userId, ...priced,
  });
  await audit(req, { action: "quote.create", entity: "quote", entityId: q._id, after: { leadId: lead._id, total: q.total, version: 1 } });
  return q.toObject() as unknown as QuoteDoc;
}

export async function updateDraft(req: Request, id: string, patch: { validUntil?: string | undefined; serviceFeePct?: number | undefined; items?: ItemIn[] | undefined; terms?: string | undefined }) {
  const q = await Quote.findById(id).lean<QuoteDoc>();
  if (!q) throw notFound("Quote not found");
  if (q.status !== "draft") throw new AppError(409, "CONFLICT", `Only drafts can be edited — this version is ${effectiveStatus(q)}. Create a revision instead.`);
  if (patch.validUntil) checkValidity(patch.validUntil);
  const items: ItemIn[] = patch.items ?? q.items.map((i) => ({ inventoryId: i.inventoryId, from: fromDay(i.from.getTime()), to: fromDay(i.to.getTime()), qty: i.qty, rate: i.rate, billableUnits: i.billableUnits, production: i.production, installation: i.installation, vendorCost: i.vendorCost, ...(i.description ? { description: i.description } : {}) }));
  const priced = await priceItems(q.leadId, items, patch.serviceFeePct ?? q.serviceFeePct);
  const set: Record<string, unknown> = { ...priced };
  if (patch.validUntil) set.validUntil = new Date(toDay(patch.validUntil));
  if (patch.terms !== undefined) set.terms = patch.terms;
  const after = await Quote.findOneAndUpdate({ _id: id, status: "draft" }, { $set: set }, { returnDocument: "after" }).lean<QuoteDoc>();
  await audit(req, { action: "quote.update", entity: "quote", entityId: id, before: { total: q.total, validUntil: q.validUntil }, after: { total: after!.total, validUntil: after!.validUntil } });
  return after!;
}

/** Admin approves pricing and releases to the client; each line gets a 48 h hold (all or nothing). */
export async function releaseQuote(req: Request, cfg: Parameters<typeof placeHold>[0], id: string) {
  const q = await Quote.findById(id).lean<QuoteDoc>();
  if (!q) throw notFound("Quote not found");
  if (q.status !== "draft") throw new AppError(409, "INVALID_TRANSITION", `Only a draft can be released (this one is ${effectiveStatus(q)})`);
  if (toDay(fromDay(q.validUntil.getTime())) < toDay(todayIST())) throw new AppError(409, "CONFLICT", "Validity date has passed — update it before releasing");
  // Re-price at release so nothing stale (listing withdrawn, vendor suspended, assignment removed) reaches the client.
  await priceItems(q.leadId, q.items.map((i) => ({ inventoryId: i.inventoryId, from: fromDay(i.from.getTime()), to: fromDay(i.to.getTime()), qty: i.qty, rate: i.rate, billableUnits: i.billableUnits, production: i.production, installation: i.installation, vendorCost: i.vendorCost })), q.serviceFeePct);
  // Older versions' holds give way to this version's holds.
  const older = await Quote.find({ quoteNo: q.quoteNo, version: { $lt: q.version } }).select("holdIds").lean();
  await releaseHoldIds(req, older.flatMap((o) => o.holdIds), `Superseded by ${q._id}`);
  const holdIds: string[] = [];
  try {
    for (const it of q.items) {
      const h = await placeHold(cfg, req, { inventoryId: it.inventoryId, from: fromDay(it.from.getTime()), to: fromDay(it.to.getTime()), qty: it.qty, leadId: q.leadId, note: `Quote ${q._id}` });
      holdIds.push(h.holdId);
    }
  } catch (e) {
    await releaseHoldIds(req, holdIds, `Release of ${q._id} failed`);
    throw e;
  }
  const after = await Quote.findOneAndUpdate({ _id: id, status: "draft" }, { $set: { status: "released", releasedAt: new Date(), releasedBy: req.user!.userId, holdIds } }, { returnDocument: "after" }).lean<QuoteDoc>();
  await Lead.updateOne({ _id: q.leadId, status: { $in: ["under_review", "assigned", "quoted"] } }, { $set: { status: "quoted" } });
  await audit(req, { action: "quote.release", entity: "quote", entityId: id, before: { status: "draft" }, after: { status: "released", total: q.total, holdIds } });
  return after!;
}

/** New version from the latest one. Approved versions are immutable and can't be revised. */
export async function reviseQuote(req: Request, id: string) {
  const q = await Quote.findById(id).lean<QuoteDoc>();
  if (!q) throw notFound("Quote not found");
  const latest = await Quote.findOne({ quoteNo: q.quoteNo }).sort({ version: -1 }).lean<QuoteDoc>();
  if (latest!._id !== q._id) throw new AppError(409, "CONFLICT", `Revise the latest version (${latest!._id})`);
  const st = effectiveStatus(q);
  if (st === "approved") throw new AppError(409, "CONFLICT", "Approved quotes are immutable");
  if (st === "draft") throw new AppError(409, "CONFLICT", "This version is still a draft — edit it instead");
  const version = q.version + 1;
  const { _id, createdAt: _c, updatedAt: _u, holdIds: _h, releasedAt: _r, decision: _d, decisionComment: _dc, decidedAt: _da, ...rest } = q;
  const next = await Quote.create({ ...rest, _id: `${q.quoteNo}-V${version}`, version, status: "draft", holdIds: [], createdBy: req.user!.userId, validUntil: new Date(Math.max(q.validUntil.getTime(), toDay(defaultValidity()))) });
  if (st === "released" || st === "revision_requested") await Quote.updateOne({ _id: q._id }, { $set: { status: "superseded" } });
  await audit(req, { action: "quote.revise", entity: "quote", entityId: next._id, before: { quoteId: q._id, status: st }, after: { quoteId: next._id, version } });
  return next.toObject() as unknown as QuoteDoc;
}

/** Client decision on a released quote addressed to them. Expired quotes can't be approved. */
export async function clientDecision(req: Request, id: string, decision: "approve" | "reject" | "revise", comment?: string) {
  const q = await Quote.findOne({ _id: id, clientId: req.user!.orgId }).lean<QuoteDoc>();
  if (!q || q.status === "draft") throw notFound("Quote not found");
  const st = effectiveStatus(q);
  if (st === "expired") throw new AppError(409, "INVALID_TRANSITION", "This quote has expired. Ask OOHRENA for a fresh quote.");
  if (st !== "released") throw new AppError(409, "INVALID_TRANSITION", `This quote is ${st.replace("_", " ")} and can't be changed`);
  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revision_requested";
  const after = await Quote.findOneAndUpdate(
    { _id: id, status: "released" },
    { $set: { status, decision, decisionComment: comment ?? null, decidedAt: new Date(), decidedBy: req.user!.userId } },
    { returnDocument: "after" },
  ).lean<QuoteDoc>();
  if (!after) throw new AppError(409, "CONFLICT", "Quote changed while deciding; refresh and try again");
  if (decision === "reject") await releaseHoldIds(req, q.holdIds, `Client rejected ${q._id}`);
  await audit(req, { action: `quote.client.${decision}`, entity: "quote", entityId: id, before: { status: "released" }, after: { status }, reason: comment ?? null });
  return after;
}

