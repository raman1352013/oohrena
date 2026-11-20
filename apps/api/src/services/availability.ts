import type { Request } from "express";
import type { ClientSession } from "mongoose";
import {
  capacityFor, dayMs, fromDay, minDaysFor, toDay, todayIST, daysInclusive,
  type AvailabilityState, type AvailabilitySummary, type DayAvailability,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { withTransaction } from "../lib/tx.js";
import { ACTIVE_BLOCK_STATUSES, AvailabilityBlock, AvailabilityRequest } from "../models/availability.js";
import { User } from "../models/foundation.js";
import { Inventory, type InventoryDoc } from "../models/inventory.js";
import { notify } from "./notifications.js";

type Block = { _id: unknown; inventoryId: string; from: Date; to: Date; qty: number; status: string; kind: string; expiresAt?: Date | null; updatedAt?: Date };

export const activeFilter = (now = new Date()) => ({ status: { $in: ACTIVE_BLOCK_STATUSES }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] });

const STATE_RANK: Record<string, number> = { blocked: 4, booked: 3, pending_vendor: 2, held: 1 };
const STATE_OF: Record<string, AvailabilityState> = { blocked: "blocked", booked: "booked", pending_vendor: "pending_vendor", held: "hold" };

/** Per-day usage for one listing across [from, to] (calendar dates). */
export function computeDays(inv: Pick<InventoryDoc, "category" | "quantity" | "attributes">, blocks: Block[], from: string, to: string): DayAvailability[] {
  const { capacity } = capacityFor(inv.category, inv.quantity, inv.attributes as Record<string, unknown>);
  const out: DayAvailability[] = [];
  for (let t = toDay(from); t <= toDay(to); t += dayMs) {
    let used = 0;
    let top = "";
    for (const b of blocks) {
      if (b.from.getTime() <= t && b.to.getTime() >= t) {
        used += b.qty;
        if ((STATE_RANK[b.status] ?? 0) > (STATE_RANK[top] ?? 0)) top = b.status;
      }
    }
    const free = Math.max(0, capacity - used);
    // A day is shown by its most restrictive block only once it is full; partly used days stay "available" with fewer free units.
    const state: AvailabilityState = free > 0 ? "available" : (STATE_OF[top] ?? "booked");
    out.push({ date: fromDay(t), capacity, used, free, state });
  }
  return out;
}

export async function blocksFor(inventoryIds: string[], from: string, to: string, session?: ClientSession) {
  return AvailabilityBlock.find({ inventoryId: { $in: inventoryIds }, from: { $lte: new Date(toDay(to)) }, to: { $gte: new Date(toDay(from)) }, ...activeFilter() })
    .session(session ?? null).lean<Block[]>();
}

export function summarise(inv: InventoryDoc, days: DayAvailability[], qty: number): AvailabilitySummary {
  const { capacity, unitLabel } = capacityFor(inv.category, inv.quantity, inv.attributes as Record<string, unknown>);
  const minFree = days.length ? Math.min(...days.map((d) => d.free)) : capacity;
  return {
    state: minFree >= qty ? "available" : days.some((d) => d.free >= qty) ? "limited" : "unavailable",
    minFree, capacity, unitLabel,
    confirmed: inv.availabilityMode === "managed",
    lastUpdatedAt: new Date(inv.availabilityUpdatedAt ?? inv.updatedAt).toISOString(),
  };
}

/** Availability summaries for many listings with one query (search results). */
export async function summariesFor(items: InventoryDoc[], from: string, to: string, qty: number) {
  const blocks = await blocksFor(items.map((i) => i._id), from, to);
  return new Map(items.map((i) => [i._id, summarise(i, computeDays(i, blocks.filter((b) => b.inventoryId === i._id), from, to), qty)]));
}

function checkRange(from: string, to: string, category: string) {
  if (toDay(from) < toDay(todayIST())) throw badRequest("Start date can't be in the past", { fieldErrors: { from: ["Start date can't be in the past"] } });
  const min = minDaysFor(category);
  if (daysInclusive(from, to) < min) throw badRequest(`This media is booked in periods of at least ${min} days`, { fieldErrors: { to: [`Minimum ${min} days`] } });
}

