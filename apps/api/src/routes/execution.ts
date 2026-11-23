import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ISSUE_STATUSES, MAX_PROOF_BYTES, PROOF_STATUSES, fromDay, issueCreateInput, issueUpdateInput, proofDecisionInput, proofMetaInput, workOrderStatusInput } from "@oohrena/shared";
import type { Config } from "../config.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { parseQuery, validateBody } from "../middleware/validate.js";
import { Booking, WorkOrder } from "../models/booking.js";
import { Campaign, ExecutionUpdate, Issue, Proof, ProofSchedule } from "../models/execution.js";
import { Client, Vendor } from "../models/foundation.js";
import { changeWorkOrderStatus, decideProof, loadWorkOrderFor, overdueSlots, proofView, raiseIssue, updateIssue, uploadProof } from "../services/execution.js";

const proofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PROOF_BYTES, files: 1, fields: 20 } });

export const slotView = (s: { _id: unknown; type: string; dueDate: Date; inventoryId: string; status: string; latestProofId?: string | null; receivedProofId?: string | null; workOrderId: string }) => ({
  scheduleId: String(s._id), workOrderId: s.workOrderId, inventoryId: s.inventoryId, type: s.type, dueDate: fromDay(s.dueDate.getTime()), status: s.status,
  latestProofId: s.latestProofId ?? null, receivedProofId: s.receivedProofId ?? null,
});
const issueView = (i: Record<string, unknown> & { _id: string; dueDate?: Date | null }) => ({ ...i, issueId: i._id, _id: undefined, dueDate: i.dueDate ? fromDay(i.dueDate.getTime()) : null });

