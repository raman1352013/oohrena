import mongoose, { Schema } from "mongoose";
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, NOTIFICATION_STATUSES } from "@oohrena/shared";

const templateSchema = new Schema(
  {
    _id: { type: String, required: true }, // e.g. TPL-0001
    templateId: { type: String, required: true, unique: true },
    event: { type: String, enum: NOTIFICATION_EVENTS, required: true, index: true },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    approvedBy: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export const NotificationTemplate = mongoose.model("NotificationTemplate", templateSchema, "notification_templates");

const notificationSchema = new Schema(
  {
    _id: { type: String, required: true }, // NTF-2026-000001
    notificationId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    template: { type: String, required: true },
    event: { type: String, enum: NOTIFICATION_EVENTS, default: null },
    recipient: { type: String, default: null },
    status: { type: String, enum: NOTIFICATION_STATUSES, default: "queued", index: true },
    sentAt: { type: Date, default: null },
    providerRef: { type: String, default: null },
    error: { type: String, default: null },
    createdAt: { type: Date, default: () => new Date(), immutable: true },
  },
  { versionKey: false },
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ event: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema, "notifications");
