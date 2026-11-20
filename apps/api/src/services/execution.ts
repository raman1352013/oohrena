import type { Request } from "express";
import type { ClientSession } from "mongoose";
import {
  MAX_PROOF_BYTES, PROOF_MIME, WO_FLOW, canRaiseIssueFrom, fromDay, gpsLabel, proofScheduleFor, toDay, todayIST,
  type WorkOrderStatus,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { signFileUrl } from "../lib/signed-url.js";
import { saveUpload } from "../lib/storage.js";
import { Booking, BookingHistory, WorkOrder } from "../models/booking.js";
import { Campaign, ExecutionUpdate, Issue, Proof, ProofSchedule } from "../models/execution.js";
import { Inventory } from "../models/inventory.js";
import { syncPayables } from "./finance.js";

type WO = { _id: string; bookingId: string; vendorId: string; status: string; previousStatus?: string | null; campaignId?: string | null; items: { inventoryId: string; from: Date; to: Date }[] };

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/** Creates the booking's campaign (once) and each new work order's proof schedule. Called when work orders are issued. */
export async function startExecution(bookingId: string, woIds: string[], session?: ClientSession) {
  const b = await Booking.findById(bookingId).session(session ?? null).lean();
  if (!b) throw notFound("Booking not found");
  let c = (await Campaign.findOne({ bookingId }).session(session ?? null).lean()) as { _id: string } | null;
  if (!c) {
    const id = await nextId("CMP", session);
    const [created] = await Campaign.create([{ _id: id, bookingId, clientId: b.clientId ?? null, start: b.start, end: b.end }], { session });
    c = { _id: created!._id };
  }
  for (const woId of woIds) {
    const w = await WorkOrder.findByIdAndUpdate(woId, { $set: { campaignId: c!._id } }, { returnDocument: "after", session }).lean<WO>();
    const rows = w!.items.flatMap((it) => proofScheduleFor(fromDay(it.from.getTime()), fromDay(it.to.getTime())).map((s) => ({
      campaignId: c!._id, bookingId, workOrderId: woId, vendorId: w!.vendorId, inventoryId: it.inventoryId, type: s.type, dueDate: new Date(toDay(s.dueDate)),
    })));
    await ProofSchedule.insertMany(rows, { session });
  }
  return c!._id;
}

/** Vendor (own) or Admin may act on a work order; anyone else gets 404. */
export async function loadWorkOrderFor(req: Request, id: string) {
  const w = await WorkOrder.findById(id).lean<WO>();
  const u = req.user!;
  if (!w || !(u.role === "admin" || (u.role === "vendor" && u.orgId === w.vendorId))) throw notFound("Work order not found");
  return w;
}

/** Booking/campaign follow their work orders: first site live → Live; every site completed → Completed. */
async function syncBooking(req: Request, bookingId: string) {
  const wos = await WorkOrder.find({ bookingId, status: { $ne: "cancelled" } }).lean<WO[]>();
  const b = await Booking.findById(bookingId).lean();
  if (!b || !wos.length) return;
  const anyLive = wos.some((w) => w.status !== "scheduled");
  const allDone = wos.every((w) => w.status === "completed");
  const move = async (to: "live" | "completed") => {
    const from = b.status;
    const res = await Booking.updateOne({ _id: bookingId, status: from }, { $set: { status: to } });
    if (!res.modifiedCount) return;
    await Campaign.updateOne({ bookingId }, { $set: { status: to } });
    await BookingHistory.create({ bookingId, fromStatus: from, toStatus: to, changedBy: req.user!.userId, reason: to === "live" ? "First site installed" : "All sites completed" });
    await audit(req, { action: `booking.${to}`, entity: "booking", entityId: bookingId, before: { status: from }, after: { status: to } });
  };
  if (b.status === "confirmed" && anyLive) { await move("live"); b.status = "live"; }
  if (b.status === "live" && allDone) await move("completed");
}

/** Validated work-order transitions with the evidence each step needs. */
export async function changeWorkOrderStatus(req: Request, id: string, to: "installed" | "inspection_due" | "completed", note?: string) {
  const w = await loadWorkOrderFor(req, id);
  const from = w.status as WorkOrderStatus;
  if (!WO_FLOW[from].includes(to)) {
    throw new AppError(409, "INVALID_TRANSITION", from === "issue_raised" ? "Resolve the open issue first" : `A work order can't move from ${from.replace("_", " ")} to ${to.replace("_", " ")}`);
  }
  if (to === "installed") {
    const before = await Proof.find({ workOrderId: id, type: "before", status: { $in: ["uploaded", "verified"] } }).select("inventoryId").lean();
    const missing = w.items.filter((i) => !before.some((p) => p.inventoryId === i.inventoryId)).map((i) => i.inventoryId);
    if (missing.length) throw new AppError(409, "CONFLICT", `Upload installation proof first for ${missing.join(", ")}`);
  }
  if (to === "completed") {
    const end = Math.max(...w.items.map((i) => i.to.getTime()));
    if (toDay(todayIST()) < end) throw new AppError(409, "CONFLICT", `The campaign runs until ${fromDay(end)}; complete it after that date`);
  }
  const res = await WorkOrder.updateOne({ _id: id, status: from }, { $set: { status: to } });
  if (!res.modifiedCount) throw new AppError(409, "CONFLICT", "Work order changed meanwhile; refresh and try again");
  await ExecutionUpdate.create({ workOrderId: id, fromStatus: from, status: to, note: note ?? null, byUser: req.user!.userId });
  await audit(req, { action: "workorder.status", entity: "work_order", entityId: id, before: { status: from }, after: { status: to }, reason: note ?? null });
  await syncBooking(req, w.bookingId);
  return { workOrderId: id, status: to };
}

/** Proof upload: server timestamp is authoritative; device time and GPS are stored as reported, labelled honestly. */
export async function uploadProof(cfg: Config, req: Request, woId: string, file: Express.Multer.File | undefined, meta: { inventoryId: string; scheduleId?: string | undefined; capturedAt?: string | undefined; lat?: number | undefined; lng?: number | undefined; accuracyM?: number | undefined; note?: string | undefined }) {
  const w = await loadWorkOrderFor(req, woId);
  if (["completed", "cancelled"].includes(w.status)) throw new AppError(409, "CONFLICT", `Proof can't be added to a ${w.status} work order`);
  if (!w.campaignId) throw new AppError(409, "CONFLICT", "This work order has no campaign yet");
  if (!w.items.some((i) => i.inventoryId === meta.inventoryId)) throw badRequest("That media item is not on this work order");
  if (!file) throw badRequest("Attach a photo or video", { fieldErrors: { file: ["Attach a photo or video"] } });

  const slotFilter = { workOrderId: woId, inventoryId: meta.inventoryId };
  const slot = meta.scheduleId
    ? await ProofSchedule.findOne({ _id: meta.scheduleId, ...slotFilter }).lean().catch(() => null)
    : await ProofSchedule.findOne({ ...slotFilter, status: { $in: ["due", "rejected"] } }).sort({ dueDate: 1 }).lean();
  if (meta.scheduleId && !slot) throw notFound("Proof slot not found");
  if (slot && slot.status === "verified") throw new AppError(409, "CONFLICT", "This proof slot is already verified");

  const stored = await saveUpload(cfg, file.buffer, { kind: "proof", allowed: PROOF_MIME, maxBytes: MAX_PROOF_BYTES, encryptAtRest: false, ownerUserId: req.user!.userId, vendorId: w.vendorId, originalName: file.originalname });
  const inv = await Inventory.findById(meta.inventoryId).select("location").lean();
  const hasGps = meta.lat !== undefined && meta.lng !== undefined;
  const [lng, lat] = (inv?.location?.coordinates ?? []) as number[];
  const distanceM = hasGps && lat !== undefined && lng !== undefined ? haversineM({ lat: meta.lat!, lng: meta.lng! }, { lat, lng }) : null;
  const capturedAt = meta.capturedAt ? new Date(meta.capturedAt) : null;
  const id = await nextId("PRF");
  const replaces = slot?.status === "rejected" ? slot.latestProofId : null;
  const p = await Proof.create({
    _id: id, campaignId: w.campaignId, bookingId: w.bookingId, workOrderId: woId, vendorId: w.vendorId, inventoryId: meta.inventoryId,
    scheduleId: slot ? String(slot._id) : null, type: slot?.type ?? "periodic", fileId: stored._id, mime: stored.mime,
    capturedAt, lat: hasGps ? meta.lat : null, lng: hasGps ? meta.lng : null, accuracyM: hasGps ? (meta.accuracyM ?? null) : null,
    gpsSource: hasGps ? "device" : "none", distanceM, uploadedBy: req.user!.userId, note: meta.note ?? null, replacesProofId: replaces,
  });
  if (slot) await ProofSchedule.updateOne({ _id: slot._id }, { $set: { latestProofId: id, status: "uploaded" } });
  await audit(req, { action: replaces ? "proof.reupload" : "proof.upload", entity: "proof", entityId: id, after: { workOrderId: woId, bookingId: w.bookingId, campaignId: w.campaignId, type: p.type, gpsSource: p.gpsSource, distanceM, replaces } });
  return p.toObject();
}

export async function decideProof(req: Request, id: string, decision: "verify" | "reject", reason?: string) {
  const p = await Proof.findById(id).lean();
  if (!p) throw notFound("Proof not found");
  if (p.status !== "uploaded") throw new AppError(409, "INVALID_TRANSITION", `This proof is already ${p.status}`);
  const status = decision === "verify" ? "verified" : "rejected";
  await Proof.updateOne({ _id: id, status: "uploaded" }, { $set: { status, verifiedBy: req.user!.userId, decidedAt: new Date(), rejectReason: decision === "reject" ? reason : null } });
  if (p.scheduleId) {
    await ProofSchedule.updateOne({ _id: p.scheduleId, latestProofId: id }, { $set: decision === "verify" ? { status: "verified", receivedProofId: id } : { status: "rejected" } });
  }
  if (decision === "verify") await syncPayables(p.bookingId); // execution evidenced → vendor payable becomes due
  await audit(req, { action: `proof.${decision}`, entity: "proof", entityId: id, before: { status: "uploaded" }, after: { status, workOrderId: p.workOrderId }, reason: reason ?? null });
  return { proofId: id, status, rejectReason: decision === "reject" ? reason ?? null : null };
}

type ProofDoc = Awaited<ReturnType<typeof uploadProof>>;
export function proofView(cfg: Config, p: ProofDoc, audience: "admin" | "vendor" | "client") {
  return {
    proofId: p._id, campaignId: p.campaignId, bookingId: p.bookingId, workOrderId: p.workOrderId, inventoryId: p.inventoryId, type: p.type,
    url: signFileUrl(cfg, p.fileId), mime: p.mime, uploadedAt: p.uploadedAt, capturedAt: p.capturedAt ?? null,
    gpsSource: p.gpsSource, gpsLabel: gpsLabel({ gpsSource: p.gpsSource as "device" | "none", distanceM: p.distanceM, accuracyM: p.accuracyM }),
    status: p.status, decidedAt: p.decidedAt ?? null,
    ...(audience !== "client" ? { lat: p.lat ?? null, lng: p.lng ?? null, distanceM: p.distanceM ?? null, rejectReason: p.rejectReason ?? null, note: p.note ?? null, vendorId: p.vendorId, scheduleId: p.scheduleId ?? null } : {}),
  };
}

/** Proof slots past their due date with nothing accepted yet (open or rejected). */
export async function overdueSlots(filter: Record<string, unknown> = {}) {
  const today = new Date(toDay(todayIST()));
  const activeWOs = (await WorkOrder.find({ status: { $nin: ["cancelled", "completed"] } }).select("_id").lean()).map((w) => w._id);
  return ProofSchedule.find({ ...filter, workOrderId: { $in: activeWOs }, dueDate: { $lt: today }, status: { $in: ["due", "rejected"] } }).sort({ dueDate: 1 }).lean();
}

/* ---------- Issues ---------- */
export async function raiseIssue(req: Request, campaignId: string, input: { workOrderId?: string | undefined; category: string; description: string }) {
  const c = await Campaign.findById(campaignId).lean();
  if (!c) throw notFound("Campaign not found");
  const u = req.user!;
  let wo: WO | null = null;
  if (input.workOrderId) {
    wo = await WorkOrder.findOne({ _id: input.workOrderId, bookingId: c.bookingId }).lean<WO>();
    if (!wo) throw notFound("Work order not found on this campaign");
  }
  // Who may raise: Admin; the vendor on this campaign (own work order); the booking's client.
  const allowed = u.role === "admin"
    || (u.role === "vendor" && (wo ? wo.vendorId === u.orgId : await WorkOrder.exists({ bookingId: c.bookingId, vendorId: u.orgId })))
    || (u.role === "client" && c.clientId === u.orgId);
  if (!allowed) throw notFound("Campaign not found");
  const id = await nextId("ISS");
  const issue = await Issue.create({ _id: id, campaignId, bookingId: c.bookingId, workOrderId: wo?._id ?? null, raisedBy: u.userId, raisedByRole: u.role, category: input.category as never, description: input.description });
  if (wo && canRaiseIssueFrom(wo.status as WorkOrderStatus)) {
    await WorkOrder.updateOne({ _id: wo._id, status: wo.status as never }, { $set: { status: "issue_raised", previousStatus: wo.status as never } });
    await ExecutionUpdate.create({ workOrderId: wo._id, fromStatus: wo.status as never, status: "issue_raised", note: `${id}: ${input.description.slice(0, 200)}`, byUser: u.userId });
  }
  await audit(req, { action: "issue.raise", entity: "issue", entityId: id, after: { campaignId, workOrderId: wo?._id ?? null, category: input.category } });
  return issue.toObject();
}

export async function updateIssue(req: Request, id: string, patch: { owner?: string | undefined; dueDate?: string | undefined; status?: "open" | "in_progress" | "resolved" | undefined; resolutionNote?: string | undefined }) {
  const before = await Issue.findById(id).lean();
  if (!before) throw notFound("Issue not found");
  if (before.status === "resolved") throw new AppError(409, "CONFLICT", "This issue is already resolved");
  const set: Record<string, unknown> = {};
  if (patch.owner !== undefined) set.owner = patch.owner;
  if (patch.dueDate) set.dueDate = new Date(toDay(patch.dueDate));
  if (patch.status) set.status = patch.status;
  if (patch.resolutionNote !== undefined) set.resolutionNote = patch.resolutionNote;
  if (patch.status === "resolved") { set.resolvedAt = new Date(); set.resolvedBy = req.user!.userId; }
  const after = await Issue.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean();
  // Resolving the last open issue on a work order returns it to where it was.
  if (patch.status === "resolved" && before.workOrderId && !(await Issue.exists({ workOrderId: before.workOrderId, status: { $ne: "resolved" } }))) {
    const w = await WorkOrder.findOne({ _id: before.workOrderId, status: "issue_raised" }).lean<WO>();
    if (w?.previousStatus) {
      await WorkOrder.updateOne({ _id: w._id, status: "issue_raised" }, { $set: { status: w.previousStatus as never, previousStatus: null } });
      await ExecutionUpdate.create({ workOrderId: w._id, fromStatus: "issue_raised", status: w.previousStatus as never, note: `${id} resolved`, byUser: req.user!.userId });
    }
  }
  await audit(req, { action: "issue.update", entity: "issue", entityId: id, before: { status: before.status, owner: before.owner, dueDate: before.dueDate }, after: { status: after!.status, owner: after!.owner, dueDate: after!.dueDate }, reason: patch.resolutionNote ?? null });
  return after!;
}
