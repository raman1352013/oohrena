import mongoose, { Schema } from "mongoose";
import { REPORT_FORMATS } from "@oohrena/shared";

/**
 * Module 9: Report exports log.
 * Appended whenever any report/audit/reconciliation export is generated.
 */
const reportExportSchema = new Schema(
  {
    _id: { type: String, required: true }, // EXP-2026-000001
    report: { type: String, required: true, index: true },
    params: { type: Schema.Types.Mixed, default: () => ({}) },
    requestedBy: { type: String, required: true, index: true },
    role: { type: String, required: true },
    format: { type: String, enum: REPORT_FORMATS, required: true },
    at: { type: Date, required: true, default: () => new Date(), immutable: true },
  },
  { versionKey: false },
);

reportExportSchema.index({ at: -1 });

export const ReportExport = mongoose.model("ReportExport", reportExportSchema, "report_exports");
