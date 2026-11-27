import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One sidebar entry. `to` + `search` is where it goes; the open section always lives in the URL. */
export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  to: "/admin" | "/reports" | "/vendor" | "/client" | "/finance" | "/partner";
  search?: Record<string, string> | undefined;
  active: boolean;
  /** Count of things waiting; shown only when above zero. */
  n?: number | undefined;
};

export type NavGroup = { label?: string | undefined; items: NavItem[] };

export type ShellAction = { label: string; icon: LucideIcon; onClick: () => void };

/**
 * The one workspace layout for every role: a sidebar on desktop and a scrolling row on phones.
 * Groups are separated by a rule; empty groups are dropped, so role-filtered menus stay tidy.
 */
export function WorkspaceShell({
  label,
  groups,
  action,
  padded = false,
  children,
}: {
  /** Accessible name of the navigation, e.g. "Admin". */
  label: string;
  groups: NavGroup[];
  action?: ShellAction | undefined;
  /** Wrap the content in the standard page padding (pages that don't pad themselves). */
  padded?: boolean | undefined;
  children: ReactNode;
}) {
  const visible = groups.filter((g) => g.items.length > 0);
  const all = visible.flatMap((g) => g.items);
  const activeId = all.find((x) => x.active)?.id ?? "";

  // Phones: keep the open section visible in the scrolling row (horizontal only, never the page).
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = row.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el) return;
    nav.scrollTo({
      left: el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2,
      behavior: "smooth",
    });
  }, [activeId]);

  const item = (x: NavItem, compact = false) => (
    <Link
      key={x.id}
      to={x.to}
      search={(x.search ?? {}) as never}
      aria-current={x.active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg text-[13px] transition-[background-color,color,box-shadow] duration-150 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-saffron/50",
        compact ? "h-9 px-3 shrink-0" : "h-9 px-2.5",
        x.active
          ? "bg-card text-ink font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-line"
          : "text-mute hover:text-ink hover:bg-card/70",
      )}
    >
      <x.icon size={16} strokeWidth={1.75} className={x.active ? "text-saffron-deep" : ""} />
      {x.label}
      {!!x.n && (
        <span
          className={cn(
            "ml-auto pl-2 text-[12px] tabular-nums",
            x.active ? "text-ink" : "text-mute group-hover:text-ink",
          )}
        >
          {x.n}
        </span>
      )}
    </Link>
  );

  return (
    <div className="md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="no-print hidden md:flex flex-col sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-line px-3 py-4 gap-1">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mb-3 h-9 px-2.5 rounded-lg bg-navy text-navy-foreground text-[13px] font-semibold flex items-center gap-2 hover:bg-navy/90 transition-colors"
          >
            <action.icon size={16} strokeWidth={2} />
            {action.label}
          </button>
        )}
        {visible.map((g, i) => (
          <div key={g.label ?? i}>
            {i > 0 && <div className="my-3 border-t border-line" />}
            {g.label && (
              <div className="px-2.5 py-1 text-[11px] font-semibold text-mute uppercase tracking-wider">
                {g.label}
              </div>
            )}
            <nav aria-label={g.label ? `${label} ${g.label}` : label} className="space-y-0.5">
              {g.items.map((x) => item(x))}
            </nav>
          </div>
        ))}
      </aside>

      <div className="min-w-0">
        <nav
          ref={row}
          aria-label={label}
          className="no-print md:hidden relative flex gap-1 overflow-x-auto px-4 pt-4 pb-1 no-scrollbar"
        >
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              aria-label={action.label}
              className="h-9 w-9 shrink-0 rounded-lg bg-navy text-navy-foreground grid place-items-center"
            >
              <action.icon size={16} />
            </button>
          )}
          {all.map((x) => item(x, true))}
        </nav>
        {/* Keyed by section, so switching sections fades the new one in instead of snapping. */}
        <div
          key={activeId}
          className="animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out"
        >
          {padded ? <div className="p-4 md:p-8">{children}</div> : children}
        </div>
      </div>
    </div>
  );
}