/** Module 7: execution, proof of display, and the issue tracker. */
export function executionRoutes(cfg: Config) {
  const r = Router();

  /* ---------- Work order execution (assigned vendor or Admin) ---------- */
  r.post("/work-orders/:id/status", requirePermission("workorders.execute"), validateBody(workOrderStatusInput), async (req, res) => {
    const { status, note } = req.body as z.infer<typeof workOrderStatusInput>;
    res.json({ data: await changeWorkOrderStatus(req, String(req.params.id), status, note) });
  });

  r.get("/work-orders/:id/execution", requirePermission("workorders.execute"), async (req, res) => {
    const w = await loadWorkOrderFor(req, String(req.params.id));
    const audience = req.user!.role === "admin" ? "admin" : "vendor";
    const [schedule, proofs, updates, issues] = await Promise.all([
      ProofSchedule.find({ workOrderId: w._id }).sort({ dueDate: 1 }).lean(),
      Proof.find({ workOrderId: w._id }).sort({ uploadedAt: -1 }).lean(),
      ExecutionUpdate.find({ workOrderId: w._id }).sort({ at: -1 }).lean(),
      Issue.find({ workOrderId: w._id }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({
      data: {
        workOrderId: w._id, campaignId: w.campaignId ?? null, status: w.status, previousStatus: w.previousStatus ?? null,
        schedule: schedule.map(slotView), proofs: proofs.map((p) => proofView(cfg, p as never, audience)),
        updates: updates.map(({ _id, ...u }) => u), issues: issues.map((i) => issueView(i as never)),
      },
    });
  });

  /** multipart: file=<jpg/png/webp/mp4 ≤25 MB>, inventoryId, scheduleId?, capturedAt?, lat?, lng?, accuracyM?, note? */
  r.post("/work-orders/:id/proofs", requirePermission("workorders.execute"), proofUpload.single("file"), async (req, res) => {
    const meta = proofMetaInput.safeParse(req.body ?? {});
    if (!meta.success) throw badRequest("Please check the proof details", meta.error.flatten());
    const p = await uploadProof(cfg, req, String(req.params.id), req.file, meta.data);
    res.status(201).json({ data: proofView(cfg, p, req.user!.role === "admin" ? "admin" : "vendor") });
  });

  /* ---------- Admin verification ---------- */
  r.get("/admin/proofs", requirePermission("proofs.decide"), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(PROOF_STATUSES).default("uploaded"), bookingId: z.string().trim().optional() }), req);
    const filter: Record<string, unknown> = { status: q.status };
    if (q.bookingId) filter.bookingId = q.bookingId;
    const items = await Proof.find(filter).sort({ uploadedAt: 1 }).limit(200).lean();
    res.json({ data: items.map((p) => proofView(cfg, p as never, "admin")) });
  });

  r.post("/admin/proofs/:id/decision", requirePermission("proofs.decide"), validateBody(proofDecisionInput), async (req, res) => {
    const { decision, reason } = req.body as z.infer<typeof proofDecisionInput>;
    res.json({ data: await decideProof(req, String(req.params.id), decision, reason) });
  });

  r.get("/admin/proofs/overdue", requirePermission("proofs.decide"), async (_req, res) => {
    res.json({ data: (await overdueSlots()).map(slotView) });
  });

  /* ---------- Client gallery: verified proof only, own bookings only ---------- */
  r.get("/bookings/:id/proofs", requireAuth, async (req, res) => {
    const b = await Booking.findById(String(req.params.id)).select("_id clientId").lean();
    const u = req.user!;
    if (!b || !(u.role === "admin" || (u.role === "client" && b.clientId === u.orgId))) throw notFound("Booking not found");
    const filter: Record<string, unknown> = u.role === "admin" ? { bookingId: b._id } : { bookingId: b._id, status: "verified" };
    const items = await Proof.find(filter).sort({ uploadedAt: 1 }).lean();
    const campaign = await Campaign.findOne({ bookingId: b._id }).select("_id status").lean();
    res.json({ data: { bookingId: b._id, campaignId: campaign?._id ?? null, campaignStatus: campaign?.status ?? null, proofs: items.map((p) => proofView(cfg, p as never, u.role === "admin" ? "admin" : "client")) } });
  });

  /* ---------- Issues ---------- */
  r.post("/campaigns/:id/issues", requireAuth, validateBody(issueCreateInput), async (req, res) => {
    const i = await raiseIssue(req, String(req.params.id), req.body as z.infer<typeof issueCreateInput>);
    res.status(201).json({ data: issueView(i as never) });
  });

  r.get("/admin/issues", requirePermission("issues.manage"), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(ISSUE_STATUSES).optional() }), req);
    const items = await Issue.find(q.status ? { status: q.status } : { status: { $ne: "resolved" } }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ data: items.map((i) => issueView(i as never)) });
  });

  r.patch("/admin/issues/:id", requirePermission("issues.manage"), validateBody(issueUpdateInput), async (req, res) => {
    res.json({ data: issueView((await updateIssue(req, String(req.params.id), req.body as z.infer<typeof issueUpdateInput>)) as never) });
  });

  /**
   * Module 3 campaign monitoring board: every active campaign with its work orders, proof counts
   * (verified / waiting for review / overdue) and open issues. `status=all` includes finished ones.
   */
  r.get("/admin/campaigns", requirePermission("campaigns.monitor"), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(["active", "all"]).default("active") }), req);
    const campaigns = await Campaign.find(q.status === "active" ? { status: { $in: ["scheduled", "live"] } } : {})
      .sort({ start: 1 })
      .limit(300)
      .lean();
    const ids = campaigns.map((c) => c._id);
    const bookingIds = campaigns.map((c) => c.bookingId);
    const [bookings, wos, proofs, overdue, issues, clients] = await Promise.all([
      Booking.find({ _id: { $in: bookingIds } }).select("_id leadId").lean(),
      WorkOrder.find({ bookingId: { $in: bookingIds } }).select("_id bookingId vendorId status").lean(),
      Proof.aggregate<{ _id: { c: string; s: string }; n: number }>([
        { $match: { campaignId: { $in: ids } } },
        { $group: { _id: { c: "$campaignId", s: "$status" }, n: { $sum: 1 } } },
      ]),
      overdueSlots({ campaignId: { $in: ids } }),
      Issue.aggregate<{ _id: string; n: number }>([
        { $match: { campaignId: { $in: ids }, status: { $ne: "resolved" } } },
        { $group: { _id: "$campaignId", n: { $sum: 1 } } },
      ]),
      Client.find({ _id: { $in: campaigns.map((c) => c.clientId).filter(Boolean) } } as never)
        .select("_id companyName")
        .lean<{ _id: string; companyName: string }[]>(),
    ]);
    const vendors = await Vendor.find({ _id: { $in: [...new Set(wos.map((w) => w.vendorId))] } }).select("_id legalName").lean();
    const vendorName = new Map(vendors.map((v) => [v._id, v.legalName as string]));
    const clientName = new Map(clients.map((c) => [c._id, c.companyName]));
    const proofCount = (c: string, s: string) => proofs.find((p) => p._id.c === c && p._id.s === s)?.n ?? 0;
    res.json({
      data: campaigns.map((c) => ({
        campaignId: c._id,
        bookingId: c.bookingId,
        leadId: bookings.find((b) => b._id === c.bookingId)?.leadId ?? null,
        client: c.clientId ? (clientName.get(c.clientId) ?? c.clientId) : null,
        start: fromDay(c.start.getTime()),
        end: fromDay(c.end.getTime()),
        status: c.status,
        workOrders: wos
          .filter((w) => w.bookingId === c.bookingId)
          .map((w) => ({ workOrderId: w._id, vendor: vendorName.get(w.vendorId) ?? w.vendorId, status: w.status })),
        proofs: {
          verified: proofCount(c._id, "verified"),
          toReview: proofCount(c._id, "uploaded"),
          overdue: overdue.filter((s) => s.campaignId === c._id).length,
        },
        openIssues: issues.find((i) => i._id === c._id)?.n ?? 0,
      })),
    });
  });

  /** Client/vendor view of the campaigns they're part of (for raising issues). */
  r.get("/campaigns/by-booking/:bookingId", requireAuth, async (req, res) => {
    const c = await Campaign.findOne({ bookingId: String(req.params.bookingId) }).lean();
    const u = req.user!;
    const ok = c && (u.role === "admin" || (u.role === "client" && c.clientId === u.orgId) || (u.role === "vendor" && (await WorkOrder.exists({ bookingId: c.bookingId, vendorId: u.orgId }))));
    if (!ok) throw notFound("Campaign not found");
    res.json({ data: { campaignId: c._id, bookingId: c.bookingId, status: c.status, start: fromDay(c.start.getTime()), end: fromDay(c.end.getTime()) } });
  });

  return r;
}
