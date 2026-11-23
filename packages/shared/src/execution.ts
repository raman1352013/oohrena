import { z } from "zod";
import { dayMs, fromDay, isoDate, toDay } from "./availability";
import type { WorkOrderStatus } from "./quote";

/**
 * Module 7 — execution & proof of display.
 * Work order: Scheduled → Installed/Live → Inspection Due → Completed; any active state → Issue Raised → back to the previous state.
 */
export const WO_FLOW: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  scheduled: ["installed"],
  installed: ["inspection_due"],
  inspection_due: ["completed"],
  completed: [],
  issue_raised: [], // leaves only by resolving the issue (returns to the stored previous state)
  cancelled: [],
};
export const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  scheduled: "Scheduled", installed: "Installed / Live", inspection_due: "Inspection due", completed: "Completed", issue_raised: "Issue raised", cancelled: "Cancelled",
};
export const canRaiseIssueFrom = (s: WorkOrderStatus) => s === "scheduled" || s === "installed" || s === "inspection_due";

export const PROOF_TYPES = ["before", "periodic", "after"] as const;
export type ProofType = (typeof PROOF_TYPES)[number];
export const PROOF_TYPE_LABEL: Record<ProofType, string> = { before: "Installation (before)", periodic: "Periodic check", after: "End of campaign (after)" };
export const PROOF_PERIOD_DAYS = 7;

/** Proof due dates for one site: installation on the start date, weekly checks, and end-of-campaign on the last day. */
export function proofScheduleFor(from: string, to: string, periodDays = PROOF_PERIOD_DAYS) {
  const out: { type: ProofType; dueDate: string }[] = [{ type: "before", dueDate: from }];
  for (let t = toDay(from) + periodDays * dayMs; t < toDay(to); t += periodDays * dayMs) out.push({ type: "periodic", dueDate: fromDay(t) });
  if (to !== from) out.push({ type: "after", dueDate: to });
  return out;
}

export const PROOF_STATUSES = ["uploaded", "verified", "rejected"] as const;
export type ProofStatus = (typeof PROOF_STATUSES)[number];
export const PROOF_MIME = ["image/jpeg", "image/png", "image/webp", "video/mp4"] as const;
export const MAX_PROOF_BYTES = 25 * 1024 * 1024;
/** Module 7: artwork attached to a work order by Admin; the assigned vendor downloads it. */
export const CREATIVE_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "video/mp4"] as const;
export const MAX_CREATIVE_BYTES = 25 * 1024 * 1024;

/** What the screen may say about location — never "GPS verified" unless it really was. */
export function gpsLabel(p: { gpsSource: "device" | "none"; distanceM?: number | null; accuracyM?: number | null }) {
  if (p.gpsSource !== "device") return "Location not captured";
  const acc = p.accuracyM ? ` (±${Math.round(p.accuracyM)} m)` : "";
  return p.distanceM === null || p.distanceM === undefined ? `Location captured by device${acc}` : `Location captured by device${acc} · ${p.distanceM} m from site`;
}

export const workOrderStatusInput = z.object({ status: z.enum(["installed", "inspection_due", "completed"]), note: z.string().trim().max(1000).optional() });
export const proofMetaInput = z.object({
  inventoryId: z.string().trim().min(1),
  scheduleId: z.string().trim().optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracyM: z.coerce.number().min(0).max(100000).optional(),
  note: z.string().trim().max(500).optional(),
}).refine((v) => (v.lat === undefined) === (v.lng === undefined), { path: ["lng"], message: "Send both latitude and longitude, or neither" });
export const proofDecisionInput = z.object({ decision: z.enum(["verify", "reject"]), reason: z.string().trim().max(1000).optional() })
  .refine((v) => v.decision === "verify" || (v.reason && v.reason.length >= 3), { path: ["reason"], message: "A reason is required to reject proof" });

/* ---------- Issues (Module 3 tracker, raised from Module 7) ---------- */
export const ISSUE_CATEGORIES = ["installation", "damage", "visibility", "creative", "access_permission", "payment", "other"] as const;
export const ISSUE_STATUSES = ["open", "in_progress", "resolved"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const issueCreateInput = z.object({
  workOrderId: z.string().trim().optional(),
  category: z.enum(ISSUE_CATEGORIES),
  description: z.string().trim().min(10, "Describe the issue (at least 10 characters)").max(3000),
});
export const issueUpdateInput = z.object({
  owner: z.string().trim().max(120).optional(),
  dueDate: isoDate.optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  resolutionNote: z.string().trim().max(3000).optional(),
}).refine((v) => v.status !== "resolved" || (v.resolutionNote && v.resolutionNote.length >= 5), { path: ["resolutionNote"], message: "Add resolution notes before resolving" });
