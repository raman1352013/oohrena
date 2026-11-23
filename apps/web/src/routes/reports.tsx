import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download } from "lucide-react";
import { inr } from "@/lib/format";
import { useCurrentUser } from "@/lib/auth";
import { AdminShell } from "@/components/app/admin/AdminShell";
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
import { Btn, Empty, KCard, Loading, Pill, Stats, Tabs } from "@/components/app/kit";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [{ title: "Reports — OOHRENA" }],
  }),
  component: ReportsScreen,
});

type AdminTab = "funnel" | "revenue" | "exceptions" | "vendors" | "audit";

const ADMIN_TABS = [
  { id: "funnel", label: "Funnel" },
  { id: "revenue", label: "Revenue" },
  { id: "exceptions", label: "Exceptions" },
  { id: "vendors", label: "Vendors" },
  { id: "audit", label: "Audit log" },
] as const;

const pageCls = "max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5";

/** PDF + CSV links for one report. */
function Downloads({ pdf, csv }: { pdf: string; csv: string }) {
  return (
    <div className="flex gap-2">
      {(
        [
          ["PDF", pdf],
          ["CSV", csv],
        ] as const
      ).map(([label, href]) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="h-9 px-3 rounded-lg border border-line bg-card text-ink hover:bg-canvas text-[13px] font-semibold inline-flex items-center gap-1.5"
        >
          <Download size={13} /> {label}
        </a>
      ))}
    </div>
  );
}

const reportLinks = (report: string) => ({
  pdf: reportDownloadUrl(report, "pdf"),
  csv: reportDownloadUrl(report, "csv"),
});

function ReportsScreen() {
  const session = useCurrentUser();
  const role = session.data?.role;

  // AuthGate only renders this page for signed-in users; wait for the role before choosing a view.
  if (!role) return <Loading />;
  if (role === "client") {
    return <ClientReportsView />;
  }
  if (role === "vendor") {
    return <VendorReportsView />;
  }
  if (role === "growth_partner") {
    return (
      <main className={pageCls}>
        <h1 className="text-[22px] font-semibold">Reports</h1>
        <KCard>
          <Empty title="No reports for partners" />
        </KCard>
      </main>
    );
  }
  return role === "admin" ? (
    <AdminShell tab="inbox">
      <AdminReportsView />
    </AdminShell>
  ) : (
    <AdminReportsView />
  );
}

/* ========================================================================== */
/* Client View: Own Campaigns & Dossiers                                      */
/* ========================================================================== */

