import { useQuery } from "@tanstack/react-query";
import { api, assetUrl } from "./api";

export type CampaignReportView = {
  campaignId: string;
  bookingId: string;
  clientId: string | null;
  status: string;
  start: string;
  end: string;
  booking: {
    items: Array<{
      inventoryId: string;
      title: string;
      category: string;
      city: string;
      from: string;
      to: string;
    }>;
    total: number;
  };
  workOrders: Array<{
    workOrderId: string;
    vendorId: string;
    status: string;
    instructions: string;
    itemsCount: number;
  }>;
  proofs: Array<{
    proofId: string;
    workOrderId: string;
    inventoryId: string;
    type: string;
    uploadedAt: string;
    gpsLabel: string;
    url: string;
    mime: string;
  }>;
  issues: Array<{
    issueId: string;
    category: string;
    status: string;
    description: string;
    resolutionNote: string | null;
    resolvedAt: string | null;
  }>;
  spend: {
    invoiceId: string | null;
    invoiced: number;
    received: number;
    refunded: number;
    balance: number;
  };
  generatedAt: string;
};

export type VendorPerformanceRow = {
  vendorId: string;
  legalName: string;
  city: string;
  kycStatus: string;
  holdResponseTimeMin: number | null;
  proofTimelinessPct: number;
  proofRejectionRatePct: number;
  issuesCount: number;
  workOrdersTotal: number;
  workOrdersCompleted: number;
  woCompletionRatePct: number;
  listingsApproved: number;
  listingsRejected: number;
};

export type FunnelReportView = {
  totalLeads: number;
  quotedLeads: number;
  wonLeads: number;
  completedLeads: number;
  conversion: {
    leadToQuotePct: number;
    quoteToWonPct: number;
    overallWonPct: number;
  };
  bySource: Array<{
    source: string;
    leads: number;
    quoted: number;
    won: number;
    completed: number;
    conversionPct: number;
  }>;
  generatedAt: string;
};

export type RevenueReportView = {
  bookingValue: number;
  serviceFee: number;
  commission: number;
  gstOutput: number;
  gstInput: number;
  netGst: number;
  received: number;
  refunded: number;
  byMonth: Array<{
    month: string;
    bookingValue: number;
    commission: number;
    serviceFee: number;
    gst: number;
  }>;
  byCity: Array<{
    city: string;
    bookingValue: number;
    count: number;
  }>;
  byCategory: Array<{
    category: string;
    bookingValue: number;
    count: number;
  }>;
  generatedAt: string;
};

export type ExceptionsReportView = {
  staleLeads: Array<{ leadId: string; createdAt: string; source: string; requirement: string }>;
  holdsExpiring: Array<{ holdId: string; inventoryId: string; expiresAt: string | null }>;
  overdueProofs: Array<{
    scheduleId: string;
    workOrderId: string;
    inventoryId: string;
    dueDate: string;
  }>;
  unpaidInvoices: Array<{ invoiceId: string; bookingId: string; total: number; dueDate: string }>;
  payablesDue: Array<{ payableId: string; vendorId: string; amount: number; dueDate: string }>;
  openIssues: Array<{
    issueId: string;
    category: string;
    dueDate: string | null;
    description: string;
  }>;
  expiredQuotes: Array<{ quoteId: string; leadId: string; validUntil: string }>;
  counts: {
    staleLeads: number;
    holdsExpiring: number;
    overdueProofs: number;
    unpaidInvoices: number;
    payablesDue: number;
    openIssues: number;
    expiredQuotes: number;
  };
  generatedAt: string;
};

export type AuditLogItem = {
  logId: string;
  at: string;
  userId: string | null;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  reason: string | null;
  ip: string | null;
};

export const reportDownloadUrl = (
  reportPath: string,
  format: "csv" | "pdf",
  params: Record<string, string | undefined> = {},
) => {
  const q = new URLSearchParams();
  q.set("format", format);
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  return assetUrl(`/api/v1/reports/${reportPath}?${q.toString()}`);
};

export function useCampaignReport(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["reports", "client-campaign", campaignId],
    queryFn: () => api<CampaignReportView>(`/reports/client-campaign/${campaignId}?format=json`),
    enabled: !!campaignId,
  });
}

export function useVendorPerformance(vendorId?: string) {
  return useQuery({
    queryKey: ["reports", "vendor-performance", vendorId],
    queryFn: () =>
      api<VendorPerformanceRow[]>(
        `/reports/vendor-performance${vendorId ? `?vendorId=${vendorId}` : ""}`,
      ),
  });
}

export function useFunnelReport(params: { from?: string; to?: string; source?: string } = {}) {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.source) q.set("source", params.source);
  return useQuery({
    queryKey: ["reports", "funnel", params],
    queryFn: () => api<FunnelReportView>(`/reports/funnel?${q.toString()}`),
  });
}

export function useRevenueReport(params: { from?: string; to?: string } = {}) {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return useQuery({
    queryKey: ["reports", "revenue", params],
    queryFn: () => api<RevenueReportView>(`/reports/revenue?${q.toString()}`),
  });
}

export function useExceptionsReport() {
  return useQuery({
    queryKey: ["reports", "exceptions"],
    queryFn: () => api<ExceptionsReportView>("/reports/exceptions"),
  });
}

export function useAuditLogs(
  params: {
    userId?: string;
    entity?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const q = new URLSearchParams();
  if (params.userId) q.set("userId", params.userId);
  if (params.entity) q.set("entity", params.entity);
  if (params.action) q.set("action", params.action);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));

  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () =>
      api<{ items: AuditLogItem[]; total: number; page: number; pageSize: number }>(
        `/audit-logs?${q.toString()}`,
      ),
  });
}