/**
 * Locks the listing for this transaction: concurrent hold/booking transactions on the same listing
 * both write availabilityRev, so MongoDB aborts all but one (write conflict → driver retries → re-check fails cleanly).
 */
async function lockListing(inventoryId: string, session: ClientSession) {
  const inv = await Inventory.findOneAndUpdate(
    { _id: inventoryId },
    { $inc: { availabilityRev: 1 }, $set: { availabilityUpdatedAt: new Date() } },
    { returnDocument: "after", session },
  ).lean<InventoryDoc>();
  if (!inv) throw notFound("Listing not found");
  return inv;
}

async function assertCapacity(inv: InventoryDoc, from: string, to: string, qty: number, session: ClientSession) {
  const days = computeDays(inv, await blocksFor([inv._id], from, to, session), from, to);
  const short = days.filter((d) => d.free < qty);
  if (short.length) {
    throw new AppError(409, "CONFLICT", `Not available for the selected dates (${short.length} day${short.length > 1 ? "s" : ""} already taken)`, {
      unavailableDays: short.slice(0, 31).map((d) => ({ date: d.date, free: d.free, state: d.state })),
    });
  }
}

/** Admin/system temporary hold — transactional, expires after HOLD_HOURS. */
export async function placeHold(cfg: Config, req: Request, input: { inventoryId: string; from: string; to: string; qty: number; leadId?: string | undefined; note?: string | undefined }) {
  return withTransaction(async (session) => {
    const inv = await lockListing(input.inventoryId, session);
    if (inv.status !== "approved") throw new AppError(409, "CONFLICT", "Only approved listings can be held");
    if (inv.dataType !== "VERIFIED") throw new AppError(409, "CONFLICT", "Demo or unverified inventory can never be held or booked");
    checkRange(input.from, input.to, inv.category);
    await assertCapacity(inv, input.from, input.to, input.qty, session);
    const expiresAt = new Date(Date.now() + cfg.HOLD_HOURS * 3600_000);
    const pendingVendor = inv.availabilityMode !== "managed";
    const [hold] = await AvailabilityBlock.create([{
      inventoryId: inv._id, vendorId: inv.vendorId, kind: "hold", from: new Date(toDay(input.from)), to: new Date(toDay(input.to)), qty: input.qty,
      status: pendingVendor ? "pending_vendor" : "held", expiresAt, leadId: input.leadId ?? null, reason: input.note ?? null, source: "admin", createdBy: req.user!.userId,
    }], { session });
    if (pendingVendor) {
      await AvailabilityRequest.create([{ holdId: String(hold!._id), inventoryId: inv._id, vendorId: inv.vendorId, from: hold!.from, to: hold!.to, qty: input.qty, respondBy: expiresAt }], { session });
      const vUser = await User.findOne({ orgId: inv.vendorId }).select("_id email mobile").lean();
      if (vUser) {
        await notify("hold.requested", [{ userId: vUser._id, email: vUser.email, mobile: vUser.mobile }], {
          inventoryId: inv._id,
          from: input.from,
          to: input.to,
        });
      }
    }
    await audit(req, { action: "availability.hold.create", entity: "inventory", entityId: inv._id, after: { holdId: String(hold!._id), from: input.from, to: input.to, qty: input.qty, status: hold!.status, expiresAt, leadId: input.leadId ?? null } }, session);
    return toHoldView(hold!.toObject());
  });
}

export function toHoldView(h: { _id: unknown; inventoryId: string; vendorId: string; kind: string; from: Date; to: Date; qty: number; status: string; expiresAt?: Date | null; leadId?: string | null; reason?: string | null; createdAt?: Date }) {
  const expired = !!h.expiresAt && h.expiresAt.getTime() <= Date.now() && (h.status === "held" || h.status === "pending_vendor");
  return {
    holdId: String(h._id), inventoryId: h.inventoryId, vendorId: h.vendorId, kind: h.kind,
    from: fromDay(h.from.getTime()), to: fromDay(h.to.getTime()), qty: h.qty,
    status: expired ? "expired" : h.status, expiresAt: h.expiresAt ?? null, leadId: h.leadId ?? null, reason: h.reason ?? null, createdAt: h.createdAt ?? null,
  };
}

