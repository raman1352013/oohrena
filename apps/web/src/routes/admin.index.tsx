import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import type { LeadStatus } from "@oohrena/shared";
import { fmtDate, inr } from "@/lib/format";
import { useAdminBookings, useDashboard, useInbox } from "@/lib/deals-api";
import { useAdminInventory, useAdminVendors } from "@/lib/inventory-api";
import { cn } from "@/lib/utils";
import { Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { IssueTracker, ProofQueue } from "@/components/app/admin/ExecutionQueues";
import { ListingReviewQueue, VendorKycQueue } from "@/components/app/admin/ReviewQueues";
import { NewLeadDialog } from "@/components/app/admin/NewLeadDialog";
import { UserManagement } from "@/components/app/admin/UserManagement";
import { SystemOverview } from "@/components/app/admin/SystemOverview";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Central Control Tower — OOHRENA" },
      {
        name: "description",
        content: "Central inquiry inbox, vendor assignment, quotations, bookings and approvals.",
      },
    ],
  }),
  component: AdminTower,
});

type Tab = "inbox" | "bookings" | "proofs" | "issues" | "vendors" | "users" | "system";
const STATUS_TABS: { id: LeadStatus | undefined; label: string }[] = [
  { id: "new", label: "New" },
  { id: "under_review", label: "Under review" },
  { id: "assigned", label: "Assigned" },
  { id: "quoted", label: "Quoted" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: undefined, label: "All" },
];
const LEAD_TONE: Record<string, "neutral" | "hold" | "saffron" | "verified" | "danger"> = {
  new: "saffron",
  under_review: "hold",
  assigned: "hold",
  quoted: "saffron",
  won: "verified",
  lost: "danger",
  closed: "neutral",
};
const age = (d: string) => {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

function AdminTower() {
  const [tab, setTab] = useState<Tab>("inbox");
  const dash = useDashboard();
  const kyc = useAdminVendors("pending");
  const listings = useAdminInventory("pending");
  const d = dash.data;
  const kpis: { k: string; v: number | string; sub?: string | undefined }[] = [
    // Pending KYC/listing approvals are counted on their own tab.
    {
      k: "New inquiries",
      v: d?.leads.new ?? (d ? 0 : "—"),
      sub: d?.exceptions.staleLeads ? `${d.exceptions.staleLeads} older than 24h` : undefined,
    },
    { k: "In progress", v: d ? (d.leads.under_review ?? 0) + (d.leads.assigned ?? 0) : "—" },
    {
      k: "Quotes with clients",
      v: d?.quotesAwaitingClient ?? "—",
      sub: d?.exceptions.expiredQuotes ? `${d.exceptions.expiredQuotes} expired` : undefined,
    },
    {
      k: "Active bookings",
      v: d ? (d.bookings.confirmed ?? 0) + (d.bookings.live ?? 0) : "—",
      sub: d?.approvedQuotesWithoutBooking
        ? `${d.approvedQuotesWithoutBooking} approved, not booked`
        : undefined,
    },
    {
      k: "Active holds",
      v: d?.activeHolds ?? "—",
      sub: d?.pendingVendorConfirmations
        ? `${d.pendingVendorConfirmations} awaiting vendor`
        : d?.exceptions.holdsExpiringSoon
          ? `${d.exceptions.holdsExpiringSoon} expire within 12h`
          : undefined,
    },
    {
      k: "Proofs to verify",
      v: d?.proofsToVerify ?? "—",
      sub: d?.exceptions.overdueProofs
        ? `${d.exceptions.overdueProofs} overdue`
        : d?.openIssues
          ? `${d.openIssues} open issues`
          : undefined,
    },
  ];
  const tabs: { id: Tab; label: string; n?: number | undefined }[] = [
    { id: "inbox", label: "Inquiry inbox", n: d ? (d.leads.new ?? 0) : undefined },
    {
      id: "bookings",
      label: "Bookings",
      n: d ? (d.bookings.confirmed ?? 0) + (d.bookings.live ?? 0) : undefined,
    },
    { id: "proofs", label: "Proof verification", n: d?.proofsToVerify },
    { id: "issues", label: "Issues", n: d?.openIssues },
    {
      id: "vendors",
      label: "Vendor KYC & Listings",
      n: (kyc.data?.total ?? 0) + (listings.data?.total ?? 0),
    },
    { id: "users", label: "User Management" },
    { id: "system", label: "System Health & Deployments" },
  ];

  return (
    <main className="max-w-[1280px] mx-auto p-4 md:p-6 space-y-5">
      <div className="bg-card border border-line rounded-xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-line overflow-hidden">
        {kpis.map((x) => (
          <div key={x.k} className="p-4 border-b lg:border-b-0 border-line">
            <div className="text-[12px] text-mute">{x.k}</div>
            <div className="text-2xl font-bold mt-2">{x.v}</div>
            {x.sub && <div className="text-[11px] text-saffron-deep mt-1">{x.sub}</div>}
          </div>
        ))}
      </div>

      <nav className="flex gap-6 border-b border-line text-[13px] overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "pt-1 pb-2.5 border-b-2 whitespace-nowrap flex items-center gap-1.5",
              tab === t.id ? "border-navy text-ink font-semibold" : "border-transparent text-mute",
            )}
          >
            {t.label}
            {t.n !== undefined && (
              <span
                className={cn(
                  "px-1.5 rounded text-[11px]",
                  tab === t.id && "bg-navy text-navy-foreground",
                )}
              >
                {t.n}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === "inbox" && <Inbox />}
      {tab === "bookings" && <Bookings />}
      {tab === "vendors" && (
        <>
          <VendorKycQueue />
          <ListingReviewQueue />
        </>
      )}
      {tab === "proofs" && <ProofQueue />}
      {tab === "issues" && <IssueTracker />}
      {tab === "users" && <UserManagement />}
      {tab === "system" && <SystemOverview />}
      <Link to="/reports">
        <Btn variant="secondary">Reports & activity</Btn>
      </Link>
    </main>
  );
}

