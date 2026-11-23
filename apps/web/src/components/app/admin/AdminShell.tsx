import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarCheck,
  CircleAlert,
  Images,
  Inbox,
  Megaphone,
  Plus,
  Server,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useDashboard } from "@/lib/deals-api";
import { useAdminInventory, useAdminVendors } from "@/lib/inventory-api";
import { cn } from "@/lib/utils";
import { NewLeadDialog } from "./NewLeadDialog";

export const ADMIN_TABS = [
  "inbox",
  "bookings",
  "campaigns",
  "proofs",
  "issues",
  "vendors",
  "users",
  "system",
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

type Item = { tab: AdminTab; label: string; icon: LucideIcon; n?: number | undefined };

/** Admin layout: sidebar on desktop, a scrolling row on phones. The open section lives in the URL. */
export function AdminShell({ tab, children }: { tab: AdminTab; children: ReactNode }) {
  const d = useDashboard().data;
  const kyc = useAdminVendors("pending").data;
  const listings = useAdminInventory("pending").data;
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onReports = path.startsWith("/reports");
  const [adding, setAdding] = useState(false);

  const work: Item[] = [
    { tab: "inbox", label: "Inbox", icon: Inbox, n: d?.leads.new },
    {
      tab: "bookings",
      label: "Bookings",
      icon: CalendarCheck,
      n: d && (d.bookings.confirmed ?? 0) + (d.bookings.live ?? 0),
    },
    { tab: "campaigns", label: "Campaigns", icon: Megaphone },
    { tab: "proofs", label: "Proofs", icon: Images, n: d?.proofsToVerify },
    { tab: "issues", label: "Issues", icon: CircleAlert, n: d?.openIssues },
    {
      tab: "vendors",
      label: "Vendors",
      icon: Store,
      n: (kyc?.total ?? 0) + (listings?.total ?? 0),
    },
  ];
  const manage: Item[] = [
    { tab: "users", label: "Users", icon: Users },
    { tab: "system", label: "System", icon: Server },
  ];
  const all = [...work, ...manage];

  const item = (x: Item, compact = false) => {
    const active = !onReports && tab === x.tab;
    return (
      <Link
        key={x.tab}
        to="/admin"
        search={x.tab === "inbox" ? {} : { tab: x.tab }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg text-[13px] transition-colors whitespace-nowrap",
          compact ? "h-9 px-3 shrink-0" : "h-9 px-2.5",
          active
            ? "bg-card text-ink font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-line"
            : "text-mute hover:text-ink hover:bg-card/70",
        )}
      >
        <x.icon size={16} strokeWidth={1.75} className={active ? "text-saffron-deep" : ""} />
        {x.label}
        {!!x.n && (
          <span
            className={cn(
              "ml-auto pl-2 text-[12px] tabular-nums",
              active ? "text-ink" : "text-mute group-hover:text-ink",
            )}
          >
            {x.n}
          </span>
        )}
      </Link>
    );
  };

  const reports = (compact = false) => (
    <Link
      to="/reports"
      aria-current={onReports ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg text-[13px] h-9 transition-colors whitespace-nowrap",
        compact ? "px-3 shrink-0" : "px-2.5",
        onReports
          ? "bg-card text-ink font-semibold ring-1 ring-line"
          : "text-mute hover:text-ink hover:bg-card/70",
      )}
    >
      <BarChart3 size={16} strokeWidth={1.75} className={onReports ? "text-saffron-deep" : ""} />
      Reports
    </Link>
  );

  return (
    <div className="md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="no-print hidden md:flex flex-col sticky top-14 h-[calc(100vh-3.5rem)] border-r border-line px-3 py-4 gap-1">
        <button
          onClick={() => setAdding(true)}
          className="mb-3 h-9 px-2.5 rounded-lg bg-navy text-navy-foreground text-[13px] font-semibold flex items-center gap-2 hover:bg-navy/90 transition-colors"
        >
          <Plus size={16} strokeWidth={2} />
          Log inquiry
        </button>
        <nav aria-label="Admin" className="space-y-0.5">
          {work.map((x) => item(x))}
        </nav>
        <div className="my-3 border-t border-line" />
        <nav aria-label="Manage" className="space-y-0.5">
          {manage.map((x) => item(x))}
          {reports()}
        </nav>
      </aside>

      <div className="min-w-0">
        <nav
          aria-label="Admin"
          className="no-print md:hidden flex gap-1 overflow-x-auto px-4 pt-4 pb-1 [scrollbar-width:none]"
        >
          <button
            onClick={() => setAdding(true)}
            aria-label="Log inquiry"
            className="h-9 w-9 shrink-0 rounded-lg bg-navy text-navy-foreground grid place-items-center"
          >
            <Plus size={16} />
          </button>
          {all.map((x) => item(x, true))}
          {reports(true)}
        </nav>
        {children}
      </div>

      <NewLeadDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
