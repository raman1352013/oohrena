import mongoose, { Schema } from "mongoose";
import { CATEGORY_IDS, LEAD_SOURCES, LEAD_STATUSES } from "@oohrena/shared";

/** Module 1/3: every inquiry, from any source, gets one never-reused Lead ID. */
const leadSchema = new Schema(
  {
    _id: { type: String, required: true }, // LD-2026-000001
    source: { type: String, enum: LEAD_SOURCES, required: true },
    clientId: { type: String, default: null, index: true },
    partnerId: { type: String, default: null, index: true },
    createdBy: { type: String, required: true },
    inventoryIds: { type: [String], default: [] },
    city: { type: String, default: null },
    category: { type: String, enum: [...CATEGORY_IDS, null], default: null },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    qty: { type: Number, default: 1 },
    budget: { type: Number, default: null },
    requirement: { type: String, required: true },
    status: { type: String, enum: LEAD_STATUSES, default: "new", index: true },
    contact: { name: String, email: String, mobile: String, company: String },
  },
  { timestamps: true, versionKey: false },
);
leadSchema.index({ createdAt: -1 });
export const Lead = mongoose.model("Lead", leadSchema, "leads");
