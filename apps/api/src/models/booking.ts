import mongoose, { Schema } from "mongoose";
import { BOOKING_STATUSES, PRICING_UNITS, QUOTE_STATUSES, WORK_ORDER_STATUSES } from "@oohrena/shared";

/** Module 3: lead → approved vendor assignment history. */
const assignmentSchema = new Schema(
  {
    leadId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true },
    assignedBy: { type: String, required: true },
    assignedAt: { type: Date, required: true, default: () => new Date() },
    status: { type: String, enum: ["active", "removed"], default: "active" },
    reason: { type: String, default: null },
  },
  { versionKey: false },
);
assignmentSchema.index({ leadId: 1, vendorId: 1, status: 1 });
export const LeadAssignment = mongoose.model("LeadAssignment", assignmentSchema, "lead_assignments");

const quoteItemSchema = new Schema(
  {
    inventoryId: { type: String, required: true },
    vendorId: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    city: { type: String, required: true },
    pricingUnit: { type: String, enum: PRICING_UNITS, required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    qty: { type: Number, required: true },
    rate: { type: Number, required: true },
    billableUnits: { type: Number, required: true },
    production: { type: Number, required: true },
    installation: { type: Number, required: true },
    media: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
    /** Private: vendor cost for margin and vendor payable. Never returned to clients. */
    vendorCost: { type: Number, required: true },
    description: { type: String, default: null },
  },
  { _id: false },
);

/** One document per version: _id = QT-2026-000001-V2, quoteNo = QT-2026-000001. Approved versions are immutable. */
const quoteSchema = new Schema(
  {
    _id: { type: String, required: true },
    quoteNo: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    leadId: { type: String, required: true, index: true },
    clientId: { type: String, default: null, index: true },
    status: { type: String, enum: QUOTE_STATUSES, default: "draft", index: true },
    validUntil: { type: Date, required: true },
    items: { type: [quoteItemSchema], default: [] },
    mediaTotal: Number, productionTotal: Number, installationTotal: Number, subtotal: Number,
    serviceFeePct: Number, serviceFee: Number, taxable: Number, cgst: Number, sgst: Number, gst: Number, total: Number,
    currency: { type: String, default: "INR" },
    terms: { type: String, default: null },
    holdIds: { type: [String], default: [] },
    createdBy: { type: String, required: true },
    releasedAt: { type: Date, default: null }, releasedBy: { type: String, default: null },
    decision: { type: String, enum: ["approve", "reject", "revise", null], default: null },
    decisionComment: { type: String, default: null },
    decidedAt: { type: Date, default: null }, decidedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
quoteSchema.index({ quoteNo: 1, version: 1 }, { unique: true });
export const Quote = mongoose.model("Quote", quoteSchema, "quotes");

/** Created only from an approved quote. */
const bookingSchema = new Schema(
  {
    _id: { type: String, required: true }, // BK-2026-000001
    quoteId: { type: String, required: true, unique: true },
    leadId: { type: String, required: true, index: true },
    clientId: { type: String, default: null, index: true },
    status: { type: String, enum: BOOKING_STATUSES, default: "confirmed", index: true },
    items: { type: [quoteItemSchema], default: [] },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    subtotal: Number, serviceFee: Number, gst: Number, total: Number,
    blockIds: { type: [String], default: [] },
    createdBy: { type: String, required: true },
    cancellation: {
      type: new Schema({ at: Date, by: String, reason: String, daysBefore: Number, feePct: Number, fee: Number, refundable: Number, rule: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);
export const Booking = mongoose.model("Booking", bookingSchema, "bookings");

const bookingHistorySchema = new Schema(
  {
    bookingId: { type: String, required: true, index: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    changedBy: { type: String, required: true },
    reason: { type: String, default: null },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);
export const BookingHistory = mongoose.model("BookingHistory", bookingHistorySchema, "booking_history");

const workOrderSchema = new Schema(
  {
    _id: { type: String, required: true }, // WO-2026-000001
    bookingId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    items: { type: [quoteItemSchema], default: [] },
    instructions: { type: String, required: true },
    creativeNote: { type: String, default: null },
    status: { type: String, enum: WORK_ORDER_STATUSES, default: "scheduled", index: true },
    previousStatus: { type: String, enum: [...WORK_ORDER_STATUSES, null], default: null },
    campaignId: { type: String, default: null, index: true },
    issuedAt: { type: Date, required: true, default: () => new Date() },
    issuedBy: { type: String, required: true },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
workOrderSchema.index({ bookingId: 1, vendorId: 1 }, { unique: true });
export const WorkOrder = mongoose.model("WorkOrder", workOrderSchema, "work_orders");

/** Admin overrides: reason is mandatory and the row is permanent (also mirrored to the audit log). */
const overrideSchema = new Schema(
  {
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, required: true, minlength: 5 },
    adminUserId: { type: String, required: true },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);
export const Override = mongoose.model("Override", overrideSchema, "overrides");
