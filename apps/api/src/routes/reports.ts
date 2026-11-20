import { Router } from "express";
import { z } from "zod";
import { clientCampaignReportQuery, exceptionsReportQuery, funnelReportQuery, revenueReportQuery, vendorPerformanceQuery } from "@oohrena/shared";
import type { Config } from "../config.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery } from "../middleware/validate.js";
import { ReportExport } from "../models/report-export.js";
import {
  buildClientCampaignReport,
  buildExceptionsReport,
  buildFunnelReport,
  buildRevenueReport,
  buildVendorPerformanceReport,
  clientCampaignCsv,
  clientCampaignPdf,
  exceptionsReportCsv,
  exceptionsReportPdf,
  funnelReportCsv,
  funnelReportPdf,
  logReportExport,
  revenueReportCsv,
  revenueReportPdf,
  vendorPerformanceCsv,
  vendorPerformancePdf,
} from "../services/reports.js";

export function reportRoutes(cfg: Config) {
  const r = Router();

  /* ---------- A.2 Client campaign report ---------- */
  r.get("/client-campaign/:campaignId", requirePermission("reports.client_campaign"), async (req, res) => {
    const q = parseQuery(clientCampaignReportQuery, req);
    const campaignId = String(req.params.campaignId);
    const data = await buildClientCampaignReport(cfg, req, campaignId);

    if (q.format === "json") return res.json({ data });

    await logReportExport(req, "client_campaign", { campaignId }, q.format);
    const filename = `campaign-${campaignId}.${q.format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (q.format === "csv") {
      return res.type("text/csv").send(clientCampaignCsv(data));
    }
    const pdf = await clientCampaignPdf(data);
    return res.type("application/pdf").send(pdf);
  });

  /* ---------- A.3 Vendor performance report ---------- */
  r.get("/vendor-performance", requirePermission("reports.vendor_performance"), async (req, res) => {
    const q = parseQuery(vendorPerformanceQuery, req);
    let targetVendorId = q.vendorId;
    if (req.user!.role === "vendor") {
      targetVendorId = req.user!.orgId ?? undefined;
    }
    const rows = await buildVendorPerformanceReport(targetVendorId);

    if (q.format === "json") return res.json({ data: rows });

    await logReportExport(req, "vendor_performance", { vendorId: targetVendorId ?? null }, q.format);
    const filename = `vendor-performance${targetVendorId ? `-${targetVendorId}` : ""}.${q.format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (q.format === "csv") {
      return res.type("text/csv").send(vendorPerformanceCsv(rows));
    }
    const pdf = await vendorPerformancePdf(rows);
    return res.type("application/pdf").send(pdf);
  });

  /* ---------- A.4 Funnel report ---------- */
  r.get("/funnel", requirePermission("reports.admin"), async (req, res) => {
    const q = parseQuery(funnelReportQuery, req);
    const data = await buildFunnelReport(q.from, q.to, q.source);

    if (q.format === "json") return res.json({ data });

    await logReportExport(req, "funnel", { from: q.from ?? null, to: q.to ?? null, source: q.source ?? null }, q.format);
    const filename = `funnel-report.${q.format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (q.format === "csv") {
      return res.type("text/csv").send(funnelReportCsv(data));
    }
    const pdf = await funnelReportPdf(data);
    return res.type("application/pdf").send(pdf);
  });

  /* ---------- A.5 Revenue report ---------- */
  r.get("/revenue", requirePermission("reports.admin"), async (req, res) => {
    const q = parseQuery(revenueReportQuery, req);
    const data = await buildRevenueReport(q.from, q.to);

    if (q.format === "json") return res.json({ data });

    await logReportExport(req, "revenue", { from: q.from ?? null, to: q.to ?? null }, q.format);
    const filename = `revenue-report.${q.format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (q.format === "csv") {
      return res.type("text/csv").send(revenueReportCsv(data));
    }
    const pdf = await revenueReportPdf(data);
    return res.type("application/pdf").send(pdf);
  });

  /* ---------- A.6 Exceptions report ---------- */
  r.get("/exceptions", requirePermission("reports.admin"), async (req, res) => {
    const q = parseQuery(exceptionsReportQuery, req);
    const data = await buildExceptionsReport();

    if (q.format === "json") return res.json({ data });

    await logReportExport(req, "exceptions", {}, q.format);
    const filename = `exceptions-report.${q.format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (q.format === "csv") {
      return res.type("text/csv").send(exceptionsReportCsv(data));
    }
    const pdf = await exceptionsReportPdf(data);
    return res.type("application/pdf").send(pdf);
  });

  /* ---------- A.1 Report exports log inquiry ---------- */
  r.get("/exports", requirePermission("reports.admin"), async (req, res) => {
    const q = parseQuery(
      z.object({
        report: z.string().trim().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req,
    );
    const filter: Record<string, unknown> = {};
    if (q.report) filter.report = q.report;
    const [items, total] = await Promise.all([
      ReportExport.find(filter).sort({ at: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      ReportExport.countDocuments(filter),
    ]);
    res.json({
      data: {
        items: items.map((i) => ({ exportId: i._id, report: i.report, params: i.params, requestedBy: i.requestedBy, role: i.role, format: i.format, at: i.at })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      },
    });
  });

  return r;
}
