import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, FileText, Inbox, ReceiptIndianRupee, UserRound } from "lucide-react";
import { ClientHeading, MyInquiries } from "@/components/app/client/MyInquiries";
import { MyBookings, MyQuotations } from "@/components/app/client/QuotesBookings";
import { ClientPayments } from "@/components/app/FinanceCards";
import { ClientProfileCard } from "@/components/app/client/ClientProfileCard";
import { WorkspaceShell, type NavItem } from "@/components/app/WorkspaceShell";
import { Stats } from "@/components/app/kit";
import { useMyLeads } from "@/lib/marketplace-api";
import { useMyBookings, useMyQuotes } from "@/lib/deals-api";
import { useMyPayments } from "@/lib/finance-api";

const CLIENT_TABS = ["inquiries", "quotations", "bookings", "payments", "profile"] as const;
type ClientTab = (typeof CLIENT_TABS)[number];

export const Route = createFileRoute("/client")({
  validateSearch: (s: Record<string, unknown>): { tab?: ClientTab | undefined } =>
    CLIENT_TABS.includes(s["tab"] as ClientTab) ? { tab: s["tab"] as ClientTab } : {},
  head: () => ({
    meta: [
      { title: "Client Portal — OOHRENA" },
      {
        name: "description",
        content: "Your inquiries, quotations, bookings and verified proof of display.",
      },
      { property: "og:title", content: "Client Portal — OOHRENA" },
      {
        property: "og:description",
        content: "Track every campaign with verified proof of display.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientPortal,
});

const NAV: { tab: ClientTab; label: string; icon: NavItem["icon"] }[] = [
  { tab: "inquiries", label: "Inquiries", icon: Inbox },
  { tab: "quotations", label: "Quotations", icon: FileText },
  { tab: "bookings", label: "Bookings", icon: CalendarCheck },
  { tab: "payments", label: "Payments", icon: ReceiptIndianRupee },
];

/** Everything here is the signed-in client's own data from the API. */
function ClientPortal() {
  const { tab = "inquiries" } = Route.useSearch();
  const item = (t: ClientTab, label: string, icon: NavItem["icon"]): NavItem => ({
    id: t,
    label,
    icon,
    to: "/client",
    search: t === "inquiries" ? {} : { tab: t },
    active: tab === t,
  });

  return (
    <WorkspaceShell
      label="Client"
      groups={[
        { items: NAV.map((n) => item(n.tab, n.label, n.icon)) },
        { label: "Account", items: [item("profile", "Profile", UserRound)] },
      ]}
    >
      <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
        <ClientHeading />
        {tab !== "profile" && <ClientSummary />}
        {tab === "inquiries" && <MyInquiries />}
        {tab === "quotations" && <MyQuotations />}
        {tab === "bookings" && <MyBookings />}
        {tab === "payments" && <ClientPayments />}
        {tab === "profile" && <ClientProfileCard />}
      </div>
    </WorkspaceShell>
  );
}

/** Counts only; every amount stays on the server-computed invoice rows. */
function ClientSummary() {
  const leads = useMyLeads();
  const quotes = useMyQuotes();
  const bookings = useMyBookings();
  const pay = useMyPayments();
  const n = (ready: boolean, v: number) => (ready ? v : "–");
  const toReview = (quotes.data ?? []).filter((q) => q.status === "released").length;
  return (
    <Stats
      items={[
        {
          label: "Open inquiries",
          value: n(
            !!leads.data,
            (leads.data ?? []).filter((l) => !["won", "lost", "closed"].includes(l.status)).length,
          ),
        },
        {
          label: "Quotes to review",
          value: n(!!quotes.data, toReview),
          tone: toReview ? "hold" : undefined,
        },
        {
          label: "Active bookings",
          value: n(
            !!bookings.data,
            (bookings.data ?? []).filter((b) => b.status === "confirmed" || b.status === "live")
              .length,
          ),
        },
        {
          label: "Invoices to pay",
          value: n(
            !!pay.data,
            (pay.data?.invoices ?? []).filter(
              (i) => i.status === "issued" || i.status === "partially_paid",
            ).length,
          ),
        },
      ]}
    />
  );
}
