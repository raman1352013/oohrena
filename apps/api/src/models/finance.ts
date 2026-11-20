import mongoose, { Schema } from "mongoose";
import { INVOICE_STATUSES, PAYABLE_STATUSES, PAYMENT_DIRECTIONS, PAYMENT_MODES, PAYMENT_STATUSES } from "@oohrena/shared";

/** Tax invoice raised from a booking (one per booking). Amounts are copied from the booking, never typed in. */
const invoiceSchema = new Schema(
  {
    _id: { type: String, required: true }, // TXI-2026-000001
    bookingId: { type: String, required: true, unique: true },
    clientId: { type: String, default: null, index: true },
    billTo: { companyName: String, gstin: String, address: Schema.Types.Mixed },
    lines: { type: [{ description: String, inventoryId: String, amount: Number, _id: false }], default: [] },
    subtotal: { type: Number, required: true },
    serviceFee: { type: Number, required: true },
    cgst: { type: Number, required: true },
    sgst: { type: Number, required: true },
    gst: { type: Number, required: true },
    total: { type: Number, required: true },
    advancePct: { type: Number, required: true },
    advanceAmount: { type: Number, required: true },
    issuedAt: { type: Date, required: true, default: () => new Date() },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: "issued", index: true },
    issuedBy: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);
export const Invoice = mongoose.model("Invoice", invoiceSchema, "invoices");

/** Every money movement: client receipt, vendor payout or refund. Status changes only through maker-checker. */
const paymentSchema = new Schema(
  {
    _id: { type: String, required: true }, // PAY-2026-000001
    direction: { type: String, enum: PAYMENT_DIRECTIONS, required: true, index: true },
    bookingId: { type: String, required: true, index: true },
    invoiceId: { type: String, default: null },
    clientId: { type: String, default: null, index: true },
    vendorId: { type: String, default: null, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    reference: { type: String, required: true },
    paidOn: { type: Date, required: true },
    proofFileId: { type: String, required: true },
    note: { type: String, default: null },
    /** For refunds: the cancellation rule that set the refundable amount. */
    ruleApplied: { type: String, default: null },
    reason: { type: String, default: null },
    status: { type: String, enum: PAYMENT_STATUSES, default: "unverified", index: true },
    recordedBy: { type: String, required: true },
    recordedByRole: { type: String, required: true },
    verifiedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);
export const Payment = mongoose.model("Payment", paymentSchema, "payments");

/** One row per changed field on a payment (old/new value, who, when, why). */
const paymentHistorySchema = new Schema(
  {
    paymentId: { type: String, required: true, index: true },
    field: { type: String, required: true },
    old: { type: Schema.Types.Mixed, default: null },
    new: { type: Schema.Types.Mixed, default: null },
    changedBy: { type: String, required: true },
    reason: { type: String, default: null },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);
export const PaymentHistory = mongoose.model("PaymentHistory", paymentHistorySchema, "payment_history");

/** What OOHRENA owes each vendor for a booking. Status follows execution evidence and verified payouts. */
const payableSchema = new Schema(
  {
    bookingId: { type: String, required: true },
    vendorId: { type: String, required: true, index: true },
    base: { type: Number, required: true },
    gst: { type: Number, required: true },
    amount: { type: Number, required: true },
    paid: { type: Number, default: 0 },
    status: { type: String, enum: PAYABLE_STATUSES, default: "pending", index: true },
    dueDate: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);
payableSchema.index({ bookingId: 1, vendorId: 1 }, { unique: true });
export const VendorPayable = mongoose.model("VendorPayable", payableSchema, "vendor_payables");