function ClientReportsView() {
  const bookings = useMyBookings();

  return (
    <main className={pageCls}>
      <h1 className="text-[22px] font-semibold">Reports</h1>

      <KCard title="Campaigns" bodyClass="divide-y divide-line">
        {bookings.isPending ? (
          <Loading />
        ) : bookings.isError ? (
          <div role="alert" className="p-8 text-center text-destructive text-[13px]">
            {bookings.error.message}
          </div>
        ) : !bookings.data?.length ? (
          <Empty title="No campaigns" />
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
                      href={`/print/dossier/${b.campaignId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="h-9 px-3 text-[13px] font-semibold text-mute hover:text-ink inline-flex items-center"
                    >
                      Open
                    </a>
                    <Downloads
                      pdf={assetUrl(`/api/v1/reports/client-campaign/${b.campaignId}?format=pdf`)}
                      csv={assetUrl(`/api/v1/reports/client-campaign/${b.campaignId}?format=csv`)}
                    />
                  </>
                ) : (
                  <Pill>Not started</Pill>
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
    <main className={pageCls}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold">Performance</h1>
        <Downloads {...reportLinks("vendor-performance")} />
      </div>

      {perf.isPending ? (
        <Loading />
      ) : !row ? (
        <KCard>
          <Empty title="No performance data" />
        </KCard>
      ) : (
        <Stats
          items={[
            { label: "Proofs on time", value: `${row.proofTimelinessPct}%` },
            {
              label: "Proofs rejected",
              value: `${row.proofRejectionRatePct}%`,
              tone: row.proofRejectionRatePct > 10 ? "danger" : undefined,
            },
            {
              label: "Hold response",
              value: row.holdResponseTimeMin !== null ? `${row.holdResponseTimeMin} min` : "—",
            },
            {
              label: "Work orders done",
              value: `${row.workOrdersCompleted} / ${row.workOrdersTotal}`,
            },
          ]}
        />
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
    <main className={pageCls}>
      <h1 className="text-[22px] font-semibold">Reports</h1>
      <Tabs tabs={ADMIN_TABS} value={tab} onChange={setTab} />

      {tab === "funnel" && <FunnelReportTab />}
      {tab === "revenue" && <RevenueReportTab />}
      {tab === "exceptions" && <ExceptionsReportTab />}
      {tab === "vendors" && <VendorPerformanceTab />}
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
      <div className="flex justify-end">
        <Downloads {...reportLinks("funnel")} />
      </div>

      {funnel.isPending ? (
        <Loading />
      ) : !d ? (
        <Empty title="No funnel data" />
      ) : (
        <>
          <Stats
            items={[
              { label: "Inquiries", value: d.totalLeads },
              { label: "Quoted", value: d.quotedLeads },
              { label: "Won", value: d.wonLeads, tone: "verified" },
              { label: "Completed", value: d.completedLeads },
              { label: "Win rate", value: `${d.conversion.overallWonPct}%` },
            ]}
          />

          <KCard title="By source" bodyClass="overflow-x-auto">
            {!d.bySource.length ? (
              <Empty title="No inquiries" />
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-mute text-[12px]">
                    <th className="py-2.5 px-4">Source</th>
                    <th>Inquiries</th>
                    <th>Quoted</th>
                    <th>Won</th>
                    <th>Completed</th>
                    <th>Win rate</th>
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
            )}
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
      <div className="flex justify-end">
        <Downloads {...reportLinks("revenue")} />
      </div>

      {rev.isPending ? (
        <Loading />
      ) : !d ? (
        <Empty title="No revenue recorded" />
      ) : (
        <>
          <Stats
            items={[
              { label: "Booking value", value: inr(d.bookingValue) },
              { label: "Service fee", value: inr(d.serviceFee) },
              { label: "Commission", value: inr(d.commission) },
              { label: "Received (verified)", value: inr(d.received) },
              { label: "Refunded", value: inr(d.refunds) },
              { label: "Net GST", value: inr(d.netGst) },
            ]}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KCard title="By month" bodyClass="overflow-x-auto">
              {!d.byMonth.length ? (
                <Empty title="No bookings" />
              ) : (
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
              )}
            </KCard>

            <KCard title="By city" bodyClass="overflow-x-auto">
              {!d.byCity.length ? (
                <Empty title="No bookings" />
              ) : (
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-mute text-[12px]">
                      <th className="py-2 px-3">City</th>
                      <th>Sites</th>
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
              )}
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
      <div className="flex justify-end">
        <Downloads {...reportLinks("exceptions")} />
      </div>

      {ex.isPending ? (
        <Loading />
      ) : !d ? (
        <Empty title="No exceptions data" />
      ) : (
        <div className="space-y-4">
          <Stats
            items={[
              {
                label: "Inquiries older than 24h",
                value: d.counts.staleLeads,
                tone: d.counts.staleLeads ? "danger" : undefined,
              },
              {
                label: "Overdue proofs",
                value: d.counts.overdueProofs,
                tone: d.counts.overdueProofs ? "danger" : undefined,
              },
              {
                label: "Overdue invoices",
                value: d.counts.unpaidInvoices,
                tone: d.counts.unpaidInvoices ? "danger" : undefined,
              },
              { label: "Holds expiring", value: d.counts.holdsExpiring },
            ]}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KCard title="Overdue proofs" bodyClass="">
              {!d.overdueProofs.length ? (
                <Empty title="No overdue proofs" />
              ) : (
                <div className="divide-y divide-line text-[13px]">
                  {d.overdueProofs.slice(0, 10).map((p) => (
                    <div key={p.scheduleId} className="px-5 py-3 flex justify-between gap-3">
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

            <KCard title="Overdue invoices" bodyClass="">
              {!d.unpaidInvoices.length ? (
                <Empty title="No overdue invoices" />
              ) : (
                <div className="divide-y divide-line text-[13px]">
                  {d.unpaidInvoices.slice(0, 10).map((i) => (
                    <div key={i.invoiceId} className="px-5 py-3 flex justify-between gap-3">
                      <div>
                        <span className="font-mono">{i.invoiceId}</span> · {i.bookingId}
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
      <div className="flex justify-end">
        <Downloads {...reportLinks("vendor-performance")} />
      </div>

      <KCard bodyClass="">
        {perf.isPending ? (
          <Loading />
        ) : !rows.length ? (
          <Empty title="No vendors" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-mute text-[12px]">
                  <th className="py-2.5 px-4">Vendor</th>
                  <th>City</th>
                  <th>Hold response</th>
                  <th>Proofs on time</th>
                  <th>Proofs rejected</th>
                  <th>Issues</th>
                  <th>Work orders done</th>
                  <th>Listings approved / rejected</th>
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
                    <td>
                      {r.workOrdersCompleted} / {r.workOrdersTotal}
                    </td>
                    <td>
                      {r.listingsApproved} / {r.listingsRejected}
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
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["Action", action, setAction],
            ["Entity", entity, setEntity],
            ["User ID", userId, setUserId],
          ] as const
        ).map(([label, value, set]) => (
          <Input
            key={label}
            aria-label={label}
            placeholder={label}
            value={value}
            onChange={(e) => {
              set(e.target.value);
              setPage(1);
            }}
            className="h-9 w-full sm:w-44 bg-card"
          />
        ))}
        <div className="sm:ml-auto">
          <Downloads pdf={exportUrl("pdf")} csv={exportUrl("csv")} />
        </div>
      </div>

      <KCard bodyClass="">
        {logs.isPending ? (
          <Loading />
        ) : !logs.data?.items.length ? (
          <Empty title="No audit records" />
        ) : (
          <div className="divide-y divide-line text-[13px]">
            {logs.data.items.map((i) => (
              <div
                key={i.logId}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-2"
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
                    {i.userId ?? "system"}
                    {i.ip && ` · ${i.ip}`}
                    {i.reason && ` · “${i.reason}”`}
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
