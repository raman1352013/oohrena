import mongoose, { Schema } from "mongoose";

/**
 * One row per hold / booking / block over an inclusive day range.
 * A row "uses" capacity while active: status in ACTIVE and (no expiry or expiry in the future).
 * Day bounds are stored as UTC midnights of calendar dates (YYYY-MM-DD).
 */
export const ACTIVE_BLOCK_STATUSES = ["held", "pending_vendor", "booked", "blocked"] as const;
const blockSchema = new Schema(
  {
    inventoryId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    kind: { type: String, enum: ["hold", "booking", "block"], required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    qty: { type: Number, required: true, min: 1 },
    /** held = confirmed hold; pending_vendor = waiting for vendor; booked; blocked; released/expired/declined = no longer uses capacity. */
    status: { type: String, enum: ["held", "pending_vendor", "booked", "blocked", "released", "expired", "declined"], required: true, index: true },
    expiresAt: { type: Date, default: null, index: true },
    leadId: { type: String, default: null },
    bookingId: { type: String, default: null },
    reason: { type: String, default: null },
    source: { type: String, enum: ["admin", "vendor", "system"], required: true },
    createdBy: { type: String, required: true },
    endedAt: { type: Date, default: null },
    endedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
blockSchema.index({ inventoryId: 1, status: 1, from: 1, to: 1 });
export const AvailabilityBlock = mongoose.model("AvailabilityBlock", blockSchema, "availability");

/** Vendor confirmation for holds on listings whose calendar the vendor doesn't keep live. */
const requestSchema = new Schema(
  {
    holdId: { type: String, required: true, unique: true },
    inventoryId: { type: String, required: true },
    vendorId: { type: String, required: true, index: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    qty: { type: Number, required: true },
    requestedAt: { type: Date, required: true, default: () => new Date() },
    respondBy: { type: Date, required: true },
    status: { type: String, enum: ["pending", "confirmed", "declined", "expired", "cancelled"], default: "pending", index: true },
    respondedAt: { type: Date, default: null },
    respondedBy: { type: String, default: null },
    channel: { type: String, default: null },
    note: { type: String, default: null },
  },
  { versionKey: false },
);
export const AvailabilityRequest = mongoose.model("AvailabilityRequest", requestSchema, "availability_requests");

const shortlistSchema = new Schema(
  {
    clientId: { type: String, required: true, unique: true },
    items: { type: [{ inventoryId: { type: String, required: true }, addedAt: { type: Date, required: true } }], default: [] },
  },
  { timestamps: true, versionKey: false },
);
export const Shortlist = mongoose.model("Shortlist", shortlistSchema, "shortlists");
