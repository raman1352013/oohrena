import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BrickWall,
  Bus,
  CarFront,
  Check,
  FileCheck2,
  Handshake,
  MapPin,
  Milestone,
  MonitorPlay,
  RectangleHorizontal,
  Search,
  Store,
  TrainFront,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_DEFS,
  CATEGORY_IDS,
  PRICING_UNIT_LABEL,
  SUBJECT_TO_VENDOR,
  type CategoryId,
} from "@oohrena/shared";
import { ROLE_HOME, useSession } from "@/lib/auth";
import { inr, selectCls } from "@/lib/format";
import { useSearch, type SearchItem } from "@/lib/marketplace-api";
import { cn } from "@/lib/utils";
import { Btn, Photo, Pill } from "@/components/app/kit";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OOHRENA — Every Media. One Marketplace." },
      {
        name: "description",
        content:
          "Find and book hoardings, LED screens, transit and retail media across India. Every inquiry, quote, booking and proof on one record.",
      },
      { property: "og:title", content: "OOHRENA — Every Media. One Marketplace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

/** The record chain every campaign leaves behind — the product in one picture. */
const CHAIN = [
  ["LD-2026-000128", "Inquiry"],
  ["QT-2026-000128-V1", "Quote"],
  ["BK-2026-000041", "Booking"],
  ["WO-2026-000057", "Work order"],
  ["PRF-2026-000212", "Proof"],
  ["PAY-2026-000033", "Payment"],
] as const;

const ICONS: Record<CategoryId, LucideIcon> = {
  hoarding: RectangleHorizontal,
  unipole: Milestone,
  wall_wrap: BrickWall,
  erickshaw_auto: CarFront,
  transit: Bus,
  railway_metro: TrainFront,
  led_screen: MonitorPlay,
  mobile_led_van: Truck,
  indoor_retail: Store,
};

/** Discover • Connect • Book • Grow — each line states what the platform actually does. */
const STEPS: { title: string; body: string; icon: LucideIcon }[] = [
  { title: "Discover", body: "Search media by city, format and dates.", icon: Search },
  { title: "Connect", body: "Request a quote. Our team reviews every inquiry.", icon: Handshake },
  { title: "Book", body: "Approve the quote. Booking and work order follow.", icon: FileCheck2 },
  { title: "Grow", body: "Proof photos and a report for every campaign.", icon: TrendingUp },
];

const wrap = "max-w-[1216px] mx-auto px-4 md:px-8";

function Landing() {
  const { data: user } = useSession();

  return (
    <main>
      <Hero signedIn={!!user} homeHref={user ? ROLE_HOME[user.role] : undefined} />
      <Formats />
      <LiveMedia />
      <HowItWorks />
      {!user && <VendorBand />}
      <Footer />
    </main>
  );
}

function Hero({ signedIn, homeHref }: { signedIn: boolean; homeHref: string | undefined }) {
  return (
    <section className="relative overflow-hidden bg-navy text-navy-foreground">
      {/* Soft saffron light and a faint grid; decoration only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-saffron/25 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />

      <div
        className={`${wrap} relative py-16 md:py-24 grid gap-12 md:grid-cols-[1.15fr_1fr] items-center`}
      >
        <div className="space-y-8 min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-700">
          <div className="space-y-4">
            <h1 className="text-[40px] leading-[1.04] md:text-[64px] font-semibold tracking-[-0.035em] text-balance">
              Every Media.
              <br />
              <span className="bg-gradient-to-r from-saffron to-[oklch(0.82_0.15_70)] bg-clip-text text-transparent">
                One Marketplace.
              </span>
            </h1>
            <p lang="hi" className="text-[17px] md:text-[19px] text-navy-foreground/75">
              हर मीडिया, एक ही मार्केटप्लेस।
            </p>
          </div>

          <HeroSearch />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px]">
            {signedIn && homeHref ? (
              <Link
                to={homeHref}
                className="inline-flex items-center gap-1.5 font-medium text-navy-foreground hover:text-saffron"
              >
                My workspace <ArrowRight size={15} />
              </Link>
            ) : (
              <Link
                to="/register"
                search={{ as: "vendor" }}
                className="inline-flex items-center gap-1.5 font-medium text-navy-foreground hover:text-saffron"
              >
                List your media <ArrowRight size={15} />
              </Link>
            )}
            <span className="text-navy-foreground/55">Discover · Connect · Book · Grow</span>
          </div>
        </div>

        <CampaignRecord />
      </div>
    </section>
  );
}

/** City + format, then hand over to the marketplace, which owns the full search. */
function HeroSearch() {
  const nav = useNavigate();
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<CategoryId | "">("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void nav({
      to: "/marketplace",
      search: {
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(category ? { category } : {}),
      },
    });
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-2 rounded-2xl bg-card p-2 text-ink shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)] sm:grid-cols-[1fr_1fr_auto]"
    >
      <label className="flex items-center gap-2 rounded-xl px-3 focus-within:ring-2 focus-within:ring-saffron/40">
        <MapPin size={16} className="shrink-0 text-mute" aria-hidden />
        <span className="sr-only">City</span>
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          maxLength={80}
          autoComplete="address-level2"
          className="h-11 border-0 px-0 shadow-none focus-visible:ring-0"
        />
      </label>
      <label className="flex items-center rounded-xl px-1 focus-within:ring-2 focus-within:ring-saffron/40">
        <span className="sr-only">Media format</span>
        <select
          value={category}
          onChange={(e) => {
            const v = e.target.value;
            setCategory(CATEGORY_IDS.includes(v as CategoryId) ? (v as CategoryId) : "");
          }}
          className={cn(selectCls, "h-11 w-full border-0 shadow-none")}
        >
          <option value="">All formats</option>
          {CATEGORY_DEFS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <Btn type="submit" className="h-11 px-6 text-[14px]">
        <Search size={16} />
        Search
      </Btn>
    </form>
  );
}

function Formats() {
  return (
    <section className={`${wrap} py-16 md:py-24`}>
      <div className="flex items-end justify-between gap-4 mb-8">
        <h2 className="text-[22px] md:text-[28px] font-semibold tracking-tight">Media formats</h2>
        <Link
          to="/marketplace"
          className="text-[13px] font-medium text-saffron-deep hover:underline inline-flex items-center gap-1"
        >
          Browse all <ArrowRight size={14} />
        </Link>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORY_DEFS.map((c) => {
          const Icon = ICONS[c.id];
          return (
            <li key={c.id}>
              <Link
                to="/marketplace"
                search={{ category: c.id }}
                className="group flex h-full items-center gap-3 rounded-xl border border-line bg-card px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-saffron/40 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-canvas text-ink transition-colors group-hover:bg-saffron/10 group-hover:text-saffron-deep">
                  <Icon size={20} strokeWidth={1.6} />
                </span>
                <span className="text-[14px] font-medium text-ink leading-snug">{c.name}</span>
                <ArrowRight
                  size={15}
                  className="ml-auto text-mute opacity-0 transition-opacity group-hover:opacity-100"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Real, bookable listings from the public search. DEMO and unverified inventory never appear here
 * (AGENTS.md §4.8). The section hides itself while there is nothing to show or the API is down, so
 * the landing page never looks broken.
 */
function LiveMedia() {
  const search = useSearch({});
  const items = (search.data?.items ?? [])
    .filter((x) => x.verified && x.bookable && x.dataType !== "DEMO")
    .slice(0, 6);

  if (search.isPending) {
    return (
      <section className="bg-card border-y border-line" aria-busy>
        <div className={`${wrap} py-16 md:py-24`}>
          <div className="h-8 w-48 rounded-md bg-muted animate-pulse mb-8" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (search.isError || items.length === 0) return null;

  return (
    <section className="bg-card border-y border-line">
      <div className={`${wrap} py-16 md:py-24`}>
        <div className="flex items-end justify-between gap-4 mb-8">
          <h2 className="text-[22px] md:text-[28px] font-semibold tracking-tight">
            Live on OOHRENA
          </h2>
          <Link
            to="/marketplace"
            className="text-[13px] font-medium text-saffron-deep hover:underline inline-flex items-center gap-1"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((x) => (
            <li key={x.inventoryId}>
              <LiveCard x={x} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function LiveCard({ x }: { x: SearchItem }) {
  return (
    <Link
      to="/marketplace"
      search={{ category: x.category, city: x.city }}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-canvas transition hover:border-saffron/50 hover:shadow-[0_12px_32px_-16px_rgba(15,23,42,0.25)]"
    >
      <Photo
        src={x.photos[0]}
        alt={x.title}
        className="h-44 w-full transition-transform duration-500 group-hover:scale-[1.02]"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-ink">{x.title}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-mute">
              <MapPin size={12} aria-hidden />
              <span className="truncate">
                {x.locality}, {x.city}
              </span>
            </div>
          </div>
          <Pill tone="verified">
            <BadgeCheck size={12} />
            Verified
          </Pill>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2 text-[13px]">
          <span className="text-mute">{x.categoryName}</span>
          {x.indicativePrice !== null && (
            <span className="text-right">
              <span className="font-semibold text-ink">{inr(x.indicativePrice)}</span>
              <span className="text-mute"> {PRICING_UNIT_LABEL[x.pricingUnit]}</span>
            </span>
          )}
        </div>
        {/* Only when the card makes an availability claim the vendor hasn't confirmed (AGENTS.md §4.8).
            Without dates there is no availability on the card, so no label. */}
        {x.availability && !x.availability.confirmed && (
          <div className="text-[12px] text-mute">{SUBJECT_TO_VENDOR}</div>
        )}
      </div>
    </Link>
  );
}

function HowItWorks() {
  return (
    <section className={`${wrap} py-16 md:py-24`}>
      <h2 className="text-[22px] md:text-[28px] font-semibold tracking-tight mb-10">
        How it works
      </h2>
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-4 bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-saffron/10 text-saffron-deep">
                <s.icon size={20} strokeWidth={1.8} />
              </span>
              <span className="font-mono text-[12px] text-mute">0{i + 1}</span>
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-mute">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function VendorBand() {
  return (
    <section className={`${wrap} pb-16 md:pb-24`}>
      <div className="relative overflow-hidden rounded-2xl bg-navy text-navy-foreground px-6 py-12 md:px-14 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-saffron/20 blur-[100px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-6%] h-72 w-72 rounded-full bg-verified/15 blur-[100px]"
        />
        <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-navy-foreground/10 px-3 py-1 text-[12px] font-medium text-navy-foreground/85">
              <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.8_0.13_163)]" aria-hidden />
              Vendor registration open
            </span>
            <h2 className="text-[28px] md:text-[40px] font-semibold leading-[1.08] tracking-tight text-balance">
              Don&apos;t just list your media.
              <br />
              <span className="text-saffron">Connect it to the world.</span>
            </h2>
            <p className="text-[15px] md:text-[17px] text-navy-foreground/70">
              Your Media. Your Ownership. A Bigger Market.
            </p>
          </div>
          <Link to="/register" search={{ as: "vendor" }}>
            <Btn className="h-12 px-6 text-[14px] group" tabIndex={-1}>
              Register as vendor
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Btn>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <nav className={`${wrap} py-6 flex flex-wrap gap-4 text-[12px] text-mute`}>
        <span className="mr-auto">© {new Date().getFullYear()} OOHRENA</span>
        <Link to="/marketplace" className="hover:text-ink">
          Marketplace
        </Link>
        <Link to="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-ink">
          Terms
        </Link>
        <Link to="/confidentiality" className="hover:text-ink">
          Confidentiality
        </Link>
      </nav>
    </footer>
  );
}

/** A sample campaign record: one ID per step, each linked to the next. Illustration, not data. */
function CampaignRecord() {
  return (
    <div
      aria-label="Example campaign record"
      className="relative min-w-0 rounded-2xl border border-navy-foreground/10 bg-navy-foreground/[0.04] p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-4">
        <span className="font-mono text-[12px] text-navy-foreground/60">CMP-2026-000019</span>
        <span className="rounded-md bg-navy-foreground/10 px-2 py-1 text-[11px] font-medium text-navy-foreground/70">
          Example
        </span>
      </div>
      <ol className="relative rounded-xl bg-navy-foreground/[0.03] py-2">
        {CHAIN.map(([id, label], i) => (
          <li
            key={id}
            className="relative flex items-center gap-4 px-4 py-3 animate-in fade-in slide-in-from-left-2 fill-mode-both duration-500"
            style={{ animationDelay: `${300 + i * 140}ms` }}
          >
            {i < CHAIN.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[27px] top-[34px] h-[calc(100%-14px)] w-px bg-navy-foreground/15"
              />
            )}
            <span className="relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-saffron text-navy">
              <Check size={13} strokeWidth={3} />
            </span>
            <span className="text-[14px] text-navy-foreground/90">{label}</span>
            <span className="ml-auto truncate font-mono text-[12px] text-saffron">{id}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
