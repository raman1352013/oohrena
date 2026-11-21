import type { NotificationChannel, NotificationEvent } from "@oohrena/shared";
import { nextId } from "../lib/ids.js";
import { Notification, NotificationTemplate } from "../models/notification.js";
import { User } from "../models/foundation.js";
import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import type { Config } from "../config.js";
import { logger } from "../lib/logger.js";

export interface NotificationProvider {
  send(channel: NotificationChannel, to: string, rendered: { subject: string; body: string }): Promise<{ providerRef: string }>;
}

/**
 * Default provider. Delivers nothing; in development it prints the message to the API log so links
 * (password reset, invites) can be followed locally. Never used in production for email (SMTP_URL is required there).
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  async send(channel: NotificationChannel, to: string, rendered: { subject: string; body: string }) {
    if (process.env.NODE_ENV === "development") {
      logger.info({ channel, to, subject: rendered.subject, body: rendered.body }, "[dev notification — not delivered]");
    }
    return { providerRef: `console_${channel}_${randomUUID()}` };
  }
}

/** Email over SMTP (works with SES, Postmark, Brevo, Zoho, Google Workspace…); other channels go to `fallback`. */
export class SmtpNotificationProvider implements NotificationProvider {
  private transport: Transporter;
  constructor(
    smtpUrl: string,
    private from: string,
    private fallback: NotificationProvider,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }
  async send(channel: NotificationChannel, to: string, rendered: { subject: string; body: string }) {
    if (channel !== "email") return this.fallback.send(channel, to, rendered);
    const info = await this.transport.sendMail({ from: this.from, to, subject: rendered.subject, text: rendered.body });
    return { providerRef: String(info.messageId ?? `smtp_${randomUUID()}`) };
  }
}

/**
 * SMS/WhatsApp has no provider wired yet (needs a DLT-registered sender, e.g. MSG91/Gupshup/Twilio).
 * Outside development, sending fails loudly so the notification row is marked "failed" rather than "sent".
 */
export class UnconfiguredMessagingProvider implements NotificationProvider {
  async send(channel: NotificationChannel, to: string, rendered: { subject: string; body: string }): Promise<{ providerRef: string }> {
    if (channel === "email" || process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      return new ConsoleNotificationProvider().send(channel, to, rendered);
    }
    throw new Error(`No ${channel} provider configured`);
  }
}

let provider: NotificationProvider = new ConsoleNotificationProvider();

export function setNotificationProvider(customProvider: NotificationProvider) {
  provider = customProvider;
}

/** Called once at API start-up. */
export function configureNotifications(cfg: Pick<Config, "SMTP_URL" | "EMAIL_FROM">) {
  const messaging = new UnconfiguredMessagingProvider();
  provider = cfg.SMTP_URL ? new SmtpNotificationProvider(cfg.SMTP_URL, cfg.EMAIL_FROM, messaging) : messaging;
}

/** True when an SMS provider can deliver OTPs (none is integrated yet; development logs them instead). */
export function smsDeliveryAvailable() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

