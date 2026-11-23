import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, AlertTriangle, Filter, Search } from "lucide-react";
import { inr } from "@/lib/format";
import { useCurrentUser } from "@/lib/auth";
import { useMyBookings } from "@/lib/deals-api";
import {
  reportDownloadUrl,
  useAuditLogs,
  useExceptionsReport,
  useFunnelReport,
  useRevenueReport,
  useVendorPerformance,
} from "@/lib/reports-api";
import { assetUrl } from "@/lib/api";
import { Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics — OOHRENA" },
      {
        name: "description",
        content:
          "Certified campaign reports, vendor performance, funnel conversion and revenue analytics.",
      },
      { property: "og:title", content: "Reports & Analytics — OOHRENA" },
      { property: "og:description", content: "Traceable reporting backed by append-only records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsScreen,
});

type AdminTab = "funnel" | "revenue" | "exceptions" | "vendor-performance" | "audit";

function ReportsScreen() {
  const session = useCurrentUser();
  const role = session.data?.role;

  // AuthGate only renders this page for signed-in users; wait for the role before choosing a view.
  if (!role) {
    return (
      <main className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 text-mute text-[13px]">
        Loading reports…
      </main>
    );
  }
  if (role === "client") {
    return <ClientReportsView />;
  }
  if (role === "vendor") {
    return <VendorReportsView />;
  }
  if (role === "growth_partner") {
    return (
      <main className="max-w-[1216px] mx-auto px-4 md:px-8 py-6">
        <KCard title="Reports">
          <Empty
            title="Your referral report lives in the partner portal"
          />
        </KCard>
      </main>
    );
  }
  return <AdminReportsView />;
}

/* ========================================================================== */
/* Client View: Own Campaigns & Dossiers                                      */
/* ========================================================================== */

