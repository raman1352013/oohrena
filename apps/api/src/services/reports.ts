import type { Request } from "express";
import { fromDay, gpsLabel, toDay, todayIST, type ReportFormat } from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { renderPdf, pdfMoney, type PdfBlock } from "../lib/pdf.js";
import { AvailabilityBlock, AvailabilityRequest } from "../models/availability.js";
import { Booking, Quote, WorkOrder } from "../models/booking.js";
import { Campaign, Issue, Proof, ProofSchedule } from "../models/execution.js";
import { Invoice, Payment, VendorPayable } from "../models/finance.js";
import { Vendor } from "../models/foundation.js";
import { Inventory } from "../models/inventory.js";
import { Lead } from "../models/lead.js";
import { ReportExport } from "../models/report-export.js";
import { overdueSlots, proofView } from "./execution.js";

/** CSV line escaping helper */
export function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells
    .map((c) => {
      if (c === null || c === undefined) return '""';
      const s = String(c).replace(/"/g, '""');
      return `"${s}"`;
    })
    .join(",");
}

/** Record every report / audit / reconciliation export */
export async function logReportExport(
  req: Request,
  report: string,
  params: Record<string, unknown>,
  format: ReportFormat,
) {
  const exportId = await nextId("EXP");
  const doc = await ReportExport.create({
    _id: exportId,
    report,
    params,
    requestedBy: req.user!.userId,
    role: req.user!.role,
    format,
    at: new Date(),
  });
  await audit(req, {
    action: "report.export",
    entity: "report",
    entityId: exportId,
    after: { report, format, params },
  });
  if (report === "reconciliation" && params.bookingId) {
    await audit(req, {
      action: "finance.export",
      entity: "booking",
      entityId: String(params.bookingId),
      after: { report: "reconciliation", format },
    });
  }
  return doc.toObject();
}

/* ========================================================================== */
/* A.2 Client Campaign Report                                                 */
/* ========================================================================== */