const DEFAULT_TEMPLATES: Array<{
  templateId: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  subject: string;
  body: string;
}> = [
    {
      templateId: "TPL-LEAD-CREATED-EMAIL",
      event: "lead.created",
      channel: "email",
      subject: "New Inquiry {{leadId}} Received — OOHRENA",
      body: "Inquiry {{leadId}} has been created for {{requirement}}. Our team is reviewing availability.",
    },
    {
      templateId: "TPL-QUOTE-RELEASED-EMAIL",
      event: "quote.released",
      channel: "email",
      subject: "Quotation {{quoteId}} is ready for your review",
      body: "Your quotation {{quoteId}} for lead {{leadId}} is released. Total: Rs. {{total}}. Valid until {{validUntil}}.",
    },
    {
      templateId: "TPL-QUOTE-DECISION-EMAIL",
      event: "quote.decision",
      channel: "email",
      subject: "Client Decision on Quotation {{quoteId}}: {{decision}}",
      body: "Client has {{decision}} quotation {{quoteId}}. Note: {{comment}}.",
    },
    {
      templateId: "TPL-BOOKING-CREATED-EMAIL",
      event: "booking.created",
      channel: "email",
      subject: "Booking Confirmed: {{bookingId}} — OOHRENA",
      body: "Booking {{bookingId}} is confirmed. Campaign period: {{start}} to {{end}}.",
    },
    {
      templateId: "TPL-WORKORDER-ISSUED-EMAIL",
      event: "workorder.issued",
      channel: "email",
      subject: "New Work Order Issued: {{workOrderId}}",
      body: "Work order {{workOrderId}} has been issued for booking {{bookingId}}. Instructions: {{instructions}}.",
    },
    {
      templateId: "TPL-HOLD-REQUESTED-EMAIL",
      event: "hold.requested",
      channel: "email",
      subject: "Action Required: Hold request for {{inventoryId}}",
      body: "A hold has been requested on listing {{inventoryId}} for {{from}} to {{to}}. Please confirm or decline.",
    },
    {
      templateId: "TPL-PROOF-REJECTED-EMAIL",
      event: "proof.rejected",
      channel: "email",
      subject: "Proof Rejected for Work Order {{workOrderId}}",
      body: "Proof {{proofId}} was rejected. Reason: {{reason}}. Please upload revised proof promptly.",
    },
    {
      templateId: "TPL-PROOF-VERIFIED-EMAIL",
      event: "proof.verified",
      channel: "email",
      subject: "New Verified Proof for Booking {{bookingId}}",
      body: "Verified proof has been published for your campaign {{bookingId}} on media {{inventoryId}}.",
    },
    {
      templateId: "TPL-PAYMENT-VERIFIED-EMAIL",
      event: "payment.verified",
      channel: "email",
      subject: "Payment Verified: {{paymentId}}",
      body: "Payment {{paymentId}} for Rs. {{amount}} has been verified by OOHRENA Finance.",
    },
    {
      templateId: "TPL-ISSUE-RAISED-EMAIL",
      event: "issue.raised",
      channel: "email",
      subject: "Issue Raised: {{issueId}} on Campaign {{campaignId}}",
      body: "An issue ({{category}}) was raised: {{description}}.",
    },
    {
      templateId: "TPL-ISSUE-RESOLVED-EMAIL",
      event: "issue.resolved",
      channel: "email",
      subject: "Issue Resolved: {{issueId}}",
      body: "Issue {{issueId}} has been resolved. Note: {{resolution}}.",
    },
    {
      templateId: "TPL-VENDOR-KYC-EMAIL",
      event: "vendor.kyc.decision",
      channel: "email",
      subject: "KYC Decision: Your profile is {{status}}",
      body: "Your KYC status is now {{status}}. Reason/note: {{reason}}.",
    },
    {
      templateId: "TPL-INVENTORY-DECISION-EMAIL",
      event: "inventory.decision",
      channel: "email",
      subject: "Listing Decision: {{inventoryId}} is {{status}}",
      body: "Your listing {{inventoryId}} is now {{status}}. Note: {{reason}}.",
    },
    {
      templateId: "TPL-PROOF-OVERDUE-EMAIL",
      event: "proof.overdue",
      channel: "email",
      subject: "Urgent: Overdue Proof for Work Order {{workOrderId}}",
      body: "Proof slot {{scheduleId}} on listing {{inventoryId}} was due on {{dueDate}} and remains overdue.",
    },
    {
      templateId: "TPL-PASSWORD-RESET-EMAIL",
      event: "user.password_reset",
      channel: "email",
      subject: "Reset your OOHRENA password",
      body: "We received a request to reset your OOHRENA password.\n\nOpen this link within 1 hour to choose a new password:\n{{resetLink}}\n\nIf you did not ask for this, ignore this email — your password stays the same.",
    },
    {
      templateId: "TPL-USER-INVITED-EMAIL",
      event: "user.invited",
      channel: "email",
      subject: "You have been invited to OOHRENA ({{role}})",
      body: "Hello {{fullName}},\n\nAn OOHRENA administrator created a {{role}} account for you. Set your password within 7 days using this link:\n{{inviteLink}}\n\nIf you were not expecting this, contact your administrator.",
    },
    {
      templateId: "TPL-VERIFY-EMAIL",
      event: "auth.verify_email",
      channel: "email",
      subject: "Confirm your email address — OOHRENA",
      body: "Confirm your email address by opening this link within 24 hours:\n{{link}}",
    },
    {
      templateId: "TPL-MOBILE-OTP-SMS",
      event: "auth.mobile_otp",
      channel: "sms",
      subject: "OOHRENA verification code",
      body: "{{otp}} is your OOHRENA verification code. It expires in 10 minutes. Do not share it with anyone.",
    },
  ];

