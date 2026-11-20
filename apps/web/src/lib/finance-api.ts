import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InvoiceStatus,
  PayableStatus,
  PaymentDirection,
  PaymentStatus,
  Reconciliation,
} from "@oohrena/shared";
import { api } from "./api";

export type PaymentRow = {
  paymentId: string;
  direction: PaymentDirection;
  label: string;
  bookingId: string;
  amount: number;
  paidOn: string;
  status: PaymentStatus;
  decidedAt: string | null;
  mode?: string;
  reference?: string;
  invoiceId?: string | null;
  vendorId?: string | null;
  note?: string | null;
  ruleApplied?: string | null;
  reason?: string | null;
  recordedBy?: string;
  recordedByRole?: string;
  verifiedBy?: string | null;
  rejectReason?: string | null;
  createdAt?: string | null;
};
export type InvoiceRow = {
  invoiceId: string;
  bookingId: string;
  total: number;
  subtotal: number;
  serviceFee: number;
  cgst: number;
  sgst: number;
  gst: number;
  advancePct: number;
  advanceAmount: number;
  issuedAt: string;
  dueDate: string;
  status: InvoiceStatus;
  lines: { description: string; amount: number }[];
};
export type PayableRow = {
  bookingId: string;
  vendorId: string;
  vendorName?: string | null;
  base: number;
  gst: number;
  amount: number;
  paid: number;
  balance: number;
  status: PayableStatus;
  dueDate: string;
};
export type FinanceBooking = {
  bookingId: string;
  status: string;
  total: number;
  start: string;
  end: string;
  invoiceId: string | null;
  invoiceStatus: InvoiceStatus | null;
  client: Reconciliation["client"];
  vendors: Reconciliation["vendors"];
  checksOk: boolean;
};
export type Overview = {
  toVerify: number;
  invoicesOpen: number;
  overdueInvoices: number;
  payablesDue: number;
  refundsPending: number;
  uninvoicedBookings: number;
};

const K = ["finance"] as const;
export const useFinanceOverview = () =>
  useQuery({ queryKey: [...K, "overview"], queryFn: () => api<Overview>("/finance/overview") });
export const useFinanceBookings = () =>
  useQuery({
    queryKey: [...K, "bookings"],
    queryFn: () => api<FinanceBooking[]>("/finance/bookings"),
  });
export const usePayments = (status?: PaymentStatus) =>
  useQuery({
    queryKey: [...K, "payments", status ?? "all"],
    queryFn: () => api<PaymentRow[]>(`/finance/payments${status ? `?status=${status}` : ""}`),
  });
export const usePayables = () =>
  useQuery({ queryKey: [...K, "payables"], queryFn: () => api<PayableRow[]>("/finance/payables") });
export const useReconciliation = (bookingId: string | undefined) =>
  useQuery({
    queryKey: [...K, "rec", bookingId],
    enabled: !!bookingId,
    queryFn: () => api<Reconciliation>(`/finance/reconciliation/${bookingId}`),
  });
export const usePaymentHistory = (id: string | undefined) =>
  useQuery({
    queryKey: [...K, "history", id],
    enabled: !!id,
    queryFn: () =>
      api<
        {
          field: string;
          old: unknown;
          new: unknown;
          changedBy: string;
          reason: string | null;
          at: string;
        }[]
      >(`/finance/payments/${id}/history`),
  });

export function useFinanceActions() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: K });
  return {
    invoice: useMutation({
      mutationFn: (v: { bookingId: string; advancePct: number; dueDate?: string }) =>
        api<InvoiceRow>("/finance/invoices", { body: v }),
      onSuccess: done,
    }),
    record: useMutation({
      mutationFn: ({
        kind,
        file,
        fields,
      }: {
        kind: "payments" | "vendor-payments" | "refunds";
        file: File;
        fields: Record<string, string>;
      }) => {
        const f = new FormData();
        for (const [k, v] of Object.entries(fields)) if (v !== "") f.append(k, v);
        f.append("file", file);
        return api<PaymentRow>(`/finance/${kind}`, { form: f });
      },
      onSuccess: done,
    }),
    decide: useMutation({
      mutationFn: ({
        id,
        decision,
        reason,
      }: {
        id: string;
        decision: "verify" | "reject";
        reason?: string;
      }) =>
        api(`/finance/payments/${id}/verify`, {
          body: reason ? { decision, reason } : { decision },
        }),
      onSuccess: done,
    }),
    edit: useMutation({
      mutationFn: ({
        id,
        ...b
      }: {
        id: string;
        reference?: string;
        amount?: number;
        reason: string;
      }) => api<PaymentRow>(`/finance/payments/${id}`, { method: "PATCH", body: b }),
      onSuccess: done,
    }),
    verifyBank: useMutation({
      mutationFn: (vendorId: string) =>
        api(`/finance/vendors/${vendorId}/bank/verify`, { body: {} }),
      onSuccess: done,
    }),
  };
}
export const fetchVendorBank = (vendorId: string) =>
  api<{
    accountName: string;
    accountNo: string;
    ifsc: string;
    bankName: string | null;
    verified: boolean;
  }>(`/finance/vendors/${vendorId}/bank`);

/* ---------- Client / vendor / admin views ---------- */
export const useMyPayments = () =>
  useQuery({
    queryKey: ["client", "payments"],
    queryFn: () => api<{ invoices: InvoiceRow[]; payments: PaymentRow[] }>("/clients/me/payments"),
  });
export const useMyPayables = () =>
  useQuery({
    queryKey: ["vendor", "payables"],
    queryFn: () => api<{ payables: PayableRow[]; payouts: PaymentRow[] }>("/vendors/me/payables"),
  });
export const useBookingPaymentStatus = (bookingId: string | undefined) =>
  useQuery({
    queryKey: ["admin", "pay-status", bookingId],
    enabled: !!bookingId,
    queryFn: () =>
      api<{
        invoice: { invoiceId: string; status: InvoiceStatus } | null;
        payables: { vendorId: string; status: PayableStatus }[];
      }>(`/finance/bookings/${bookingId}/status`),
  });
