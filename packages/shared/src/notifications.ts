import { z } from "zod";

export const NOTIFICATION_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ["queued", "sent", "failed"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_EVENTS = [
  "lead.created",
  "quote.released",
  "quote.decision",
  "booking.created",
  "workorder.issued",
  "hold.requested",
  "proof.rejected",
  "proof.verified",
  "payment.verified",
  "issue.raised",
  "issue.resolved",
  "vendor.kyc.decision",
  "vendor.onboarding.submitted",
  "inventory.decision",
  "proof.overdue",
  "user.invited",
  "user.password_reset",
  "auth.mobile_otp",
  "auth.verify_email",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const notificationTemplateInput = z.object({
  event: z.enum(NOTIFICATION_EVENTS),
  channel: z.enum(NOTIFICATION_CHANNELS),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(4000),
  active: z.boolean().default(true),
});

export const notificationTemplateUpdateInput = notificationTemplateInput.partial();

