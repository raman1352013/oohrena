import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingStatus, LeadSource, LeadStatus, PricingUnit, PublicListing, QuoteStatus, WorkOrderStatus } from "@oohrena/shared";
import { api } from "./api";

export type QuoteItem = {
  inventoryId: string; title: string; category: string; city: string; pricingUnit: PricingUnit; from: string; to: string; qty: number;
  rate: number; billableUnits: number; media: number; production: number; installation: number; lineTotal: number; description: string | null;
  vendorId?: string; vendorCost?: number;
};
export type QuoteView = {
  quoteId: string; quoteNo: string; version: number; leadId: string; status: QuoteStatus; validUntil: string; terms: string | null; items: QuoteItem[];
  mediaTotal: number; productionTotal: number; installationTotal: number; subtotal: number; serviceFeePct: number; serviceFee: number; cgst: number; sgst: number; gst: number; total: number;
  releasedAt: string | null; decision: string | null; decisionComment: string | null; decidedAt: string | null; createdAt: string;
  vendorCostTotal?: number; margin?: number; holdIds?: string[];
  versions?: { quoteId: string; version: number; status: QuoteStatus; total: number }[];
};
export type BookingView = {
  bookingId: string; quoteId: string; leadId: string; status: BookingStatus; start: string; end: string; items: QuoteItem[];
  subtotal: number; serviceFee: number; gst: number; total: number; createdAt: string;
  cancellation: { at: string; reason: string; daysBefore: number; feePct: number; fee: number; refundable: number; rule: string } | null;
  history?: { fromStatus: string | null; toStatus: string; changedBy: string; reason: string | null; at: string }[];
  workOrders?: WorkOrderView[];
};
export type WorkOrderView = {
  workOrderId: string; bookingId: string; status: WorkOrderStatus; instructions: string; creativeNote: string | null;
  items: Pick<QuoteItem, "inventoryId" | "title" | "category" | "city" | "from" | "to" | "qty">[]; issuedAt: string; acknowledgedAt: string | null; vendorId?: string;
};
export type InboxLead = {
  leadId: string; source: LeadSource; status: LeadStatus; inventoryIds: string[]; city: string | null; from: string; to: string; qty: number; budget: number | null;
  requirement: string; createdAt: string; clientId: string | null; contact: { name?: string; company?: string; email?: string; mobile?: string } | null; possibleDuplicates: string[];
};
export type LeadDetail = Omit<InboxLead, "possibleDuplicates" | "clientId" | "inventoryIds"> & {
  client: { clientId: string; companyName: string; gstin: string | null } | null;
  items: (PublicListing & { vendorId: string; vendorRate: number; availabilityMode: string })[];
  vendors: { vendorId: string; legalName: string; kycStatus: string; city: string }[];
  assignments: { vendorId: string; status: "active" | "removed"; assignedBy: string; assignedAt: string; reason: string | null }[];
  quotes: QuoteView[]; booking: BookingView | null; workOrders: WorkOrderView[]; possibleDuplicates: string[];
};
export type Dashboard = {
  leads: Partial<Record<LeadStatus, number>>; bookings: Partial<Record<BookingStatus, number>>; quotesAwaitingClient: number; approvedQuotesWithoutBooking: number;
  activeHolds: number; pendingVendorConfirmations: number; pendingApprovals: { vendorKyc: number; listings: number; duplicates: number };
  exceptions: { staleLeads: number; holdsExpiringSoon: number; expiredQuotes: number; overdueProofs: number }; proofsToVerify: number; openIssues: number; generatedAt: string;
};
export type QuoteItemInput = { inventoryId: string; from: string; to: string; qty: number; rate?: number; billableUnits?: number; production: number; installation: number; vendorCost?: number };

/* ---------- Admin ---------- */
export const useDashboard = () => useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api<Dashboard>("/admin/dashboard"), refetchInterval: 60_000 });
export const useInbox = (status?: LeadStatus) =>
  useQuery({ queryKey: ["admin", "leads", status ?? "all"], queryFn: () => api<{ items: InboxLead[]; total: number }>(`/admin/leads?pageSize=100${status ? `&status=${status}` : ""}`) });
export const useLeadDetail = (id: string) => useQuery({ queryKey: ["admin", "lead", id], queryFn: () => api<LeadDetail>(`/admin/leads/${id}`) });
export const useAdminBookings = () => useQuery({ queryKey: ["admin", "bookings"], queryFn: () => api<BookingView[]>("/admin/bookings") });

