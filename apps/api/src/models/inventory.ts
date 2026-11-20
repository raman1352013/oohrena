import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { CATEGORY_IDS, DATA_TYPES, LISTING_STATUSES, PRICING_UNITS } from "@oohrena/shared";

const photoSchema = new Schema(
  {
    fileId: { type: String, required: true },
    sha256: { type: String, required: true },
    uploadedBy: { type: String, required: true },
    uploadedAt: { type: Date, required: true },
    /** Device capture time if the client sent one — secondary to uploadedAt. */
    capturedAt: { type: Date, default: null },
  },
  { _id: false },
);

const inventorySchema = new Schema(
  {
    _id: { type: String, required: true }, // INV-HRD-000001
    vendorId: { type: String, required: true, index: true },
    category: { type: String, enum: CATEGORY_IDS, required: true, immutable: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    city: { type: String, required: true },
    locality: { type: String, required: true },
    landmark: { type: String, default: null },
    address: { type: String, required: true },
    pin: { type: String, required: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    attributes: { type: Schema.Types.Mixed, default: {} },
    /** Vendor's rate — private to the vendor, Admin and Finance. */
    rate: { type: Number, required: true },
    pricingUnit: { type: String, enum: PRICING_UNITS, required: true },
    quantity: { type: Number, required: true, default: 1 },
    /** Client-facing indicative price, set by Admin at approval. */
    indicativePrice: { type: Number, default: null },
    photos: { type: [photoSchema], default: [] },
    status: { type: String, enum: LISTING_STATUSES, default: "draft", index: true },
    statusReason: { type: String, default: null },
    /** DEMO records are badged and never bookable; VERIFIED is set by Admin only. */
    dataType: { type: String, enum: [...DATA_TYPES, null], default: null },
    version: { type: Number, default: 1 },
    /** on_request: holds need vendor confirmation ("Subject to vendor confirmation"); managed: vendor keeps the calendar live. */
    availabilityMode: { type: String, enum: ["on_request", "managed"], default: "on_request" },
    /** Bumped inside every hold/booking transaction so concurrent writers conflict (double-booking guard). */
    availabilityRev: { type: Number, default: 0 },
    availabilityUpdatedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);
inventorySchema.index({ location: "2dsphere" });
inventorySchema.index({ status: 1, dataType: 1, city: 1, category: 1 });
export const Inventory = mongoose.model("Inventory", inventorySchema, "inventory");
export type InventoryDoc = InferSchemaType<typeof inventorySchema> & { _id: string; createdAt: Date; updatedAt: Date };

/** One row per changed field (Module 4: versioned edits; Module 9: change history). */
const historySchema = new Schema(
  {
    inventoryId: { type: String, required: true, index: true },
    field: { type: String, required: true },
    old: { type: Schema.Types.Mixed, default: null },
    new: { type: Schema.Types.Mixed, default: null },
    changedBy: { type: String, required: true },
    changedAt: { type: Date, required: true, default: () => new Date() },
    version: { type: Number, required: true },
  },
  { versionKey: false },
);
export const InventoryHistory = mongoose.model("InventoryHistory", historySchema, "inventory_history");

/** Module 3: possible duplicate listings for Admin to confirm or dismiss. */
const duplicateSchema = new Schema(
  {
    entityType: { type: String, enum: ["inventory", "lead"], required: true },
    entityA: { type: String, required: true },
    entityB: { type: String, required: true },
    score: { type: Number, required: true },
    reasons: { type: [String], default: [] },
    resolution: { type: String, enum: ["open", "confirmed", "dismissed"], default: "open", index: true },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    note: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
duplicateSchema.index({ entityType: 1, entityA: 1, entityB: 1 }, { unique: true });
export const DuplicateFlag = mongoose.model("DuplicateFlag", duplicateSchema, "duplicate_flags");
