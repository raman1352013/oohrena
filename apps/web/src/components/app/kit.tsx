import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function KCard({
  title,
  right,
  children,
  className,
  bodyClass,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn("bg-card border border-line rounded-xl", className)}>
      {title && (
        <div className="px-5 min-h-14 py-2 flex flex-wrap items-center gap-2 border-b border-line">
          <h2 className="font-semibold text-[15px] text-ink mr-auto">{title}</h2>
          {right}
        </div>
      )}
      <div className={bodyClass ?? "p-5 text-[13px]"}>{children}</div>
    </section>
  );
}

type Tone = "saffron" | "verified" | "hold" | "neutral" | "navy" | "danger";
const tones: Record<Tone, string> = {
  saffron: "bg-saffron/10 text-saffron-deep",
  verified: "bg-verified-soft text-verified",
  hold: "bg-hold-soft text-hold",
  neutral: "bg-muted text-mute",
  navy: "bg-navy text-navy-foreground",
  danger: "bg-destructive/10 text-destructive",
};
export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold text-[12px] w-fit whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Btn({
  variant = "primary",
  size = "md",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "dark" | "ghost" | "danger";
  size?: "md" | "sm";
}) {
  const v = {
    primary: "bg-saffron text-primary-foreground hover:bg-saffron-deep",
    secondary: "border border-line bg-card text-ink hover:bg-canvas",
    dark: "bg-navy text-navy-foreground hover:bg-navy/90",
    ghost: "text-mute hover:text-ink",
    danger: "border border-destructive/30 bg-card text-destructive hover:bg-destructive/5",
  }[variant];
  return (
    <button
      {...p}
      className={cn(
        "rounded-lg text-[13px] font-semibold transition disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-2",
        size === "sm" ? "h-9 px-3" : "h-11 px-5",
        v,
        className,
      )}
    />
  );
}

export function Empty({ title }: { title: string }) {
  return (
    <div className="py-10 text-center">
      <div className="font-medium text-ink text-[13px]">{title}</div>
    </div>
  );
}

export function Loading() {
  return (
    <div role="status" className="py-10 text-center text-[13px] text-mute">
      Loading…
    </div>
  );
}

export type StatItem = {
  label: string;
  value: ReactNode;
  tone?: "verified" | "hold" | "danger" | undefined;
  /** Only for an exception that needs action ("3 overdue"). Never an explanation. */
  alert?: string | undefined;
};

const COLS: Record<number, string> = {
  2: "",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
};

/** One strip of numbers with their names. If a number needs a caption, rename it. */
export function Stats({ items }: { items: StatItem[] }) {
  const tone = { verified: "text-verified", hold: "text-hold", danger: "text-destructive" };
  return (
    <div
      className={cn(
        "bg-card border border-line rounded-xl grid grid-cols-2 overflow-hidden",
        COLS[items.length] ?? "sm:grid-cols-3 lg:grid-cols-6",
      )}
    >
      {items.map((x) => (
        <div key={x.label} className="p-4 border-line border-b border-r -mb-px -mr-px">
          <div className="text-[12px] text-mute">{x.label}</div>
          <div className={cn("text-2xl font-semibold mt-1 tabular-nums", x.tone && tone[x.tone])}>
            {x.value}
          </div>
          {x.alert && <div className="text-[11px] text-saffron-deep mt-1">{x.alert}</div>}
        </div>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string; n?: number | undefined }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <nav role="tablist" className="flex gap-6 border-b border-line text-[13px] overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "pt-1 pb-2.5 border-b-2 whitespace-nowrap flex items-center gap-1.5",
            value === t.id
              ? "border-navy text-ink font-semibold"
              : "border-transparent text-mute hover:text-ink",
          )}
        >
          {t.label}
          {!!t.n && (
            <span
              className={cn(
                "px-1.5 rounded text-[11px]",
                value === t.id && "bg-navy text-navy-foreground",
              )}
            >
              {t.n}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

/** A result the user must read (saved, sent, failed to send). Errors use FormError. */
export function Notice({
  tone = "verified",
  children,
}: {
  tone?: "verified" | "hold";
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg px-3 py-2.5 text-[13px]",
        tone === "verified" ? "bg-verified-soft text-verified" : "bg-hold-soft text-hold",
      )}
    >
      {children}
    </div>
  );
}

export function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-[13px]">
      <span className="text-mute">{k}</span>
      <span className="text-ink font-medium text-right">{v}</span>
    </div>
  );
}

export function PinLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--saffron)" />
          <stop offset="1" stopColor="var(--saffron-deep)" />
        </linearGradient>
      </defs>
      <path
        d="M16 2c-6.6 0-12 5.2-12 11.6C4 22 16 30 16 30s12-8 12-16.4C28 7.2 22.6 2 16 2Z"
        fill="url(#pg)"
      />
      <circle cx="16" cy="13" r="5" fill="var(--navy)" />
      <circle cx="16" cy="13" r="2" fill="var(--card)" />
    </svg>
  );
}
