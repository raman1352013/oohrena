import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BrickWall,
  Bus,
  CarFront,
  Check,
  Milestone,
  MonitorPlay,
  RectangleHorizontal,
  Store,
  TrainFront,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_DEFS, type CategoryId } from "@oohrena/shared";
import { ROLE_HOME, useSession } from "@/lib/auth";
import { Btn } from "@/components/app/kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OOHRENA — India's Unified Advertising Platform" },
      {
        name: "description",
        content:
          "Book verified hoardings, LED screens, transit and retail media, and see proof that your campaign ran.",
      },
      { property: "og:title", content: "OOHRENA — India's Unified Advertising Platform" },
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

const wrap = "max-w-[1216px] mx-auto px-4 md:px-8";

function Landing() {
  const { data: user } = useSession();

  return (
    <main>
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
          className={`${wrap} relative py-20 md:py-28 grid gap-14 md:grid-cols-[1.15fr_1fr] items-center`}
        >
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-3 duration-700">
            <h1 className="text-[44px] leading-[1.02] md:text-[72px] font-semibold tracking-[-0.035em] text-balance">
              Outdoor advertising
              <br />
              <span className="bg-gradient-to-r from-saffron to-[oklch(0.82_0.15_70)] bg-clip-text text-transparent">
                you can track.
              </span>
            </h1>
            <div className="flex flex-wrap gap-3">
              <Link to="/marketplace">
                <Btn className="h-12 px-6 text-[14px] group" tabIndex={-1}>
                  Browse media
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Btn>
              </Link>
              {user ? (
                <Link to={ROLE_HOME[user.role]}>
                  <Btn
                    variant="ghost"
                    className="h-12 px-6 text-[14px] text-navy-foreground/80 hover:text-navy-foreground ring-1 ring-navy-foreground/15 hover:bg-navy-foreground/5"
                    tabIndex={-1}
                  >
                    My workspace
                  </Btn>
                </Link>
              ) : (
                <Link to="/register" search={{ as: "vendor" }}>
                  <Btn
                    variant="ghost"
                    className="h-12 px-6 text-[14px] text-navy-foreground/80 hover:text-navy-foreground ring-1 ring-navy-foreground/15 hover:bg-navy-foreground/5"
                    tabIndex={-1}
                  >
                    List your media
                  </Btn>
                </Link>
              )}
            </div>
          </div>

          <CampaignRecord />
        </div>
      </section>

      <section className={`${wrap} py-16 md:py-24`}>
        <h2 className="text-[22px] md:text-[28px] font-semibold tracking-tight mb-8">Media</h2>
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
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {!user && (
        <section className={`${wrap} pb-16 md:pb-24`}>
          <div className="relative overflow-hidden rounded-2xl bg-navy text-navy-foreground px-6 py-10 md:px-12 md:py-14 flex flex-col md:flex-row md:items-center gap-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-saffron/20 blur-[100px]"
            />
            <h2 className="relative text-[26px] md:text-[34px] font-semibold tracking-tight md:mr-auto">
              Own media? List it.
            </h2>
            <Link to="/register" search={{ as: "vendor" }} className="relative">
              <Btn className="h-12 px-6 text-[14px]" tabIndex={-1}>
                List your media
              </Btn>
            </Link>
          </div>
        </section>
      )}

      <footer className="border-t border-line">
        <nav className={`${wrap} py-6 flex flex-wrap gap-4 text-[12px] text-mute`}>
          <span className="mr-auto">© {new Date().getFullYear()} OOHRENA</span>
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
    </main>
  );
}

/** A sample campaign record: one ID per step, each linked to the next. Illustration, not data. */
function CampaignRecord() {
  return (
    <div
      aria-label="Example campaign record"
      className="relative rounded-2xl border border-navy-foreground/10 bg-navy-foreground/[0.04] p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-4">
        <span className="font-mono text-[12px] text-navy-foreground/60">CMP-2026-000019</span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-verified/15 px-2 py-1 text-[12px] font-semibold text-[oklch(0.8_0.13_163)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          Live
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
            <span className="ml-auto font-mono text-[12px] text-saffron">{id}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
