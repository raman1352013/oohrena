import { z } from "zod";
import { GST_PCT } from "./quote";
import { isoDate } from "./availability";

/**
 * Module 8 — finance. Rule: a payment is never "received" without evidence (proof file + reference)
 * and verification by a different user (maker-checker).
 */
export const PAYMENT_DIRECTIONS = ["client_receipt", "vendor_payout", "refund"] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];
export const PAYMENT_DIRECTION_LABEL: Record<PaymentDirection, string> = { client_receipt: "Client payment", vendor_payout: "Vendor payout", refund: "Refund to client" };
/** Unverified → Verified (Received/Paid); a checker may also reject a wrong entry. Nothing is ever hard-deleted. */
export const PAYMENT_STATUSES = ["unverified", "verified", "rejected"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_MODES = ["neft", "rtgs", "imps", "upi", "cheque", "cash", "card", "other"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const DEFAULT_ADVANCE_PCT = 50;
export const INVOICE_DUE_DAYS = 7;

export const INVOICE_STATUSES = ["issued", "partially_paid", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const PAYABLE_STATUSES = ["pending", "due", "partially_paid", "paid", "cancelled"] as const;
export type PayableStatus = (typeof PAYABLE_STATUSES)[number];

/** Vendor payable for one booking: vendor cost, plus GST only if the vendor is GST-registered. */
export function payableFor(vendorCost: number, vendorHasGstin: boolean) {
  const gst = vendorHasGstin ? Math.round((vendorCost * GST_PCT) / 100) : 0;
  return { base: Math.round(vendorCost), gst, total: Math.round(vendorCost) + gst };
}

export type Reconciliation = {
  bookingId: string; status: string; currency: "INR";
  client: { billed: number; billedGst: number; received: number; refunded: number; balanceDue: number; advanceDue: number; advanceReceived: boolean };
  vendors: { vendorId: string; payable: number; payableGst: number; paid: number; balance: number; status: PayableStatus }[];
  platform: { commission: number; serviceFee: number; outputGst: number; inputGst: number; netGst: number; grossMargin: number };
  cancellation: { feePct: number; fee: number; refundable: number; rule: string } | null;
  checks: { name: string; ok: boolean; detail: string }[];
  generatedAt: string;
};

/* ---------- Inputs (multipart for anything carrying a proof file) ---------- */
const money = z.coerce.number({ invalid_type_error: "Enter an amount" }).positive("Amount must be more than 0").max(1e10);
export const paymentMetaInput = z.object({
  bookingId: z.string().trim().min(1),
  amount: money,
  mode: z.enum(PAYMENT_MODES, { errorMap: () => ({ message: "Choose how it was paid" }) }),
  reference: z.string().trim().min(4, "Enter the UTR / cheque / transaction reference").max(80),
  paidOn: isoDate,
  note: z.string().trim().max(1000).optional(),
});
export const vendorPayoutMetaInput = paymentMetaInput.extend({ vendorId: z.string().trim().min(1) });
export const refundMetaInput = paymentMetaInput.extend({ reason: z.string().trim().min(3, "Give a reason").max(1000) });
export const paymentEditInput = z.object({
  amount: money.optional(),
  mode: z.enum(PAYMENT_MODES).optional(),
  reference: z.string().trim().min(4).max(80).optional(),
  paidOn: isoDate.optional(),
  note: z.string().trim().max(1000).optional(),
  reason: z.string().trim().min(3, "Say why you're editing this payment").max(1000),
});
export const paymentDecisionInput = z.object({ decision: z.enum(["verify", "reject"]), reason: z.string().trim().max(1000).optional() })
  .refine((v) => v.decision === "verify" || (v.reason && v.reason.length >= 3), { path: ["reason"], message: "Give a reason to reject" });
export const invoiceCreateInput = z.object({ bookingId: z.string().trim().min(1), dueDate: isoDate.optional(), advancePct: z.coerce.number().min(0).max(100).default(DEFAULT_ADVANCE_PCT) });