export async function buildClientCampaignReport(cfg: Config, req: Request, campaignId: string) {
  const c = await Campaign.findById(campaignId).lean();
  if (!c) throw notFound("Campaign not found");
  if (req.user!.role === "client" && c.clientId !== req.user!.orgId) {
    throw notFound("Campaign not found");
  }

  const [booking, workOrders, proofs, issues, invoice, payments] = await Promise.all([
    Booking.findById(c.bookingId).lean(),
    WorkOrder.find({ bookingId: c.bookingId }).lean(),
    Proof.find({ campaignId: c._id, status: "verified" }).sort({ uploadedAt: 1 }).lean(),
    Issue.find({ campaignId: c._id }).sort({ createdAt: -1 }).lean(),
    Invoice.findOne({ bookingId: c.bookingId }).lean(),
    Payment.find({ bookingId: c.bookingId, status: "verified" }).lean(),
  ]);

  if (!booking) throw notFound("Booking not found");

  const receipts = payments
    .filter((p) => p.direction === "client_receipt")
    .reduce((sum, p) => sum + p.amount, 0);
  const refunds = payments
    .filter((p) => p.direction === "refund")
    .reduce((sum, p) => sum + p.amount, 0);
  const invoiced = invoice?.total ?? booking.total ?? 0;
  const balance = invoiced - receipts + refunds;

  const proofRows = proofs.map((p) => {
    const view = proofView(cfg, p as never, req.user!.role === "client" ? "client" : "admin");
    return {
      proofId: p._id,
      workOrderId: p.workOrderId,
      inventoryId: p.inventoryId,
      type: p.type,
      uploadedAt: p.uploadedAt,
      gpsLabel: view.gpsLabel,
      url: view.url,
      mime: p.mime,
    };
  });

  return {
    campaignId: c._id,
    bookingId: booking._id,
    clientId: c.clientId ?? null,
    status: c.status,
    start: fromDay(c.start.getTime()),
    end: fromDay(c.end.getTime()),
    booking: {
      items: booking.items.map((it) => ({
        inventoryId: it.inventoryId,
        title: it.title,
        category: it.category,
        city: it.city,
        from: fromDay(it.from.getTime()),
        to: fromDay(it.to.getTime()),
      })),
      total: booking.total,
    },
    workOrders: workOrders.map((w) => ({
      workOrderId: w._id,
      vendorId: w.vendorId,
      status: w.status,
      instructions: w.instructions,
      itemsCount: w.items.length,
    })),
    proofs: proofRows,
    issues: issues.map((i) => ({
      issueId: i._id,
      category: i.category,
      status: i.status,
      description: i.description,
      resolutionNote: i.resolutionNote ?? null,
      resolvedAt: i.resolvedAt ?? null,
    })),
    spend: {
      invoiceId: invoice?._id ?? null,
      invoiced,
      received: receipts,
      refunded: refunds,
      balance,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function clientCampaignCsv(data: Awaited<ReturnType<typeof buildClientCampaignReport>>): string {
  const lines: string[] = [];
  lines.push(toCsvRow(["CAMPAIGN REPORT", data.campaignId]));
  lines.push(toCsvRow(["Booking ID", data.bookingId]));
  lines.push(toCsvRow(["Campaign Period", `${data.start} to ${data.end}`]));
  lines.push(toCsvRow(["Status", data.status]));
  lines.push("");

  lines.push(toCsvRow(["FINANCIAL SUMMARY"]));
  lines.push(toCsvRow(["Invoice Total", data.spend.invoiced]));
  lines.push(toCsvRow(["Verified Received", data.spend.received]));
  lines.push(toCsvRow(["Verified Refunded", data.spend.refunded]));
  lines.push(toCsvRow(["Balance Due", data.spend.balance]));
  lines.push("");

  lines.push(toCsvRow(["WORK ORDERS"]));
  lines.push(toCsvRow(["Work Order ID", "Vendor ID", "Status", "Instructions"]));
  for (const w of data.workOrders) {
    lines.push(toCsvRow([w.workOrderId, w.vendorId, w.status, w.instructions]));
  }
  lines.push("");

  lines.push(toCsvRow(["VERIFIED PROOF OF DISPLAY"]));
  lines.push(toCsvRow(["Proof ID", "Work Order", "Media ID", "Type", "Uploaded At", "GPS Verification"]));
  for (const p of data.proofs) {
    lines.push(toCsvRow([p.proofId, p.workOrderId, p.inventoryId, p.type, p.uploadedAt.toISOString(), p.gpsLabel]));
  }
  lines.push("");

  lines.push(toCsvRow(["ISSUES & COMPLAINTS"]));
  lines.push(toCsvRow(["Issue ID", "Category", "Status", "Description", "Resolution"]));
  for (const i of data.issues) {
    lines.push(toCsvRow([i.issueId, i.category, i.status, i.description, i.resolutionNote ?? ""]));
  }

  return lines.join("\n");
}

export async function clientCampaignPdf(data: Awaited<ReturnType<typeof buildClientCampaignReport>>): Promise<Buffer> {
  const blocks: PdfBlock[] = [
    { kind: "heading", text: "Campaign Overview" },
    {
      kind: "kv",
      rows: [
        ["Campaign ID", data.campaignId],
        ["Booking ID", data.bookingId],
        ["Period", `${data.start} → ${data.end}`],
        ["Status", data.status.toUpperCase()],
      ],
    },
    { kind: "heading", text: "Spend Summary" },
    {
      kind: "kv",
      rows: [
        ["Invoice Total", pdfMoney(data.spend.invoiced ?? 0)],
        ["Verified Receipts", pdfMoney(data.spend.received)],
        ["Verified Refunds", pdfMoney(data.spend.refunded)],
        ["Outstanding Balance", pdfMoney(data.spend.balance)],
      ],
    },
    { kind: "heading", text: "Work Orders" },
    {
      kind: "table",
      head: ["WO ID", "Vendor", "Status", "Sites"],
      rows: data.workOrders.map((w) => [w.workOrderId, w.vendorId, w.status, w.itemsCount]),
    },
    { kind: "heading", text: "Verified Proof of Display" },
    {
      kind: "table",
      head: ["Proof ID", "Type", "Media ID", "Uploaded Time", "GPS Verification"],
      rows: data.proofs.length
        ? data.proofs.map((p) => [p.proofId, p.type, p.inventoryId, p.uploadedAt.toISOString().slice(0, 16), p.gpsLabel])
        : [["No verified proof records yet", "", "", "", ""]],
    },
    ...(data.issues.length
      ? [
          { kind: "heading" as const, text: "Issues & Resolutions" },
          {
            kind: "table" as const,
            head: ["Issue ID", "Category", "Status", "Description", "Resolution"],
            rows: data.issues.map((i) => [i.issueId, i.category, i.status, i.description.slice(0, 30), (i.resolutionNote ?? "—").slice(0, 30)]),
          },
        ]
      : []),
  ];

  return renderPdf(`Campaign Dossier — ${data.campaignId}`, `Booking ${data.bookingId} · Generated ${data.generatedAt}`, blocks);
}

/* ========================================================================== */
/* A.3 Vendor Performance Report                                              */
/* ========================================================================== */

export async function buildVendorPerformanceReport(targetVendorId?: string) {
  const vendorFilter = targetVendorId ? { _id: targetVendorId } : {};
  const vendors = await Vendor.find(vendorFilter).select("_id legalName city kycStatus").lean();
  const vIds = vendors.map((v) => v._id);

  const [reqs, slots, proofs, wos, invs] = await Promise.all([
    AvailabilityRequest.find({ vendorId: { $in: vIds }, status: { $in: ["confirmed", "declined"] }, respondedAt: { $exists: true } }).lean(),
    ProofSchedule.find({ vendorId: { $in: vIds } }).lean(),
    Proof.find({ vendorId: { $in: vIds }, status: { $in: ["uploaded", "verified", "rejected"] } }).lean(),
    WorkOrder.find({ vendorId: { $in: vIds } }).lean(),
    Inventory.find({ vendorId: { $in: vIds } }).select("vendorId status").lean(),
  ]);

  const allIssues = await Issue.find({ workOrderId: { $in: wos.map((w) => w._id) } }).select("workOrderId").lean();

  return vendors.map((v) => {
    // 1. Hold-confirmation response time (in minutes)
    const vReqs = reqs.filter((r) => r.vendorId === v._id);
    const avgResponseTimeMin = vReqs.length
      ? Math.round(vReqs.reduce((sum, r) => sum + (r.respondedAt!.getTime() - r.requestedAt.getTime()), 0) / (vReqs.length * 60_000))
      : null;

    // 2. Proof timeliness: proofs uploaded on or before the due day. Only slots that are already
    // due (or already have a proof) count, so a new work order doesn't read as 0% on time.
    const today = new Date(toDay(todayIST()));
    const vSlots = slots.filter(
      (s) => s.vendorId === v._id && s.status !== "cancelled" && (s.dueDate <= today || s.status !== "due"),
    );
    const timelyCount = vSlots.filter((s) => {
      if (s.status !== "verified" && s.status !== "uploaded") return false;
      const p = proofs.find((x) => x._id === (s.receivedProofId || s.latestProofId));
      return p ? p.uploadedAt.getTime() < s.dueDate.getTime() + 86_400_000 : false;
    }).length;
    const proofTimelinessPct = vSlots.length ? Math.round((timelyCount / vSlots.length) * 100) : 100;

    // 3. Proof rejection rate
    const vProofs = proofs.filter((p) => p.vendorId === v._id && p.status !== "uploaded"); // reviewed only
    const rejectedCount = vProofs.filter((p) => p.status === "rejected").length;
    const proofRejectionRatePct = vProofs.length ? Math.round((rejectedCount / vProofs.length) * 100) : 0;

    // 4. Issues raised against them
    const vWoIds = new Set(wos.filter((w) => w.vendorId === v._id).map((w) => w._id));
    const issuesCount = allIssues.filter((i) => i.workOrderId && vWoIds.has(i.workOrderId)).length;

    // 5. Work order completion rate
    const vWos = wos.filter((w) => w.vendorId === v._id && w.status !== "cancelled");
    const completedWos = vWos.filter((w) => w.status === "completed").length;
    const woCompletionRatePct = vWos.length ? Math.round((completedWos / vWos.length) * 100) : 0;

    // 6. Listings approved / rejected
    const vInvs = invs.filter((i) => i.vendorId === v._id);
    const listingsApproved = vInvs.filter((i) => i.status === "approved").length;
    const listingsRejected = vInvs.filter((i) => i.status === "rejected").length;

    return {
      vendorId: v._id,
      legalName: v.legalName,
      city: v.city,
      kycStatus: v.kycStatus,
      holdResponseTimeMin: avgResponseTimeMin,
      proofTimelinessPct,
      proofRejectionRatePct,
      issuesCount,
      workOrdersTotal: vWos.length,
      workOrdersCompleted: completedWos,
      woCompletionRatePct,
      listingsApproved,
      listingsRejected,
    };
  });
}

export function vendorPerformanceCsv(rows: Awaited<ReturnType<typeof buildVendorPerformanceReport>>): string {
  const lines = [
    toCsvRow([
      "Vendor ID",
      "Legal Name",
      "City",
      "Avg Hold Response (min)",
      "Proof Timeliness (%)",
      "Proof Rejection Rate (%)",
      "Issues Count",
      "WO Total",
      "WO Completed",
      "WO Completion Rate (%)",
      "Listings Approved",
      "Listings Rejected",
    ]),
  ];
  for (const r of rows) {
    lines.push(
      toCsvRow([
        r.vendorId,
        r.legalName,
        r.city,
        r.holdResponseTimeMin ?? "N/A",
        r.proofTimelinessPct,
        r.proofRejectionRatePct,
        r.issuesCount,
        r.workOrdersTotal,
        r.workOrdersCompleted,
        r.woCompletionRatePct,
        r.listingsApproved,
        r.listingsRejected,
      ]),
    );
  }
  return lines.join("\n");
}

export async function vendorPerformancePdf(rows: Awaited<ReturnType<typeof buildVendorPerformanceReport>>): Promise<Buffer> {
  const blocks: PdfBlock[] = [
    { kind: "heading", text: "Vendor Performance Metrics" },
    {
      kind: "table",
      head: ["Vendor", "City", "Hold Resp", "Timeliness", "Rejection", "Issues", "WO Done %"],
      rows: rows.map((r) => [
        `${r.vendorId}\n${r.legalName.slice(0, 15)}`,
        r.city,
        r.holdResponseTimeMin !== null ? `${r.holdResponseTimeMin}m` : "N/A",
        `${r.proofTimelinessPct}%`,
        `${r.proofRejectionRatePct}%`,
        r.issuesCount,
        `${r.woCompletionRatePct}%`,
      ]),
    },
  ];
  return renderPdf("Vendor Performance Report", `Generated ${new Date().toISOString()}`, blocks);
}

/* ========================================================================== */
/* A.4 Funnel Report                                                          */
/* ========================================================================== */

export async function buildFunnelReport(from?: string, to?: string, source?: string) {
  const filter: Record<string, unknown> = {};
  if (source) filter.source = source;
  if (from || to) {
    filter.createdAt = {
      ...(from ? { $gte: new Date(toDay(from)) } : {}),
      ...(to ? { $lte: new Date(toDay(to) + 86_400_000) } : {}),
    };
  }

  const leads = await Lead.find(filter).lean();
  const leadIds = leads.map((l) => l._id);

  const [quotes, bookings] = await Promise.all([
    Quote.find({ leadId: { $in: leadIds } }).select("leadId status").lean(),
    Booking.find({ leadId: { $in: leadIds }, status: { $in: ["confirmed", "live", "completed"] } }).select("leadId status").lean(),
  ]);

  const quotedLeadIds = new Set(quotes.map((q) => q.leadId));
  const wonLeadIds = new Set(bookings.map((b) => b.leadId));
  const completedLeadIds = new Set(bookings.filter((b) => b.status === "completed").map((b) => b.leadId));

  const total = leads.length;
  const quoted = quotedLeadIds.size;
  const won = wonLeadIds.size;
  const completed = completedLeadIds.size;

  // Breakdown by source
  const sources = [...new Set(leads.map((l) => l.source))];
  const bySource = sources.map((s) => {
    const sLeads = leads.filter((l) => l.source === s);
    const sLeadIds = new Set(sLeads.map((l) => l._id));
    const sQuoted = [...quotedLeadIds].filter((id) => sLeadIds.has(id)).length;
    const sWon = [...wonLeadIds].filter((id) => sLeadIds.has(id)).length;
    const sCompleted = [...completedLeadIds].filter((id) => sLeadIds.has(id)).length;
    return {
      source: s,
      leads: sLeads.length,
      quoted: sQuoted,
      won: sWon,
      completed: sCompleted,
      conversionPct: sLeads.length ? Math.round((sWon / sLeads.length) * 100) : 0,
    };
  });

  return {
    totalLeads: total,
    quotedLeads: quoted,
    wonLeads: won,
    completedLeads: completed,
    conversion: {
      leadToQuotePct: total ? Math.round((quoted / total) * 100) : 0,
      quoteToWonPct: quoted ? Math.round((won / quoted) * 100) : 0,
      overallWonPct: total ? Math.round((won / total) * 100) : 0,
    },
    bySource,
    filters: { from: from ?? null, to: to ?? null, source: source ?? null },
    generatedAt: new Date().toISOString(),
  };
}

export function funnelReportCsv(data: Awaited<ReturnType<typeof buildFunnelReport>>): string {
  const lines: string[] = [];
  lines.push(toCsvRow(["FUNNEL REPORT"]));
  lines.push(toCsvRow(["Total Leads", data.totalLeads]));
  lines.push(toCsvRow(["Quoted Leads", data.quotedLeads]));
  lines.push(toCsvRow(["Won Bookings", data.wonLeads]));
  lines.push(toCsvRow(["Completed Campaigns", data.completedLeads]));
  lines.push(toCsvRow(["Lead to Quote %", `${data.conversion.leadToQuotePct}%`]));
  lines.push(toCsvRow(["Quote to Won %", `${data.conversion.quoteToWonPct}%`]));
  lines.push(toCsvRow(["Overall Conversion %", `${data.conversion.overallWonPct}%`]));
  lines.push("");

  lines.push(toCsvRow(["BREAKDOWN BY SOURCE"]));
  lines.push(toCsvRow(["Source", "Leads", "Quoted", "Won", "Completed", "Conversion %"]));
  for (const s of data.bySource) {
    lines.push(toCsvRow([s.source, s.leads, s.quoted, s.won, s.completed, `${s.conversionPct}%`]));
  }
  return lines.join("\n");
}

export async function funnelReportPdf(data: Awaited<ReturnType<typeof buildFunnelReport>>): Promise<Buffer> {
  const blocks: PdfBlock[] = [
    { kind: "heading", text: "Inquiry to Campaign Funnel" },
    {
      kind: "kv",
      rows: [
        ["Total Inquiries (Leads)", data.totalLeads],
        ["Quoted Leads", data.quotedLeads],
        ["Won Bookings", data.wonLeads],
        ["Completed Campaigns", data.completedLeads],
        ["Inquiry → Quote Conversion", `${data.conversion.leadToQuotePct}%`],
        ["Quote → Won Conversion", `${data.conversion.quoteToWonPct}%`],
        ["Overall Inquiry → Won %", `${data.conversion.overallWonPct}%`],
      ],
    },
    { kind: "heading", text: "Conversion by Source" },
    {
      kind: "table",
      head: ["Source", "Leads", "Quoted", "Won", "Done", "Win Rate"],
      rows: data.bySource.map((s) => [s.source, s.leads, s.quoted, s.won, s.completed, `${s.conversionPct}%`]),
    },
  ];
  return renderPdf("Inquiry Funnel Report", `Generated ${data.generatedAt}`, blocks);
}

/* ========================================================================== */
/* A.5 Revenue Report                                                         */
/* ========================================================================== */

export async function buildRevenueReport(from?: string, to?: string) {
  const filter: Record<string, unknown> = {
    status: { $in: ["confirmed", "live", "completed", "cancelled"] },
  };
  if (from || to) {
    filter.createdAt = {
      ...(from ? { $gte: new Date(toDay(from)) } : {}),
      ...(to ? { $lte: new Date(toDay(to) + 86_400_000) } : {}),
    };
  }

  const [bookings, verifiedReceipts, verifiedRefunds, payables] = await Promise.all([
    Booking.find(filter).lean(),
    Payment.find({ direction: "client_receipt", status: "verified" }).lean(),
    Payment.find({ direction: "refund", status: "verified" }).lean(),
    VendorPayable.find({}).lean(),
  ]);

  let bookingValue = 0;
  let serviceFee = 0;
  let commission = 0;
  let gstOutput = 0;

  const byMonthMap = new Map<string, { month: string; bookingValue: number; commission: number; serviceFee: number; gst: number }>();
  const byCityMap = new Map<string, { city: string; bookingValue: number; count: number }>();
  const byCategoryMap = new Map<string, { category: string; bookingValue: number; count: number }>();

  for (const b of bookings) {
    const bTotal = b.total ?? 0;
    const bServiceFee = b.serviceFee ?? 0;
    const bGst = b.gst ?? 0;
    const bSubtotal = b.subtotal ?? 0;
    bookingValue += bTotal;
    serviceFee += bServiceFee;
    gstOutput += bGst;
    const vendorCost = b.items.reduce((sum, it) => sum + (it.vendorCost || 0), 0);
    const comm = Math.max(0, bSubtotal - vendorCost);
    commission += comm;

    const month = b.createdAt.toISOString().slice(0, 7);
    const m = byMonthMap.get(month) ?? { month, bookingValue: 0, commission: 0, serviceFee: 0, gst: 0 };
    m.bookingValue += bTotal;
    m.commission += comm;
    m.serviceFee += bServiceFee;
    m.gst += bGst;
    byMonthMap.set(month, m);

    for (const it of b.items) {
      const city = it.city || "Unknown";
      const c = byCityMap.get(city) ?? { city, bookingValue: 0, count: 0 };
      c.bookingValue += it.lineTotal;
      c.count += 1;
      byCityMap.set(city, c);

      const cat = it.category || "other";
      const k = byCategoryMap.get(cat) ?? { category: cat, bookingValue: 0, count: 0 };
      k.bookingValue += it.lineTotal;
      k.count += 1;
      byCategoryMap.set(cat, k);
    }
  }

  const gstInput = payables.reduce((sum, p) => sum + p.gst, 0);
  const received = verifiedReceipts.reduce((sum, p) => sum + p.amount, 0);
  const refunds = verifiedRefunds.reduce((sum, p) => sum + p.amount, 0);

  return {
    bookingValue,
    serviceFee,
    commission,
    gstOutput,
    gstInput,
    netGst: gstOutput - gstInput,
    received,
    refunds,
    byMonth: [...byMonthMap.values()].sort((a, b) => b.month.localeCompare(a.month)),
    byCity: [...byCityMap.values()].sort((a, b) => b.bookingValue - a.bookingValue),
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.bookingValue - a.bookingValue),
    generatedAt: new Date().toISOString(),
  };
}

export function revenueReportCsv(data: Awaited<ReturnType<typeof buildRevenueReport>>): string {
  const lines: string[] = [];
  lines.push(toCsvRow(["REVENUE REPORT"]));
  lines.push(toCsvRow(["Total Booking Value", data.bookingValue]));
  lines.push(toCsvRow(["Service Fee", data.serviceFee]));
  lines.push(toCsvRow(["Commission", data.commission]));
  lines.push(toCsvRow(["GST Output", data.gstOutput]));
  lines.push(toCsvRow(["GST Input", data.gstInput]));
  lines.push(toCsvRow(["Net GST", data.netGst]));
  lines.push(toCsvRow(["Verified Received", data.received]));
  lines.push(toCsvRow(["Verified Refunds", data.refunds]));
  lines.push("");

  lines.push(toCsvRow(["MONTHLY BREAKDOWN"]));
  lines.push(toCsvRow(["Month", "Booking Value", "Commission", "Service Fee", "GST"]));
  for (const m of data.byMonth) {
    lines.push(toCsvRow([m.month, m.bookingValue, m.commission, m.serviceFee, m.gst]));
  }
  lines.push("");

  lines.push(toCsvRow(["CITY BREAKDOWN"]));
  lines.push(toCsvRow(["City", "Booking Value", "Items Count"]));
  for (const c of data.byCity) {
    lines.push(toCsvRow([c.city, c.bookingValue, c.count]));
  }
  return lines.join("\n");
}

export async function revenueReportPdf(data: Awaited<ReturnType<typeof buildRevenueReport>>): Promise<Buffer> {
  const blocks: PdfBlock[] = [
    { kind: "heading", text: "Revenue & Margin Summary" },
    {
      kind: "kv",
      rows: [
        ["Total Booking Value", pdfMoney(data.bookingValue)],
        ["Platform Service Fee", pdfMoney(data.serviceFee)],
        ["Media Commission", pdfMoney(data.commission)],
        ["Output GST (Billed)", pdfMoney(data.gstOutput)],
        ["Input GST (Payables)", pdfMoney(data.gstInput)],
        ["Net GST Payable", pdfMoney(data.netGst)],
        ["Verified Cash Received", pdfMoney(data.received)],
        ["Verified Refunds", pdfMoney(data.refunds)],
      ],
    },
    { kind: "heading", text: "Monthly Revenue" },
    {
      kind: "table",
      head: ["Month", "Booking Value", "Commission", "Service Fee", "GST"],
      rows: data.byMonth.map((m) => [m.month, pdfMoney(m.bookingValue), pdfMoney(m.commission), pdfMoney(m.serviceFee), pdfMoney(m.gst)]),
    },
    { kind: "heading", text: "Top Cities by Value" },
    {
      kind: "table",
      head: ["City", "Media Count", "Booking Value"],
      rows: data.byCity.slice(0, 10).map((c) => [c.city, c.count, pdfMoney(c.bookingValue)]),
    },
  ];
  return renderPdf("Platform Revenue Report", `Generated ${data.generatedAt}`, blocks);
}

/* ========================================================================== */
/* A.6 Exceptions Report                                                      */
/* ========================================================================== */

export async function buildExceptionsReport() {
  const now = new Date();
  const today = new Date(toDay(todayIST()));

  const [staleLeads, holdsExpiring, overdueProofList, unpaidInvoices, payablesDue, openIssues, expiredQuotes] = await Promise.all([
    Lead.find({ status: "new", createdAt: { $lt: new Date(now.getTime() - 24 * 3600_000) } }).lean(),
    AvailabilityBlock.find({
      kind: "hold",
      status: { $in: ["held", "pending_vendor"] },
      expiresAt: { $gt: now, $lt: new Date(now.getTime() + 12 * 3600_000) },
    }).lean(),
    overdueSlots(),
    Invoice.find({ status: { $in: ["issued", "partially_paid"] }, dueDate: { $lt: now } }).lean(),
    VendorPayable.find({ status: { $in: ["due", "partially_paid"] } }).lean(),
    Issue.find({ status: { $ne: "resolved" }, dueDate: { $lt: now } }).lean(),
    Quote.find({ status: "released", validUntil: { $lt: today } }).lean(),
  ]);

  return {
    staleLeads: staleLeads.map((l) => ({ leadId: l._id, createdAt: l.createdAt, source: l.source, requirement: l.requirement })),
    holdsExpiring: holdsExpiring.map((h) => ({ holdId: String(h._id), inventoryId: h.inventoryId, expiresAt: h.expiresAt })),
    overdueProofs: overdueProofList.map((s) => ({ scheduleId: String(s._id), workOrderId: s.workOrderId, inventoryId: s.inventoryId, dueDate: s.dueDate })),
    unpaidInvoices: unpaidInvoices.map((i) => ({ invoiceId: i._id, bookingId: i.bookingId, total: i.total, dueDate: i.dueDate })),
    payablesDue: payablesDue.map((p) => ({ payableId: String(p._id), vendorId: p.vendorId, amount: p.amount, dueDate: p.dueDate })),
    openIssues: openIssues.map((i) => ({ issueId: i._id, category: i.category, dueDate: i.dueDate, description: i.description })),
    expiredQuotes: expiredQuotes.map((q) => ({ quoteId: q._id, leadId: q.leadId, validUntil: q.validUntil })),
    counts: {
      staleLeads: staleLeads.length,
      holdsExpiring: holdsExpiring.length,
      overdueProofs: overdueProofList.length,
      unpaidInvoices: unpaidInvoices.length,
      payablesDue: payablesDue.length,
      openIssues: openIssues.length,
      expiredQuotes: expiredQuotes.length,
    },
    generatedAt: now.toISOString(),
  };
}

export function exceptionsReportCsv(data: Awaited<ReturnType<typeof buildExceptionsReport>>): string {
  const lines: string[] = [];
  lines.push(toCsvRow(["EXCEPTIONS REPORT", data.generatedAt]));
  lines.push("");

  lines.push(toCsvRow(["STALE LEADS (> 24 hours without action)"]));
  lines.push(toCsvRow(["Lead ID", "Source", "Created At", "Requirement"]));
  for (const l of data.staleLeads) lines.push(toCsvRow([l.leadId, l.source, l.createdAt.toISOString(), l.requirement]));
  lines.push("");

  lines.push(toCsvRow(["HOLDS EXPIRING (< 12 hours)"]));
  lines.push(toCsvRow(["Hold ID", "Media ID", "Expires At"]));
  for (const h of data.holdsExpiring) lines.push(toCsvRow([h.holdId, h.inventoryId, h.expiresAt?.toISOString() ?? ""]));
  lines.push("");

  lines.push(toCsvRow(["OVERDUE PROOF SLOTS"]));
  lines.push(toCsvRow(["Slot ID", "Work Order ID", "Media ID", "Due Date"]));
  for (const p of data.overdueProofs) lines.push(toCsvRow([p.scheduleId, p.workOrderId, p.inventoryId, p.dueDate.toISOString().slice(0, 10)]));
  lines.push("");

  lines.push(toCsvRow(["OVERDUE INVOICES"]));
  lines.push(toCsvRow(["Invoice ID", "Booking ID", "Total", "Due Date"]));
  for (const i of data.unpaidInvoices) lines.push(toCsvRow([i.invoiceId, i.bookingId, i.total, i.dueDate.toISOString().slice(0, 10)]));
  lines.push("");

  lines.push(toCsvRow(["DUE PAYABLES"]));
  lines.push(toCsvRow(["Payable ID", "Vendor ID", "Amount", "Due Date"]));
  for (const p of data.payablesDue) lines.push(toCsvRow([p.payableId, p.vendorId, p.amount, p.dueDate.toISOString().slice(0, 10)]));
  lines.push("");

  lines.push(toCsvRow(["OPEN ISSUES PAST DUE"]));
  lines.push(toCsvRow(["Issue ID", "Category", "Due Date", "Description"]));
  for (const i of data.openIssues) lines.push(toCsvRow([i.issueId, i.category, i.dueDate?.toISOString().slice(0, 10) ?? "", i.description]));
  lines.push("");

  lines.push(toCsvRow(["EXPIRED QUOTES WITHOUT DECISION"]));
  lines.push(toCsvRow(["Quote ID", "Lead ID", "Valid Until"]));
  for (const q of data.expiredQuotes) lines.push(toCsvRow([q.quoteId, q.leadId, q.validUntil.toISOString().slice(0, 10)]));

  return lines.join("\n");
}

export async function exceptionsReportPdf(data: Awaited<ReturnType<typeof buildExceptionsReport>>): Promise<Buffer> {
  const blocks: PdfBlock[] = [
    { kind: "heading", text: "System Exceptions & Bottlenecks" },
    {
      kind: "kv",
      rows: [
        ["Stale Leads (> 24 h)", data.counts.staleLeads],
        ["Holds Expiring (< 12 h)", data.counts.holdsExpiring],
        ["Overdue Proof Slots", data.counts.overdueProofs],
        ["Overdue Invoices", data.counts.unpaidInvoices],
        ["Vendor Payables Due", data.counts.payablesDue],
        ["Open Issues Past SLA", data.counts.openIssues],
        ["Expired Quotes", data.counts.expiredQuotes],
      ],
    },
    { kind: "heading", text: "Overdue Proofs" },
    {
      kind: "table",
      head: ["WO ID", "Media ID", "Due Date"],
      rows: data.overdueProofs.length
        ? data.overdueProofs.slice(0, 15).map((p) => [p.workOrderId, p.inventoryId, p.dueDate.toISOString().slice(0, 10)])
        : [["No overdue proofs", "", ""]],
    },
    { kind: "heading", text: "Overdue Invoices" },
    {
      kind: "table",
      head: ["Invoice", "Booking", "Total", "Due Date"],
      rows: data.unpaidInvoices.length
        ? data.unpaidInvoices.slice(0, 15).map((i) => [i.invoiceId, i.bookingId, pdfMoney(i.total), i.dueDate.toISOString().slice(0, 10)])
        : [["No overdue invoices", "", "", ""]],
    },
  ];
  return renderPdf("Platform Exceptions Report", `Generated ${data.generatedAt}`, blocks);
}
