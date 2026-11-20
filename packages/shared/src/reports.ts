import { z } from "zod";

export const REPORT_FORMATS = ["json", "csv", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_NAMES = [
  "client_campaign",
  "vendor_performance",
  "funnel",
  "revenue",
  "exceptions",
  "audit",
  "reconciliation",
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

export const funnelReportQuery = z.object({
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  source: z.string().trim().max(40).optional(),
  format: z.enum(REPORT_FORMATS).default("json"),
});

export const revenueReportQuery = z.object({
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  format: z.enum(REPORT_FORMATS).default("json"),
});

export const vendorPerformanceQuery = z.object({
  vendorId: z.string().trim().max(40).optional(),
  format: z.enum(REPORT_FORMATS).default("json"),
});

export const exceptionsReportQuery = z.object({
  format: z.enum(REPORT_FORMATS).default("json"),
});

export const clientCampaignReportQuery = z.object({
  format: z.enum(REPORT_FORMATS).default("json"),
});
