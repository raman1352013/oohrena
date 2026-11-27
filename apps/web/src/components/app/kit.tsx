import { useState, type ReactNode } from "react";
import { ImageOff, Inbox, LoaderCircle } from "lucide-react";
import { assetUrl } from "@/lib/api";
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
    <section
      className={cn(
        "bg-card border border-line rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
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
/** "partially_paid" → "Partially paid". Only all-lowercase strings change, so labels and codes
 * ("DEMO", "KYC approved") stay as written. */
const tidy = (x: ReactNode) =>
  typeof x === "string" && /^[a-z][a-z_ ]*$/.test(x)
    ? x.charAt(0).toUpperCase() + x.slice(1).replace(/_/g, " ")
    : x;

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  children = tidy(children);
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
  loading = false,
  className,
  children,
  disabled,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "dark" | "ghost" | "danger";
  size?: "md" | "sm";
  /** Shows a spinner and blocks clicks while a request is in flight. The width stays the same. */
  loading?: boolean | undefined;
}) {
  const v = {
    primary:
      "bg-saffron text-primary-foreground hover:bg-saffron-deep shadow-[0_1px_2px_rgba(234,88,12,0.25)]",
    secondary: "border border-line bg-card text-ink hover:bg-canvas hover:border-ink/15",
    dark: "bg-navy text-navy-foreground hover:bg-navy/90",
    ghost: "text-mute hover:text-ink",
    danger: "border border-destructive/30 bg-card text-destructive hover:bg-destructive/5",
  }[variant];
  return (
    <button
      {...p}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative rounded-lg text-[13px] font-semibold transition-[background-color,border-color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-saffron/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        size === "sm" ? "h-9 px-3" : "h-11 px-5",
        loading && "disabled:opacity-80",
        v,
        className,
      )}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <LoaderCircle size={16} className="absolute animate-spin" aria-hidden />
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Empty({ title }: { title: string }) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-center animate-in fade-in duration-300">
      <div className="size-10 rounded-full bg-muted grid place-items-center text-mute" aria-hidden>
        <Inbox size={18} strokeWidth={1.75} />
      </div>
      <div className="font-medium text-mute text-[13px]">{title}</div>
    </div>
  );
}

/** A grey block that pulses while data loads. */
export function Skeleton({ className }: { className?: string | undefined }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

/** Placeholder rows in the shape of a list, so the page doesn't jump when data arrives. */
export function Loading({ rows = 3 }: { rows?: number | undefined }) {
  return (
    <div role="status" aria-label="Loading" className="py-4 space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4" style={{ opacity: 1 - i * 0.22 }}>
          <Skeleton className="h-4 w-24 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-md shrink-0" />
        </div>
      ))}
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
          <div
            className={cn(
              "text-2xl font-semibold mt-1 tabular-nums tracking-tight animate-in fade-in duration-300",
              x.tone && tone[x.tone],
            )}
          >
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
    <nav
      role="tablist"
      className="flex gap-6 border-b border-line text-[13px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "pt-1 pb-2.5 border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-colors",
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

/**
 * A listing photo. Shows a neutral placeholder when there is no photo or the bytes can't be loaded
 * (e.g. a file whose storage was wiped), never the browser's broken-image icon.
 */
export function Photo({
  src,
  alt,
  className,
}: {
  src: string | undefined;
  alt: string;
  className?: string | undefined;
}) {
  const [failed, setFailed] = useState<string>();
  if (!src || failed === src)
    return (
      <div
        className={cn("bg-muted grid place-items-center text-mute", className)}
        role="img"
        aria-label={alt || "No photo"}
      >
        <ImageOff size={22} aria-hidden />
      </div>
    );
  return (
    <img
      src={assetUrl(src)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(src)}
      className={cn("object-cover bg-muted", className)}
    />
  );
}

/** A single choice from a few options, as tappable chips (radio semantics). Use instead of a select
 * when there are 2–6 short options; it saves typing on phones. */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string; disabled?: boolean | undefined }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-medium text-ink">{label}</div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
            className={cn(
              "h-9 px-3.5 rounded-full border text-[13px] transition-colors disabled:opacity-40",
              value === o.id
                ? "border-navy bg-navy text-navy-foreground font-semibold"
                : "border-line bg-card text-ink hover:border-saffron/50",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
