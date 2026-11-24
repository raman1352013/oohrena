import { Schema, model } from "mongoose";

const systemSettingSchema = new Schema(
  {
    _id: { type: String, required: true }, // Setting key is the _id
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    version: { type: Number, default: 1 },
    effectiveFrom: { type: Date, default: Date.now },
    changedBy: { type: String, required: true },
    pendingValue: { type: Schema.Types.Mixed, default: null },
    pendingChangedBy: { type: String, default: null },
    pendingReason: { type: String, default: null },
    pendingRequestedAt: { type: Date, default: null },
  },
  { collection: "system_settings", timestamps: true },
);

export const SystemSetting = model("SystemSetting", systemSettingSchema);

const systemSettingHistorySchema = new Schema(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    changedBy: { type: String, required: true },
    reason: { type: String, required: true },
  },
  { collection: "system_setting_history", timestamps: { createdAt: true, updatedAt: false } },
);

export const SystemSettingHistory = model("SystemSettingHistory", systemSettingHistorySchema);