export async function releaseHold(req: Request, holdId: string, reason: string) {
  const h = await AvailabilityBlock.findOneAndUpdate(
    { _id: holdId, kind: "hold", status: { $in: ["held", "pending_vendor"] } },
    { $set: { status: "released", endedAt: new Date(), endedBy: req.user!.userId, reason } },
    { returnDocument: "after" },
  ).lean().catch(() => null);
  if (!h) throw notFound("Active hold not found");
  await AvailabilityRequest.updateOne({ holdId, status: "pending" }, { $set: { status: "cancelled" } });
  await Inventory.updateOne({ _id: h.inventoryId }, { $set: { availabilityUpdatedAt: new Date() } });
  await audit(req, { action: "availability.hold.release", entity: "inventory", entityId: h.inventoryId, after: { holdId, status: "released" }, reason });
  return toHoldView(h);
}

/** Marks lapsed holds Expired and their vendor requests Expired. Capacity checks already ignore them by time; this keeps statuses honest. */
export async function expireHolds(now = new Date()) {
  const due = await AvailabilityBlock.find({ kind: "hold", status: { $in: ["held", "pending_vendor"] }, expiresAt: { $lte: now } }).select("_id inventoryId").lean();
  if (!due.length) return 0;
  const ids = due.map((d) => d._id);
  await AvailabilityBlock.updateMany({ _id: { $in: ids }, status: { $in: ["held", "pending_vendor"] } }, { $set: { status: "expired", endedAt: now, endedBy: "system" } });
  await AvailabilityRequest.updateMany({ holdId: { $in: ids.map(String) }, status: "pending" }, { $set: { status: "expired" } });
  await Inventory.updateMany({ _id: { $in: [...new Set(due.map((d) => d.inventoryId))] } }, { $set: { availabilityUpdatedAt: now } });
  for (const d of due) await audit(null, { action: "availability.hold.expire", entity: "inventory", entityId: d.inventoryId, after: { holdId: String(d._id), status: "expired" }, userId: null, role: "system" });
  return due.length;
}

/** Vendor confirms or declines a hold within the confirmation window. Logged with user, time and channel. */
export async function vendorRespond(req: Request, vendorId: string, requestId: string, response: "confirm" | "decline", note?: string) {
  return withTransaction(async (session) => {
    const r = await AvailabilityRequest.findOne({ _id: requestId, vendorId }).session(session).lean().catch(() => null);
    if (!r) throw notFound("Request not found");
    if (r.status !== "pending") throw new AppError(409, "INVALID_TRANSITION", `This request is already ${r.status}`);
    if (r.respondBy.getTime() <= Date.now()) throw new AppError(409, "INVALID_TRANSITION", "The confirmation window has passed; the hold has expired");
    await lockListing(r.inventoryId, session);
    const status = response === "confirm" ? "confirmed" : "declined";
    await AvailabilityRequest.updateOne({ _id: r._id }, { $set: { status, respondedAt: new Date(), respondedBy: req.user!.userId, channel: "vendor_portal", note: note ?? null } }, { session });
    await AvailabilityBlock.updateOne(
      { _id: r.holdId, status: "pending_vendor" },
      response === "confirm" ? { $set: { status: "held" } } : { $set: { status: "declined", endedAt: new Date(), endedBy: req.user!.userId } },
      { session },
    );
    await audit(req, { action: `availability.vendor.${response}`, entity: "inventory", entityId: r.inventoryId, before: { status: "pending" }, after: { status, holdId: r.holdId, channel: "vendor_portal" }, reason: note ?? null }, session);
    return { requestId: String(r._id), holdId: r.holdId, status };
  });
}

