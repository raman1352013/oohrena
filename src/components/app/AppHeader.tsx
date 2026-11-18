import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLES, actions, getState, useStore } from "@/lib/store";
import { Btn } from "@/components/app/kit";
import { cn } from "@/lib/utils";

const TITLES: [string, string][] = [
  ["/admin", "Central Control Tower"], ["/client", "Client Portal"], ["/vendor", "Vendor Space Hub"],
  ["/finance", "Finance Ledger"], ["/partner", "Growth Partner"], ["/", "Media Marketplace"],
];

export function AppHeader() {
  const role = useStore((s) => s.role);
  const env = useStore((s) => s.env);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const r = ROLES.find((x) => x.id === role)!;
  const title = TITLES.find(([p]) => (p === "/" ? path === "/" : path.startsWith(p)))?.[1] ?? "OOHRENA";

  function search(e: React.FormEvent) {
    e.preventDefault();
    const id = q.trim().toUpperCase();
    if (!id) return;
    const s = getState();
    const lead = s.leads.find((l) => l.id === id) ?? s.leads.find((l) => l.quoteId === id);
    const bk = s.bookings.find((b) => b.id === id);
    const wo = s.workOrders.find((w) => w.id === id || w.bookingId === id);
    if (wo) return nav({ to: "/admin/proof/$woId", params: { woId: wo.id } });
    if (lead) return nav({ to: "/admin/quote/$leadId", params: { leadId: lead.id } });
    if (bk) return nav({ to: "/admin" });
    toast.error(`No record found for ${id}`);
    return undefined;
  }

  function backup() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `oohrena-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast.success("Browser demo data exported");
  }

  return (
    <header className="no-print bg-navy text-navy-foreground h-14 px-4 md:px-6 flex items-center gap-3 md:gap-6 sticky top-0 z-40">
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-md bg-saffron grid place-items-center font-bold text-[13px]">O</div>
        <span className="font-bold tracking-wide hidden sm:inline">OOHRENA</span>
      </Link>
      <div className="font-medium text-navy-foreground/80 text-[14px] hidden lg:block whitespace-nowrap">{title}</div>
      <form onSubmit={search} className="flex-1 max-w-md h-9 rounded-lg bg-navy-foreground/10 hidden md:flex items-center px-3 gap-2 text-navy-foreground/50">
        <Search size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Lead ID / Booking ID" className="bg-transparent outline-none flex-1 text-[13px] text-navy-foreground placeholder:text-navy-foreground/50" />
      </form>
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <div className="hidden sm:flex rounded-lg bg-navy-foreground/10 p-0.5 text-[12px]">
          {(["production", "staging"] as const).map((e) => (
            <button key={e} onClick={() => actions.setEnv(e)} className={cn("px-3 py-1.5 rounded-md capitalize", env === e ? "bg-card text-navy font-semibold" : "text-navy-foreground/60")}>{e}</button>
          ))}
        </div>
        {env === "staging" && (
          <DropdownMenu>
            <DropdownMenuTrigger className="h-8 px-3 rounded-lg bg-saffron text-[12px] font-semibold flex items-center gap-1 max-w-[180px]">
              <span className="truncate">{r.label}: {r.sub.split(" - ")[0]}</span><ChevronDown size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Quick role switcher</DropdownMenuLabel>
              {ROLES.map((x) => (
                <DropdownMenuItem key={x.id} onClick={() => { actions.setRole(x.id); nav({ to: x.home }); }} className={cn(x.id === role && "bg-muted")}>
                  <span className="w-7 h-7 rounded-full bg-muted grid place-items-center text-[11px] font-semibold">{x.initials}</span>
                  <span><span className="font-semibold">{x.label}</span><br /><span className="text-mute text-[12px]">{x.sub}</span></span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav({ to: "/" })}>Open public marketplace</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Btn variant="ghost" onClick={backup} className="hidden md:block h-8 px-3 border border-navy-foreground/20 text-navy-foreground/80">Export demo</Btn>
        <DropdownMenu>
          <DropdownMenuTrigger className="w-8 h-8 rounded-full bg-navy-foreground/15 grid place-items-center text-[12px] font-semibold">{r.initials}</DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{r.sub}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => nav({ to: r.home })}>My workspace</DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav({ to: "/reports" })}>Reports & activity</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { if (confirm("Reset all demo data to the seeded dossier?")) { actions.reset(); toast.success("Demo data reset"); } }}>Reset demo data</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