/** Every admin action on a lead refreshes the lead page, inbox and dashboard. */
export function useLeadActions(leadId: string) {
  const qc = useQueryClient();
  const done = () => { void qc.invalidateQueries({ queryKey: ["admin"] }); };
  const useAction = <V, R>(fn: (v: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: done });
  return {
    status: useAction((v: { status: "under_review" | "lost" | "closed"; reason?: string }) => api(`/admin/leads/${leadId}/status`, { body: v })),
    assign: useAction((v: { vendorId: string; note?: string }) => api(`/admin/leads/${leadId}/assign`, { body: v })),
    unassign: useAction((vendorId: string) => api(`/admin/leads/${leadId}/assign/${vendorId}`, { method: "DELETE" })),
    createQuote: useAction((v: { items: QuoteItemInput[]; validUntil?: string; serviceFeePct?: number; terms?: string }) => api<QuoteView>("/admin/quotes", { body: { leadId, ...v } })),
    updateQuote: useAction(({ id, ...v }: { id: string; items?: QuoteItemInput[]; validUntil?: string; serviceFeePct?: number; terms?: string }) => api<QuoteView>(`/admin/quotes/${id}`, { method: "PATCH", body: v })),
    release: useAction((id: string) => api<QuoteView>(`/admin/quotes/${id}/approve`, { body: {} })),
    revise: useAction((id: string) => api<QuoteView>(`/admin/quotes/${id}/revise`, { body: {} })),
    book: useAction((quoteId: string) => api<BookingView>("/admin/bookings", { body: { quoteId } })),
    workOrder: useAction(({ bookingId, ...v }: { bookingId: string; instructions: string; creativeNote?: string }) => api<WorkOrderView[]>(`/admin/bookings/${bookingId}/work-order`, { body: v })),
    cancel: useAction(({ bookingId, reason }: { bookingId: string; reason: string }) => api<BookingView>(`/bookings/${bookingId}/cancel`, { body: { reason } })),
    reschedule: useAction(({ bookingId, newFrom, reason }: { bookingId: string; newFrom: string; reason: string }) => api<BookingView>(`/admin/bookings/${bookingId}/reschedule`, { body: { newFrom, reason } })),
    override: useAction((v: { entity: "lead" | "quote"; entityId: string; field: "status" | "validUntil"; newValue: string; reason: string }) => api(`/admin/overrides`, { body: v })),
  };
}

/* ---------- Client ---------- */
export const useMyQuotes = () => useQuery({ queryKey: ["client", "quotes"], queryFn: () => api<QuoteView[]>("/quotes") });
export const useQuoteDetail = (id: string | undefined) => useQuery({ queryKey: ["client", "quote", id], enabled: !!id, queryFn: () => api<QuoteView>(`/quotes/${id}`) });
export const useMyBookings = () => useQuery({ queryKey: ["client", "bookings"], queryFn: () => api<BookingView[]>("/bookings") });
export const useBookingDetail = (id: string | undefined) => useQuery({ queryKey: ["booking", id], enabled: !!id, queryFn: () => api<BookingView>(`/bookings/${id}`) });
export function useClientActions() {
  const qc = useQueryClient();
  const done = () => { void qc.invalidateQueries({ queryKey: ["client"] }); void qc.invalidateQueries({ queryKey: ["leads"] }); void qc.invalidateQueries({ queryKey: ["booking"] }); };
  return {
    decide: useMutation({ mutationFn: ({ id, decision, comment }: { id: string; decision: "approve" | "reject" | "revise"; comment?: string }) => api<QuoteView>(`/quotes/${id}/decision`, { body: comment ? { decision, comment } : { decision } }), onSuccess: done }),
    cancel: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api<BookingView>(`/bookings/${id}/cancel`, { body: { reason } }), onSuccess: done }),
  };
}

/* ---------- Vendor ---------- */
export const useMyWorkOrders = () => useQuery({ queryKey: ["vendor", "work-orders"], queryFn: () => api<WorkOrderView[]>("/vendors/me/work-orders") });
export function useAcknowledge() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api<WorkOrderView>(`/work-orders/${id}/acknowledge`, { body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor", "work-orders"] }) });
}
