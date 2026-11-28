import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Inbox,
  MapPin,
  Monitor,
  Plus,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useMyInventory } from "@/lib/inventory-api";
import { useMyWorkOrders } from "@/lib/deals-api";
import { useVendorRequests } from "@/lib/marketplace-api";
import { useVendorOverdue } from "@/lib/execution-api";
import { Empty, KCard, Loading, Pill } from "@/components/app/kit";
import { cn } from "@/lib/utils";

const OPEN_WO = ["scheduled", "installed", "inspection_due", "issue_raised"];
const today = () => new Date().toISOString().slice(0, 10);
const day = (s: string) => s.slice(0, 10);
const fmt = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/** Vendor overview: every number is counted from the vendor's own sites, work orders and holds. */
export function VendorDashboard({ showRequests }: { showRequests: boolean }) {
  const inv = useMyInventory();
  const wos = useMyWorkOrders();
  const reqs = useVendorRequests();
  const overdue = useVendorOverdue();

  if (inv.isPending || wos.isPending) return <Loading rows={4} />;
  if (inv.isError) return <div className="text-destructive text-[13px]">{inv.error.message}</div>;

  const sites = inv.data.items;
  const live = sites.filter((s) => s.status === "approved");
  const inReview = sites.filter((s) => s.status === "pending").length;
  const other = sites.length - live.length - inReview;

  const t = today();
  const openWos = (wos.data ?? []).filter((w) => OPEN_WO.includes(w.status));
  const bookedNow = new Set(
    openWos.flatMap((w) =>
      w.items.filter((i) => day(i.from) <= t && day(i.to) >= t).map((i) => i.inventoryId),
    ),
  );
  const booked = live.filter((s) => bookedNow.has(s.inventoryId)).length;
  const available = live.length - booked;

  const holds = (reqs.data ?? []).filter((r) => r.status === "pending").length;
  const late = overdue.data?.length ?? 0;

  // Sites by city
  const byCity = new Map<string, { live: number; booked: number }>();
  for (const s of live) {
    const c = byCity.get(s.city) ?? { live: 0, booked: 0 };
    c.live++;
    if (bookedNow.has(s.inventoryId)) c.booked++;
    byCity.set(s.city, c);
  }
  const cities = [...byCity.entries()].sort((a, b) => b[1].live - a[1].live).slice(0, 6);

  // Campaigns running now or starting later
  const upcoming = (wos.data ?? [])
    .filter((w) => OPEN_WO.includes(w.status))
    .map((w) => {
      const from = w.items.reduce((m, i) => (day(i.from) < m ? day(i.from) : m), "9999-12-31");
      const to = w.items.reduce((m, i) => (day(i.to) > m ? day(i.to) : m), "0000-01-01");
      return { w, from, to };
    })
    .filter((x) => x.to >= t)
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, 4);

  const donut = [
    { name: "Available", value: available, color: "var(--verified)" },
    { name: "Booked", value: booked, color: "var(--saffron)" },
    { name: "In review", value: inReview, color: "var(--navy)" },
    { name: "Draft / other", value: other, color: "var(--line)" },
  ];

  return (
    <div className="space-y-5">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Monitor} label="Total sites" value={sites.length} className="bg-navy text-white" />
        <Tile
          icon={CheckCircle2}
          label="Verified sites"
          value={live.length}
          className="bg-verified text-white"
        />
        <Tile
          icon={CalendarClock}
          label="Booked today"
          value={booked}
          className="bg-saffron text-white"
        />
        <Tile
          icon={MapPin}
          label="Available today"
          value={available}
          className="bg-card border border-line text-ink"
        />
      </div>

      {(holds > 0 || late > 0) && (
        <div className="flex flex-wrap gap-2">
          {holds > 0 && showRequests && (
            <Link to="/vendor" search={{ tab: "requests" }}>
              <Pill tone="hold">{holds} holds to confirm</Pill>
            </Link>
          )}
          {late > 0 && (
            <Link to="/vendor" search={{ tab: "work-orders" }}>
              <Pill tone="danger">
                <CircleAlert size={12} className="inline mr-1" />
                {late} proofs overdue
              </Pill>
            </Link>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Inventory overview */}
        <Panel title="Inventory">
          {sites.length === 0 ? (
            <Empty title="No sites" />
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative w-36 h-36 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={donut.filter((d) => d.value > 0)}
                      dataKey="value"
                      innerRadius="62%"
                      outerRadius="100%"
                      stroke="none"
                    >
                      {donut
                        .filter((d) => d.value > 0)
                        .map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">{sites.length}</div>
                    <div className="text-[11px] text-mute">Sites</div>
                  </div>
                </div>
              </div>
              <ul className="space-y-2 text-[13px] flex-1">
                {donut.map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                    <span className="flex-1">{d.name}</span>
                    <span className="tabular-nums font-medium">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* Sites by city */}
        <Panel
          title="Sites by city"
          link={<Link to="/vendor" search={{ tab: "inventory" }}>View all</Link>}
        >
          {cities.length === 0 ? (
            <Empty title="No verified sites" />
          ) : (
            <ul className="space-y-2.5 text-[13px]">
              {cities.map(([city, c]) => (
                <li key={city} className="flex items-center gap-2">
                  <MapPin size={14} className="text-saffron-deep shrink-0" />
                  <span className="flex-1 truncate">{city}</span>
                  <span className="rounded-md bg-verified-soft text-verified px-2 py-0.5 text-[12px] tabular-nums">
                    Available {c.live - c.booked}
                  </span>
                  <span className="rounded-md bg-hold-soft text-hold px-2 py-0.5 text-[12px] tabular-nums">
                    Booked {c.booked}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Upcoming campaigns */}
        <Panel
          title="Campaigns"
          link={<Link to="/vendor" search={{ tab: "work-orders" }}>View all</Link>}
        >
          {upcoming.length === 0 ? (
            <Empty title="No upcoming campaigns" />
          ) : (
            <ul className="space-y-3 text-[13px]">
              {upcoming.map(({ w, from, to }) => (
                <li key={w.workOrderId} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{w.items[0]?.title ?? w.workOrderId}</div>
                    <div className="text-[12px] text-mute">
                      {fmt(from)} – {fmt(to)} · {w.items.length} site
                      {w.items.length === 1 ? "" : "s"}
                    </div>
                    <div className="text-[11px] text-mute font-mono">{w.workOrderId}</div>
                  </div>
                  <Pill tone={from <= t ? "verified" : "navy"}>{from <= t ? "Live" : "Scheduled"}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Quick actions */}
      <Panel title="Quick actions">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Action icon={Plus} label="Add site" tab="inventory" />
          <Action icon={Upload} label="Bulk upload" tab="inventory" />
          {showRequests && <Action icon={Inbox} label="Requests" tab="requests" />}
          <Action icon={Wallet} label="Finances" tab="finance" />
        </div>
      </Panel>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={cn("rounded-xl p-4 flex items-center gap-3 shadow-sm", className)}>
      <div className="size-10 rounded-lg bg-white/15 grid place-items-center shrink-0">
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums leading-tight">{value}</div>
        <div className="text-[12px] opacity-90">{label}</div>
      </div>
    </div>
  );
}

function Panel({
  title,
  link,
  children,
}: {
  title: string;
  link?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <KCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-[15px]">{title}</h2>
        {link && <span className="text-[12px] text-navy font-medium">{link}</span>}
      </div>
      {children}
    </KCard>
  );
}

function Action({
  icon: Icon,
  label,
  tab,
}: {
  icon: LucideIcon;
  label: string;
  tab: "inventory" | "requests" | "finance";
}) {
  return (
    <Link
      to="/vendor"
      search={{ tab }}
      className="rounded-xl border border-line p-4 flex flex-col items-center gap-2 hover:bg-muted transition text-[13px] font-medium"
    >
      <Icon size={22} className="text-navy" />
      {label}
    </Link>
  );
}