/** Admin or owning vendor blocks dates (maintenance, offline, sold elsewhere). Uses the same capacity guard. */
export async function addBlock(req: Request, inventoryId: string, input: { from: string; to: string; qty?: number | undefined; reason: string }, source: "admin" | "vendor") {
  return withTransaction(async (session) => {
    const inv = await lockListing(inventoryId, session);
    const { capacity } = capacityFor(inv.category, inv.quantity, inv.attributes as Record<string, unknown>);
    const qty = input.qty ?? capacity;
    if (qty > capacity) throw badRequest(`This listing has ${capacity} unit(s) per day`);
    await assertCapacity(inv, input.from, input.to, qty, session);
    const [b] = await AvailabilityBlock.create([{
      inventoryId: inv._id, vendorId: inv.vendorId, kind: "block", from: new Date(toDay(input.from)), to: new Date(toDay(input.to)), qty,
      status: "blocked", reason: input.reason, source, createdBy: req.user!.userId,
    }], { session });
    await audit(req, { action: "availability.block", entity: "inventory", entityId: inv._id, after: { blockId: String(b!._id), from: input.from, to: input.to, qty }, reason: input.reason }, session);
    return toHoldView(b!.toObject());
  });
}

export async function removeBlock(req: Request, inventoryId: string, blockId: string, vendorId?: string) {
  const b = await AvailabilityBlock.findOneAndUpdate(
    { _id: blockId, inventoryId, kind: "block", status: "blocked", ...(vendorId ? { vendorId, source: "vendor" } : {}) },
    { $set: { status: "released", endedAt: new Date(), endedBy: req.user!.userId } },
    { returnDocument: "after" },
  ).lean().catch(() => null);
  if (!b) throw notFound("Block not found");
  await Inventory.updateOne({ _id: inventoryId }, { $set: { availabilityUpdatedAt: new Date() } });
  await audit(req, { action: "availability.unblock", entity: "inventory", entityId: inventoryId, after: { blockId } });
  return toHoldView(b);
}

type BookItem = { inventoryId: string; from: Date; to: Date; qty: number };

/**
 * Module 6: turns a quote's holds into booking blocks inside ONE transaction.
 * Own holds are ended first, then each item's capacity is re-checked (a hold may have expired and the dates been taken).
 */
export async function bookItems(req: Request, bookingId: string, items: BookItem[], ownHoldIds: string[], session: ClientSession) {
  if (ownHoldIds.length) {
    await AvailabilityBlock.updateMany(
      { _id: { $in: ownHoldIds }, status: { $in: ["held", "pending_vendor"] } },
      { $set: { status: "released", endedAt: new Date(), endedBy: req.user!.userId, reason: `Converted to booking ${bookingId}` } },
      { session },
    );
  }
  const blockIds: string[] = [];
  for (const it of items) {
    const inv = await lockListing(it.inventoryId, session);
    if (inv.status !== "approved" || inv.dataType !== "VERIFIED") throw new AppError(409, "CONFLICT", `${inv._id} is no longer bookable`);
    const from = fromDay(it.from.getTime());
    const to = fromDay(it.to.getTime());
    await assertCapacity(inv, from, to, it.qty, session);
    const [b] = await AvailabilityBlock.create([{
      inventoryId: inv._id, vendorId: inv.vendorId, kind: "booking", from: it.from, to: it.to, qty: it.qty,
      status: "booked", bookingId, source: "system", createdBy: req.user!.userId,
    }], { session });
    blockIds.push(String(b!._id));
  }
  return blockIds;
}

/** Releases a booking's blocks (cancellation) or the blocks before re-booking new dates (reschedule). */
export async function releaseBookingBlocks(req: Request, bookingId: string, reason: string, session: ClientSession) {
  const blocks = await AvailabilityBlock.find({ bookingId, kind: "booking", status: "booked" }).session(session).lean();
  for (const b of blocks) await lockListing(b.inventoryId, session);
  await AvailabilityBlock.updateMany({ bookingId, kind: "booking", status: "booked" }, { $set: { status: "released", endedAt: new Date(), endedBy: req.user!.userId, reason } }, { session });
  return blocks.length;
}

/** Releases holds that belong to older quote versions (and any other ids given). */
export async function releaseHoldIds(req: Request, holdIds: string[], reason: string) {
  if (!holdIds.length) return;
  const res = await AvailabilityBlock.updateMany(
    { _id: { $in: holdIds }, kind: "hold", status: { $in: ["held", "pending_vendor"] } },
    { $set: { status: "released", endedAt: new Date(), endedBy: req.user!.userId, reason } },
  );
  await AvailabilityRequest.updateMany({ holdId: { $in: holdIds }, status: "pending" }, { $set: { status: "cancelled" } });
  return res.modifiedCount;
}
