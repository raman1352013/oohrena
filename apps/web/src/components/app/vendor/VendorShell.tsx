import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import {
  CalendarCheck,
  CreditCard,
  FileCheck,
  Inbox,
  Layers,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { VendorRole } from "@oohrena/shared";

export const VENDOR_TABS = [
  "overview",
  "inventory",
  "requests",
  "work-orders",
  "finance",
  "kyc",
  "team",
] as const;
export type VendorTab = (typeof VENDOR_TABS)[number];

type Item = {
  tab: VendorTab;
  label: string;
  icon: LucideIcon;
  n?: number | undefined;
  roles?: VendorRole[] | undefined;
};

interface VendorShellProps {
  tab: VendorTab;
  vendorRole: VendorRole;
  counts?: {
    inventory?: number | undefined;
    requests?: number | undefined;
    workOrders?: number | undefined;
    payables?: number | undefined;
  } | undefined;
  children: ReactNode;
}

/** Vendor layout: sidebar on desktop, a scrolling row on phones. Common with AdminShell. */
export function VendorShell({ tab, vendorRole, counts, children }: VendorShellProps) {
  const isOwner = vendorRole === "owner";
  const isManager = vendorRole === "manager";
  const isField = vendorRole === "field";
  const isAccounts = vendorRole === "accounts";

  const workItems: Item[] = [
    { tab: "overview", label: "Overview", icon: Store },
    ...((isOwner || isManager)
      ? [
          { tab: "inventory" as const, label: "Inventory", icon: Layers, n: counts?.inventory },
          { tab: "requests" as const, label: "Requests", icon: Inbox, n: counts?.requests },
        ]
      : []),
    ...(!isAccounts
      ? [{ tab: "work-orders" as const, label: "Work Orders", icon: CalendarCheck, n: counts?.workOrders }]
      : []),
  ];

  const manageItems: Item[] = [
    ...((isOwner || isAccounts)
      ? [{ tab: "finance" as const, label: "Finances", icon: CreditCard, n: counts?.payables }]
      : []),
    ...((isOwner || isManager)
      ? [
          { tab: "kyc" as const, label: "KYC & Profile", icon: FileCheck },
          { tab: "team" as const, label: "Team", icon: Users },
        ]
      : []),
  ];

  const all = [...workItems, ...manageItems];

  const renderItem = (x: Item, compact = false) => {
    const active = tab === x.tab;
    return (
      <Link
        key={x.tab}
        to="/vendor"
        search={x.tab === "overview" ? {} : { tab: x.tab }}
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

  return (
    <div className="md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="no-print hidden md:flex flex-col sticky top-14 h-[calc(100vh-3.5rem)] border-r border-line px-3 py-4 gap-1">
        <div className="px-2.5 py-1 text-[11px] font-semibold text-mute uppercase tracking-wider">
          Workspace
        </div>
        <nav aria-label="Vendor Workspace" className="space-y-0.5">
          {workItems.map((x) => renderItem(x))}
        </nav>
        {manageItems.length > 0 && (
          <>
            <div className="my-3 border-t border-line" />
            <div className="px-2.5 py-1 text-[11px] font-semibold text-mute uppercase tracking-wider">
              Management
            </div>
            <nav aria-label="Vendor Management" className="space-y-0.5">
              {manageItems.map((x) => renderItem(x))}
            </nav>
          </>
        )}
      </aside>

      <div className="min-w-0">
        <nav
          aria-label="Vendor Navigation"
          className="no-print md:hidden flex gap-1 overflow-x-auto px-4 pt-4 pb-1 [scrollbar-width:none] border-b border-line/60"
        >
          {all.map((x) => renderItem(x, true))}
        </nav>
        <div className="p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}
