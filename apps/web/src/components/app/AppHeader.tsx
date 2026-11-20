import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_HOME, ROLE_LABEL, useLogout, useSession } from "@/lib/auth";
import { Btn } from "@/components/app/kit";

const TITLES: [string, string][] = [
  ["/admin", "Central Control Tower"],
  ["/client", "Client Portal"],
  ["/vendor", "Vendor Space Hub"],
  ["/finance", "Finance Ledger"],
  ["/partner", "Growth Partner"],
  ["/", "Media Marketplace"],
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "U";

export function AppHeader() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const { data: user } = useSession();
  const logout = useLogout();
  const [q, setQ] = useState("");
  const title = TITLES.find(([p]) => (p === "/" ? path === "/" : path.startsWith(p)))?.[1] ?? "";
  const isAdmin = user?.role === "admin";

  /** Admin quick-find: Lead IDs open the lead workspace (bookings and quotes live on their lead page). */
  function search(e: React.FormEvent) {
    e.preventDefault();
    const id = q.trim().toUpperCase();
    if (!id) return;
    if (/^LD-\d{4}-\d{6}$/.test(id))
      return nav({ to: "/admin/leads/$leadId", params: { leadId: id } });
    toast.error("Enter a Lead ID like LD-2026-000001");
    return undefined;
  }

  function signOut() {
    logout.mutate(undefined, {
      onSettled: () => {
        toast.success("Signed out");
        void nav({ to: "/login", replace: true });
      },
    });
  }

  return (
    <header className="no-print bg-navy text-navy-foreground h-14 px-4 md:px-6 flex items-center gap-3 md:gap-6 sticky top-0 z-40">
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-md bg-saffron grid place-items-center font-bold text-[13px]">
          O
        </div>
        <span className="font-bold tracking-wide hidden sm:inline">OOHRENA</span>
      </Link>
      <div className="font-medium text-navy-foreground/80 text-[14px] hidden lg:block whitespace-nowrap">
        {title}
      </div>
      {isAdmin && (
        <form
          onSubmit={search}
          className="flex-1 max-w-md h-9 rounded-lg bg-navy-foreground/10 hidden md:flex items-center px-3 gap-2 text-navy-foreground/50"
        >
          <Search size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Open Lead ID (LD-2026-…)"
            aria-label="Open a Lead ID"
            className="bg-transparent outline-none flex-1 text-[13px] text-navy-foreground placeholder:text-navy-foreground/50"
          />
        </form>
      )}
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {user ? (
          <>
            <Link
              to={ROLE_HOME[user.role]}
              className="hidden sm:inline-flex h-8 px-3 rounded-lg bg-saffron text-[12px] font-semibold items-center"
            >
              My workspace
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="w-8 h-8 rounded-full bg-navy-foreground/15 grid place-items-center text-[12px] font-semibold"
              >
                {initials(user.fullName)}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="font-semibold text-ink truncate">{user.fullName}</div>
                  <div className="text-mute text-[12px] font-normal truncate">{user.email}</div>
                  <div className="text-mute text-[12px] font-normal">
                    {ROLE_LABEL[user.role]} · {user.userId}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav({ to: ROLE_HOME[user.role] })}>
                  My workspace
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav({ to: "/reports" })}>
                  Reports & activity
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} disabled={logout.isPending}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          path !== "/login" &&
          path !== "/register" && (
            <>
              <Link
                to="/login"
                search={path === "/" ? {} : { redirect: path }}
                className="h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center text-navy-foreground/80 hover:text-navy-foreground"
              >
                Sign in
              </Link>
              <Link to="/register">
                <Btn className="h-8 px-3 text-[12px]">Create account</Btn>
              </Link>
            </>
          )
        )}
      </div>
    </header>
  );
}
