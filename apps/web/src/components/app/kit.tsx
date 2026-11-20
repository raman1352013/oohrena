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

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] uppercase tracking-wider text-mute font-semibold", className)}>
      {children}
    </div>
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
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "dark" | "ghost";
}) {
  const v = {
    primary: "bg-saffron text-primary-foreground hover:bg-saffron-deep",
    secondary: "border border-line bg-card text-ink hover:bg-canvas",
    dark: "bg-navy text-navy-foreground hover:bg-navy/90",
    ghost: "text-mute hover:text-ink",
  }[variant];
  return (
    <button
      {...p}
      className={cn(
        "h-11 px-5 rounded-lg text-[13px] font-semibold transition disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-2",
        v,
        className,
      )}
    />
  );
}

export function Avatar({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={cn(
        "w-8 h-8 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold",
        dark ? "bg-navy text-navy-foreground" : "bg-muted text-ink",
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="font-medium text-ink text-[13px]">{title}</div>
      {hint && <div className="text-mute text-[12px] mt-1">{hint}</div>}
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