function Inbox() {
  const [status, setStatus] = useState<LeadStatus | undefined>("new");
  const [adding, setAdding] = useState(false);
  const inbox = useInbox(status);
  return (
    <KCard
      title="Central inquiry inbox"
      bodyClass=""
      right={
        <>
          <div className="flex flex-wrap gap-1 text-[12px]">
            {STATUS_TABS.map((s) => (
              <button
                key={s.label}
                onClick={() => setStatus(s.id)}
                className={cn(
                  "px-2.5 h-7 rounded-md",
                  status === s.id
                    ? "bg-navy text-navy-foreground font-semibold"
                    : "text-mute hover:text-ink",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Btn className="h-8 px-3 text-[12px]" onClick={() => setAdding(true)}>
            Log phone / WhatsApp lead
          </Btn>
        </>
      }
    >
      {inbox.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Loading inquiries…</div>
      ) : inbox.isError ? (
        <div className="p-8 text-center text-destructive text-[13px]">{inbox.error.message}</div>
      ) : !inbox.data.items.length ? (
        <Empty
          title={status === "new" ? "No new inquiries" : "Nothing in this view"}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[880px]">
            <thead>
              <tr className="text-left text-[12px] text-mute border-b border-line">
                {[
                  "Lead ID",
                  "Client",
                  "Requirement",
                  "Dates",
                  "Budget",
                  "Source",
                  "Status",
                  "Received",
                ].map((h) => (
                  <th key={h} className="font-normal px-4 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inbox.data.items.map((l) => (
                <tr key={l.leadId} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                    <Link
                      to="/admin/leads/$leadId"
                      params={{ leadId: l.leadId }}
                      className="text-saffron-deep hover:underline"
                    >
                      {l.leadId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{l.contact?.company ?? "—"}</div>
                    <div className="text-[12px] text-mute">{l.contact?.name}</div>
                  </td>
                  <td className="px-4 py-3 max-w-72">
                    <div className="line-clamp-2">{l.requirement}</div>
                    <div className="text-[11px] text-mute font-mono">
                      {l.inventoryIds.join(", ") || l.city}
                    </div>
                    {l.possibleDuplicates.length > 0 && (
                      <Pill tone="hold" className="mt-1">
                        Possible duplicate
                      </Pill>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12px]">
                    {l.from}
                    <br />
                    {l.to}
                  </td>
                  <td className="px-4 py-3">{l.budget ? inr(l.budget) : "—"}</td>
                  <td className="px-4 py-3">
                    <Pill>{l.source.replace("_", " ")}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={LEAD_TONE[l.status] ?? "neutral"}>
                      {l.status.replace("_", " ")}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-mute whitespace-nowrap">
                    {age(l.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewLeadDialog open={adding} onClose={() => setAdding(false)} />
    </KCard>
  );
}

function Bookings() {
  const b = useAdminBookings();
  return (
    <KCard title="Bookings" bodyClass="divide-y divide-line">
      {b.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Loading…</div>
      ) : !b.data?.length ? (
        <Empty
          title="No bookings yet"
        />
      ) : (
        b.data.map((x) => (
          <div
            key={x.bookingId}
            className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]"
          >
            <span className="font-mono text-[12px] w-36">{x.bookingId}</span>
            <Link
              to="/admin/leads/$leadId"
              params={{ leadId: x.leadId }}
              className="font-mono text-[12px] text-saffron-deep hover:underline"
            >
              {x.leadId}
            </Link>
            <span className="flex-1 min-w-48">{x.items.map((i) => i.title).join(", ")}</span>
            <span className="text-mute">
              {x.start} → {x.end}
            </span>
            <span className="font-semibold">{inr(x.total)}</span>
            <Pill
              tone={
                x.status === "cancelled"
                  ? "danger"
                  : x.status === "confirmed"
                    ? "verified"
                    : "neutral"
              }
            >
              {x.status}
            </Pill>
            <span className="text-[12px] text-mute">{fmtDate(x.createdAt)}</span>
          </div>
        ))
      )}
    </KCard>
  );
}
