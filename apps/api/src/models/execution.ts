import mongoose, { Schema } from "mongoose";
import { ISSUE_CATEGORIES, ISSUE_STATUSES, PROOF_STATUSES, PROOF_TYPES, WORK_ORDER_STATUSES } from "@oohrena/shared";

/** One campaign per booking, created when execution starts (first work order). */
const campaignSchema = new Schema(
  {
    _id: { type: String, required: true }, // CMP-2026-000001
    bookingId: { type: String, required: true, unique: true },
    clientId: { type: String, default: null, index: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: { type: String, enum: ["scheduled", "live", "completed", "cancelled"], default: "scheduled" },
  },
  { timestamps: true, versionKey: false },
);
export const Campaign = mongoose.model("Campaign", campaignSchema, "campaigns");

/** Expected proof per site: before / periodic / after, each with a due date. */
const scheduleSchema = new Schema(
  {
    campaignId: { type: String, required: true, index: true },
    bookingId: { type: String, required: true },
    workOrderId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    inventoryId: { type: String, required: true },
    type: { type: String, enum: PROOF_TYPES, required: true },
    dueDate: { type: Date, required: true, index: true },
    /** Latest proof uploaded for this slot, and the one that was verified (if any). */
    latestProofId: { type: String, default: null },
    receivedProofId: { type: String, default: null },
    status: { type: String, enum: ["due", "uploaded", "verified", "rejected", "cancelled"], default: "due", index: true },
  },
  { versionKey: false },
);
export const ProofSchedule = mongoose.model("ProofSchedule", scheduleSchema, "proof_schedule");

const proofSchema = new Schema(
  {
    _id: { type: String, required: true }, // PRF-uuid-like (server generated)
    campaignId: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, index: true },
    workOrderId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    inventoryId: { type: String, required: true },
    scheduleId: { type: String, default: null },
    type: { type: String, enum: PROOF_TYPES, required: true },
    fileId: { type: String, required: true },
    mime: { type: String, required: true },
    /** Server's own upload time — authoritative. */
    uploadedAt: { type: Date, required: true, default: () => new Date(), immutable: true },
    /** Device-reported capture time — secondary evidence only. */
    capturedAt: { type: Date, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    accuracyM: { type: Number, default: null },
    gpsSource: { type: String, enum: ["device", "none"], required: true },
    distanceM: { type: Number, default: null },
    uploadedBy: { type: String, required: true },
    note: { type: String, default: null },
    status: { type: String, enum: PROOF_STATUSES, default: "uploaded", index: true },
    verifiedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null },
    replacesProofId: { type: String, default: null },
  },
  { versionKey: false },
);
export const Proof = mongoose.model("Proof", proofSchema, "proofs");

/** Every work-order status change, who made it and why. */
const updateSchema = new Schema(
  {
    workOrderId: { type: String, required: true, index: true },
    fromStatus: { type: String, enum: WORK_ORDER_STATUSES, required: true },
    status: { type: String, enum: WORK_ORDER_STATUSES, required: true },
    note: { type: String, default: null },
    byUser: { type: String, required: true },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);
export const ExecutionUpdate = mongoose.model("ExecutionUpdate", updateSchema, "execution_updates");

/** Module 3 complaint / issue tracker. */
const issueSchema = new Schema(
  {
    _id: { type: String, required: true }, // ISS-2026-000001
    campaignId: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, index: true },
    workOrderId: { type: String, default: null },
    raisedBy: { type: String, required: true },
    raisedByRole: { type: String, required: true },
    category: { type: String, enum: ISSUE_CATEGORIES, required: true },
    description: { type: String, required: true },
    owner: { type: String, default: null },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ISSUE_STATUSES, default: "open", index: true },
    resolutionNote: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
export const Issue = mongoose.model("Issue", issueSchema, "issues");
