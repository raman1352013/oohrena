import type { NotificationChannel, NotificationEvent } from "@oohrena/shared";
import { nextId } from "../lib/ids.js";
import { Notification, NotificationTemplate } from "../models/notification.js";
import { User } from "../models/foundation.js";

export interface NotificationProvider {
  send(channel: NotificationChannel, to: string, rendered: { subject: string; body: string }): Promise<{ providerRef: string }>;
}

export class ConsoleNotificationProvider implements NotificationProvider {
  async send(channel: NotificationChannel, to: string, rendered: { subject: string; body: string }) {
    const providerRef = `mock_${channel}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    // Console log for local dev / tests. Never log sensitive fields.
    return { providerRef };
  }
}

let provider: NotificationProvider = new ConsoleNotificationProvider();

export function setNotificationProvider(customProvider: NotificationProvider) {
  provider = customProvider;
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
      if (!destination && !r.userId) continue;

      const subject = renderTemplate(t.subject, safeCtx);
      const body = renderTemplate(t.body, safeCtx);
      const notificationId = await nextId("NTF");

      let status: "queued" | "sent" | "failed" = "queued";
      let providerRef: string | null = null;
      let error: string | null = null;

      try {
        const res = await provider.send(t.channel, destination || r.userId, { subject, body });
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
        recipient: destination ?? r.userId,
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