export async function ensureDefaultTemplates() {
  for (const t of DEFAULT_TEMPLATES) {
    await NotificationTemplate.updateOne(
      { templateId: t.templateId },
      { $setOnInsert: { _id: t.templateId, ...t, approvedBy: "SYSTEM", active: true } },
      { upsert: true },
    );
  }
}

/** Sanitize context: never include bank, KYC or password details */
function sanitizeContext(ctx: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  const forbidden = ["password", "pan", "accountNo", "accountNoEnc", "bank", "token", "secret", "kycDocs"];
  for (const [k, v] of Object.entries(ctx)) {
    if (forbidden.some((f) => k.toLowerCase().includes(f.toLowerCase()))) continue;
    safe[k] = v;
  }
  return safe;
}

function renderTemplate(text: string, ctx: Record<string, unknown>): string {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    return ctx[key] !== undefined && ctx[key] !== null ? String(ctx[key]) : "";
  });
}

export type Recipient = {
  userId: string;
  email?: string | null;
  mobile?: string | null;
};

/**
 * Triggers notification sending for an event.
 * Safe: logs to notifications collection, calls the provider, never reveals sensitive fields.
 */
export async function notify(
  event: NotificationEvent,
  recipients: Recipient[],
  rawContext: Record<string, unknown>,
) {
  await ensureDefaultTemplates();
  const templates = await NotificationTemplate.find({ event, active: true }).lean();
  if (!templates.length) return [];
  const safeCtx = sanitizeContext(rawContext);
  const createdNotifications = [];

  for (const r of recipients) {
    for (const t of templates) {
      const destination = t.channel === "email" ? r.email : r.mobile;
      if (!destination) continue;

      const subject = renderTemplate(t.subject, safeCtx);
      const body = renderTemplate(t.body, safeCtx);
      const notificationId = await nextId("NTF");

      let status: "queued" | "sent" | "failed" = "queued";
      let providerRef: string | null = null;
      let error: string | null = null;

      try {
        const res = await provider.send(t.channel, destination, { subject, body });
        status = "sent";
        providerRef = res.providerRef;
      } catch (err: unknown) {
        status = "failed";
        error = err instanceof Error ? err.message : String(err);
      }

      const doc = await Notification.create({
        _id: notificationId,
        notificationId,
        userId: r.userId,
        channel: t.channel,
        template: t.templateId,
        event,
        recipient: destination,
        status,
        sentAt: status === "sent" ? new Date() : null,
        providerRef,
        error,
      });

      createdNotifications.push(doc.toObject());
    }
  }

  return createdNotifications;
}

/** Convenience helper to resolve User ids to Recipient objects */
export async function recipientsForUsers(userIds: string[]): Promise<Recipient[]> {
  const users = await User.find({ _id: { $in: userIds } }).select("_id email mobile").lean();
  return users.map((u) => ({ userId: u._id, email: u.email, mobile: u.mobile }));
}

/** Check overdue proofs and send reminder notifications to vendor and admin */
export async function checkOverdueProofsAndNotify() {
  const { overdueSlots } = await import("./execution.js");
  const overdue = await overdueSlots();
  if (!overdue.length) return 0;

  const admins = await User.find({ role: "admin" }).select("_id email mobile").lean();
  let count = 0;

  for (const s of overdue) {
    const vUser = await User.findOne({ orgId: s.vendorId }).select("_id email mobile").lean();
    const recipients: Recipient[] = [];
    if (vUser) recipients.push({ userId: vUser._id, email: vUser.email, mobile: vUser.mobile });
    recipients.push(...admins.map((a) => ({ userId: a._id, email: a.email, mobile: a.mobile })));

    await notify("proof.overdue", recipients, {
      scheduleId: String(s._id),
      workOrderId: s.workOrderId,
      inventoryId: s.inventoryId,
      dueDate: s.dueDate.toISOString().slice(0, 10),
    });
    count++;
  }

  return count;
}