function ClientReportsView() {
  const bookings = useMyBookings();

  return (
    <main className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <h1 className="text-2xl font-semibold">Reports</h1>

      <KCard title="Campaigns" bodyClass="divide-y divide-line">
        {bookings.isPending ? (
          <div className="p-8 text-center text-mute text-[13px]">
            Loading your campaign records…
          </div>
        ) : bookings.isError ? (
          <div className="p-8 text-center text-destructive text-[13px]">
            {bookings.error.message}
          </div>
        ) : !bookings.data?.length ? (
          <Empty
            title="No bookings found"
          />
        ) : (
          bookings.data.map((b) => (
            <div
              key={b.bookingId}
              className="p-5 flex flex-wrap items-center justify-between gap-4 text-[13px]"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{b.bookingId}</span>
                  <Pill
                    tone={
                      b.status === "completed"
                        ? "verified"
                        : b.status === "cancelled"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {b.status}
                  </Pill>
                </div>
                <div className="text-mute">
                  {b.items.map((i) => i.title).join(", ")} · {b.start} → {b.end}
                </div>
                <div className="font-semibold">{inr(b.total)}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {b.campaignId ? (
                  <>
                    <a
                      href={assetUrl(`/api/v1/reports/client-campaign/${b.campaignId}?format=pdf`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Btn variant="primary" className="h-8 px-3 text-[12px] gap-1.5">
                        <Download size={13} /> Dossier (PDF)
                      </Btn>
                    </a>
                    <a
                      href={assetUrl(`/api/v1/reports/client-campaign/${b.campaignId}?format=csv`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Btn variant="secondary" className="h-8 px-3 text-[12px] gap-1.5">
                        <Download size={13} /> CSV
                      </Btn>
                    </a>
                    <a href={`/print/dossier/${b.campaignId}`} target="_blank" rel="noreferrer">
                      <Btn variant="ghost" className="h-8 px-3 text-[12px]">
                        View Online
                      </Btn>
                    </a>
                  </>
                ) : (
                  <span className="text-mute text-[12px]">Execution scheduled</span>
                )}
              </div>
            </div>
          ))
        )}
      </KCard>
    </main>
  );
}

/* ========================================================================== */
/* Vendor View: Own Performance & Proof Timeliness                            */
/* ========================================================================== */

function VendorReportsView() {
  const perf = useVendorPerformance();
  const row = perf.data?.[0];

  return (
    <main className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Performance</h1>
        <div className="flex gap-2">
          <a href={reportDownloadUrl("vendor-performance", "pdf")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-9 gap-1.5">
              <Download size={14} /> PDF Report
            </Btn>
          </a>
          <a href={reportDownloadUrl("vendor-performance", "csv")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-9 gap-1.5">
              <Download size={14} /> CSV
            </Btn>
          </a>
        </div>
      </div>

      {perf.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">
          Calculating your performance metrics…
        </div>
      ) : !row ? (
        <Empty
          title="No performance data recorded"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-5 border border-line rounded-lg bg-card space-y-1">
            <div className="text-[12px] text-mute">Proof Timeliness</div>
            <div className="text-2xl font-bold">{row.proofTimelinessPct}%</div>
            <div className="text-[11px] text-mute">Uploaded on or before due date</div>
          </div>
          <div className="p-5 border border-line rounded-lg bg-card space-y-1">
            <div className="text-[12px] text-mute">Rejection Rate</div>
            <div className="text-2xl font-bold text-destructive">{row.proofRejectionRatePct}%</div>
            <div className="text-[11px] text-mute">Rejected by admin quality control</div>
          </div>
          <div className="p-5 border border-line rounded-lg bg-card space-y-1">
            <div className="text-[12px] text-mute">Avg Hold Response</div>
            <div className="text-2xl font-bold">
              {row.holdResponseTimeMin !== null ? `${row.holdResponseTimeMin} min` : "N/A"}
            </div>
            <div className="text-[11px] text-mute">Hold confirmation response time</div>
          </div>
          <div className="p-5 border border-line rounded-lg bg-card space-y-1">
            <div className="text-[12px] text-mute">WO Completion Rate</div>
            <div className="text-2xl font-bold text-verified">{row.woCompletionRatePct}%</div>
            <div className="text-[11px] text-mute">
              {row.workOrdersCompleted} of {row.workOrdersTotal} completed
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ========================================================================== */
/* Admin & Finance View: Control Tower Reports & Audit Trail                  */
/* ========================================================================== */

function AdminReportsView() {
  const [tab, setTab] = useState<AdminTab>("funnel");

  return (
    <main className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
      </div>

      {/* Tabs bar */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-2">
        {(
          [
            ["funnel", "Inquiry Funnel"],
            ["revenue", "Revenue & Margins"],
            ["exceptions", "Exceptions & Bottlenecks"],
            ["vendor-performance", "Vendor Performance"],
            ["audit", "Audit Search & Export"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-[13px] rounded-md font-medium transition-colors ${
              tab === id
                ? "bg-navy text-navy-foreground font-semibold"
                : "text-mute hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "funnel" && <FunnelReportTab />}
      {tab === "revenue" && <RevenueReportTab />}
      {tab === "exceptions" && <ExceptionsReportTab />}
      {tab === "vendor-performance" && <VendorPerformanceTab />}
      {tab === "audit" && <AuditSearchTab />}
    </main>
  );
}

/* ---------- 1. Funnel Tab ---------- */
function FunnelReportTab() {
  const funnel = useFunnelReport();
  const d = funnel.data;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Campaign Funnel Analysis</h2>
        <div className="flex gap-2">
          <a href={reportDownloadUrl("funnel", "pdf")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> PDF
            </Btn>
          </a>
          <a href={reportDownloadUrl("funnel", "csv")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> CSV
            </Btn>
          </a>
        </div>
      </div>

      {funnel.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Aggregating inquiry funnel…</div>
      ) : !d ? (
        <Empty title="No funnel data" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Total Inquiries</div>
              <div className="text-2xl font-bold mt-1">{d.totalLeads}</div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Quoted Inquiries</div>
              <div className="text-2xl font-bold mt-1">{d.quotedLeads}</div>
              <div className="text-[11px] text-mute mt-0.5">
                {d.conversion.leadToQuotePct}% conversion
              </div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Won Bookings</div>
              <div className="text-2xl font-bold mt-1 text-verified">{d.wonLeads}</div>
              <div className="text-[11px] text-mute mt-0.5">
                {d.conversion.quoteToWonPct}% of quoted
              </div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Completed</div>
              <div className="text-2xl font-bold mt-1">{d.completedLeads}</div>
              <div className="text-[11px] text-mute mt-0.5">
                {d.conversion.overallWonPct}% win rate
              </div>
            </div>
          </div>

          <KCard title="Breakdown by Inquiry Source" bodyClass="divide-y divide-line">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-mute text-[12px]">
                  <th className="py-2.5 px-4">Source</th>
                  <th>Total Leads</th>
                  <th>Quoted</th>
                  <th>Won</th>
                  <th>Completed</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {d.bySource.map((s) => (
                  <tr key={s.source} className="border-b border-line">
                    <td className="py-2.5 px-4 font-semibold">{s.source}</td>
                    <td>{s.leads}</td>
                    <td>{s.quoted}</td>
                    <td className="text-verified font-medium">{s.won}</td>
                    <td>{s.completed}</td>
                    <td className="font-bold">{s.conversionPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </KCard>
        </>
      )}
    </div>
  );
}

/* ---------- 2. Revenue Tab ---------- */
function RevenueReportTab() {
  const rev = useRevenueReport();
  const d = rev.data;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Revenue, Margins & Cash Receipts</h2>
        <div className="flex gap-2">
          <a href={reportDownloadUrl("revenue", "pdf")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> PDF
            </Btn>
          </a>
          <a href={reportDownloadUrl("revenue", "csv")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> CSV
            </Btn>
          </a>
        </div>
      </div>

      {rev.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Calculating revenue breakdown…</div>
      ) : !d ? (
        <Empty title="No revenue recorded" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Booking Value</div>
              <div className="text-xl font-bold mt-1">{inr(d.bookingValue)}</div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Commission + Service Fee</div>
              <div className="text-xl font-bold mt-1 text-verified">
                {inr(d.commission + d.serviceFee)}
              </div>
              <div className="text-[11px] text-mute mt-0.5">
                Fee: {inr(d.serviceFee)} · Comm: {inr(d.commission)}
              </div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Verified Cash Received</div>
              <div className="text-xl font-bold mt-1">{inr(d.received)}</div>
              <div className="text-[11px] text-mute mt-0.5">Refunded: {inr(d.refunds)}</div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Net GST Position</div>
              <div className="text-xl font-bold mt-1">{inr(d.netGst)}</div>
              <div className="text-[11px] text-mute mt-0.5">
                Output: {inr(d.gstOutput)} · Input: {inr(d.gstInput)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KCard title="Monthly Revenue">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-mute text-[12px]">
                    <th className="py-2 px-3">Month</th>
                    <th>Value</th>
                    <th>Margin</th>
                    <th>GST</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byMonth.map((m) => (
                    <tr key={m.month} className="border-b border-line">
                      <td className="py-2 px-3 font-mono">{m.month}</td>
                      <td>{inr(m.bookingValue)}</td>
                      <td className="text-verified font-medium">
                        {inr(m.commission + m.serviceFee)}
                      </td>
                      <td>{inr(m.gst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </KCard>

            <KCard title="Top Cities by Booking Value">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-mute text-[12px]">
                    <th className="py-2 px-3">City</th>
                    <th>Sites Booked</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byCity.slice(0, 8).map((c) => (
                    <tr key={c.city} className="border-b border-line">
                      <td className="py-2 px-3 font-semibold">{c.city}</td>
                      <td>{c.count}</td>
                      <td>{inr(c.bookingValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </KCard>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 3. Exceptions Tab ---------- */
function ExceptionsReportTab() {
  const ex = useExceptionsReport();
  const d = ex.data;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Operational Exceptions & Bottlenecks</h2>
        <div className="flex gap-2">
          <a href={reportDownloadUrl("exceptions", "pdf")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> PDF
            </Btn>
          </a>
          <a href={reportDownloadUrl("exceptions", "csv")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> CSV
            </Btn>
          </a>
        </div>
      </div>

      {ex.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Scanning platform exceptions…</div>
      ) : !d ? (
        <Empty title="No exceptions data" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Stale Leads (&gt;24h)</div>
              <div className="text-xl font-bold text-destructive mt-1">{d.counts.staleLeads}</div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Overdue Proofs</div>
              <div className="text-xl font-bold text-destructive mt-1">
                {d.counts.overdueProofs}
              </div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Unpaid Invoices</div>
              <div className="text-xl font-bold text-destructive mt-1">
                {d.counts.unpaidInvoices}
              </div>
            </div>
            <div className="p-4 border border-line rounded-lg bg-card">
              <div className="text-[12px] text-mute">Holds Expiring Soon</div>
              <div className="text-xl font-bold mt-1">{d.counts.holdsExpiring}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KCard title={`Overdue Proof Slots (${d.overdueProofs.length})`}>
              {!d.overdueProofs.length ? (
                <Empty title="No overdue proofs" />
              ) : (
                <div className="divide-y divide-line text-[13px]">
                  {d.overdueProofs.slice(0, 10).map((p) => (
                    <div key={p.scheduleId} className="p-3 flex justify-between">
                      <div>
                        <span className="font-mono">{p.workOrderId}</span> · {p.inventoryId}
                      </div>
                      <span className="text-destructive font-medium">
                        Due {p.dueDate.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </KCard>

            <KCard title={`Unpaid & Overdue Invoices (${d.unpaidInvoices.length})`}>
              {!d.unpaidInvoices.length ? (
                <Empty title="No overdue invoices" />
              ) : (
                <div className="divide-y divide-line text-[13px]">
                  {d.unpaidInvoices.slice(0, 10).map((i) => (
                    <div key={i.invoiceId} className="p-3 flex justify-between">
                      <div>
                        <span className="font-mono">{i.invoiceId}</span> · Booking {i.bookingId}
                      </div>
                      <div>
                        <span className="font-semibold">{inr(i.total)}</span>
                        <span className="text-mute text-[11px] block text-right">
                          Due {i.dueDate.slice(0, 10)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </KCard>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 4. Vendor Performance Tab ---------- */
function VendorPerformanceTab() {
  const perf = useVendorPerformance();
  const rows = perf.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Media Partner Scorecards</h2>
        <div className="flex gap-2">
          <a href={reportDownloadUrl("vendor-performance", "pdf")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> PDF
            </Btn>
          </a>
          <a href={reportDownloadUrl("vendor-performance", "csv")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> CSV
            </Btn>
          </a>
        </div>
      </div>

      <KCard>
        {perf.isPending ? (
          <div className="p-8 text-center text-mute text-[13px]">Loading scorecard table…</div>
        ) : !rows.length ? (
          <Empty title="No vendors found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-mute text-[12px]">
                  <th className="py-2.5 px-4">Vendor</th>
                  <th>City</th>
                  <th>Hold Resp.</th>
                  <th>Proof Timeliness</th>
                  <th>Rejection %</th>
                  <th>Issues</th>
                  <th>WO Completion</th>
                  <th>Listings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.vendorId} className="border-b border-line">
                    <td className="py-2.5 px-4">
                      <div className="font-semibold">{r.legalName}</div>
                      <div className="font-mono text-[11px] text-mute">{r.vendorId}</div>
                    </td>
                    <td>{r.city}</td>
                    <td>{r.holdResponseTimeMin !== null ? `${r.holdResponseTimeMin} min` : "—"}</td>
                    <td className="font-medium">{r.proofTimelinessPct}%</td>
                    <td
                      className={r.proofRejectionRatePct > 10 ? "text-destructive font-medium" : ""}
                    >
                      {r.proofRejectionRatePct}%
                    </td>
                    <td>{r.issuesCount}</td>
                    <td className="font-semibold">
                      {r.woCompletionRatePct}% ({r.workOrdersCompleted}/{r.workOrdersTotal})
                    </td>
                    <td className="text-mute text-[12px]">
                      {r.listingsApproved} approved / {r.listingsRejected} rejected
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </KCard>
    </div>
  );
}

/* ---------- 5. Audit Search & Export Tab ---------- */
function AuditSearchTab() {
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);

  const logs = useAuditLogs({
    action: action.trim() || undefined,
    entity: entity.trim() || undefined,
    userId: userId.trim() || undefined,
    page,
    pageSize: 30,
  });

  const exportUrl = (fmt: "csv" | "pdf") => {
    const q = new URLSearchParams();
    q.set("format", fmt);
    if (action.trim()) q.set("action", action.trim());
    if (entity.trim()) q.set("entity", entity.trim());
    if (userId.trim()) q.set("userId", userId.trim());
    return assetUrl(`/api/v1/audit-logs?${q.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-lg font-semibold">Audit Trail Inspection</h2>
        <div className="flex gap-2">
          <a href={exportUrl("pdf")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> PDF Export
            </Btn>
          </a>
          <a href={exportUrl("csv")} target="_blank" rel="noreferrer">
            <Btn variant="secondary" className="h-8 text-[12px] gap-1">
              <Download size={13} /> CSV Export
            </Btn>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted p-3 rounded-lg">
        <Input
          placeholder="Filter by action (e.g. lead.create)"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
        <Input
          placeholder="Filter by entity (e.g. quote, booking)"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
        />
        <Input
          placeholder="Filter by User ID"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <KCard>
        {logs.isPending ? (
          <div className="p-8 text-center text-mute text-[13px]">Searching audit logs…</div>
        ) : !logs.data?.items.length ? (
          <Empty title="No matching audit records" />
        ) : (
          <div className="divide-y divide-line text-[13px]">
            {logs.data.items.map((i) => (
              <div
                key={i.logId}
                className="p-3.5 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{i.action}</span>
                    <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-mute">
                      {i.entity}:{i.entityId ?? "—"}
                    </span>
                    {i.role && <Pill>{i.role}</Pill>}
                  </div>
                  <div className="text-mute text-[12px]">
                    By {i.userId ?? "system"} {i.ip ? `from ${i.ip}` : ""}
                    {i.reason ? ` · Reason: “${i.reason}”` : ""}
                  </div>
                </div>
                <div className="font-mono text-mute text-[12px]">
                  {i.at.slice(0, 19).replace("T", " ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </KCard>
    </div>
  );
}
