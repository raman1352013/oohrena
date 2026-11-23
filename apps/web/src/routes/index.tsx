import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Building2,
  Camera,
  ClipboardCheck,
  FileText,
  Handshake,
  IndianRupee,
  MapPinned,
  Megaphone,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react";
import { CATEGORY_DEFS } from "@oohrena/shared";
import { ROLE_HOME, useSession } from "@/lib/auth";
import { Btn, Eyebrow, PinLogo } from "@/components/app/kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OOHRENA — Outdoor & digital advertising you can track" },
      {
        name: "description",
        content:
          "Find admin-verified hoardings, LED screens, transit and retail media. One Lead ID follows every campaign from inquiry to proof of display and payment.",
      },
      { property: "og:title", content: "OOHRENA — Outdoor x Digital x Trackable" },
      { property: "og:description", content: "Ab Advertising Sirf Dikhegi Nahi... Track Bhi Hogi!" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

/** The twelve-step chain from the MVP document, grouped into what a visitor needs to understand. */
const STEPS = [
  { icon: Search, title: "Find media", body: "Search by city, locality, landmark, PIN code or map, with date-wise availability." },
  { icon: FileText, title: "Send a requirement", body: "Every inquiry gets its own Lead ID that follows it to the end." },
  { icon: ClipboardCheck, title: "Admin review & quote", body: "OOHRENA checks it, assigns an approved media owner and sends an itemised quote with GST." },
  { icon: Handshake, title: "Booking & work order", body: "You approve; the dates are booked and the media owner gets a work order." },
  { icon: Camera, title: "Proof of display", body: "Installation and periodic photos with server time and location exactly as captured, checked by OOHRENA." },
  { icon: IndianRupee, title: "Payments & report", body: "Every payment needs evidence and a second Finance check. Download your campaign report." },
];

const PROMISES = [
  "Only admin-verified media can be booked — demo or unapproved listings never can.",
  "Availability that isn't confirmed is labelled “Subject to vendor confirmation”.",
  "Proof shows the server upload time and the location exactly as captured — never an unchecked “GPS verified” badge.",
  "Every critical action is logged: who did it, when, and what changed.",
];

function Landing() {
  const { data: user } = useSession();

  return (
    <main>
      {/* Hero */}
      <section className="bg-navy text-navy-foreground">
        <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-14 md:py-20 grid gap-10 md:grid-cols-[1.2fr_1fr] items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-navy-foreground/70">
              <PinLogo size={18} /> Outdoor x Digital x Trackable
            </div>
            <h1 className="text-3xl md:text-5xl font-semibold leading-tight">
              Outdoor & digital advertising,
              <span className="text-saffron"> tracked from inquiry to proof.</span>
            </h1>
            <p className="text-[15px] md:text-[17px] text-navy-foreground/75 max-w-xl">
              Ab Advertising Sirf Dikhegi Nahi… Track Bhi Hogi! Find verified hoardings, LED screens,
              transit and retail media, get an itemised quote, and see proof that your campaign ran.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link to="/marketplace">
                <Btn className="h-12 px-6 text-[14px]">Browse verified media</Btn>
              </Link>
              {user ? (
                <Link to={ROLE_HOME[user.role]}>
                  <Btn variant="secondary" className="h-12 px-6 text-[14px]">
                    Go to my workspace
                  </Btn>
                </Link>
              ) : (
                <Link to="/register">
                  <Btn variant="secondary" className="h-12 px-6 text-[14px]">
                    Create a free account
                  </Btn>
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-navy-foreground/5 border border-navy-foreground/10 p-5 space-y-3">
            <div className="text-[12px] font-semibold text-navy-foreground/70">
              One Lead ID follows the whole campaign
            </div>
            {[
              ["LD-2026-…", "Inquiry received"],
              ["QT-2026-…-V1", "Itemised quote released"],
              ["BK-2026-…", "Booking confirmed"],
              ["WO-2026-…", "Work order to media owner"],
              ["CMP-2026-…", "Proof verified by OOHRENA"],
              ["PAY-2026-…", "Payment verified by Finance"],
            ].map(([id, label]) => (
              <div
                key={id}
                className="flex items-center justify-between gap-3 rounded-lg bg-navy-foreground/5 px-3 py-2"
              >
                <span className="font-mono text-[12px] text-saffron">{id}</span>
                <span className="text-[13px] text-navy-foreground/85 text-right">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-[1216px] mx-auto px-4 md:px-8 py-14 space-y-6">
        <div>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="text-2xl font-semibold mt-1">Every step has a record you can see</h2>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="bg-card border border-line rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-saffron/10 text-saffron-deep grid place-items-center">
                  <s.icon className="w-[18px] h-[18px]" />
                </span>
                <span className="text-[12px] text-mute font-semibold">Step {i + 1}</span>
              </div>
              <div className="font-semibold text-ink">{s.title}</div>
              <p className="text-[13px] text-mute">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Who it's for */}
      <section className="bg-card border-y border-line">
        <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-14 grid gap-4 md:grid-cols-3">
          <Audience
            icon={Megaphone}
            title="Brands & agencies"
            body="Plan outdoor and digital campaigns across cities, compare media, approve quotes and download proof-backed reports."
            cta={<Link to="/register"><Btn className="w-full">Start as a client</Btn></Link>}
          />
          <Audience
            icon={Store}
            title="Media owners"
            body="List hoardings, screens, vehicles and retail spaces. Get verified, receive work orders and track your payouts."
            cta={
              <Link to="/register" search={{ as: "vendor" }}>
                <Btn variant="dark" className="w-full">List your media</Btn>
              </Link>
            }
          />
          <Audience
            icon={Building2}
            title="Already working with us?"
            body="Clients, media owners, growth partners and the OOHRENA team all sign in from one place."
            cta={
              user ? (
                <Link to={ROLE_HOME[user.role]}><Btn variant="secondary" className="w-full">Go to my workspace</Btn></Link>
              ) : (
                <Link to="/login"><Btn variant="secondary" className="w-full">Sign in</Btn></Link>
              )
            }
          />
        </div>
      </section>

      {/* Media types + promises */}
      <section className="max-w-[1216px] mx-auto px-4 md:px-8 py-14 grid gap-10 md:grid-cols-2">
        <div className="space-y-4">
          <Eyebrow>Media you can book</Eyebrow>
          <h2 className="text-2xl font-semibold">360° outdoor + digital</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_DEFS.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-[13px]"
              >
                <MapPinned className="w-4 h-4 text-saffron-deep" /> {c.name}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Eyebrow>Our transparency promise</Eyebrow>
          <h2 className="text-2xl font-semibold">Client Transparency First</h2>
          <ul className="space-y-3">
            {PROMISES.map((p) => (
              <li key={p} className="flex gap-3 text-[14px] text-ink">
                <BadgeCheck className="w-5 h-5 shrink-0 text-verified mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-[1216px] mx-auto px-4 md:px-8 pb-14">
        <div className="rounded-2xl bg-navy text-navy-foreground p-8 md:p-10 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-saffron font-semibold text-[13px]">
              <ShieldCheck className="w-4 h-4" /> Centralised lead tracking & audit trail
            </div>
            <div className="text-xl md:text-2xl font-semibold">Ready to plan your next campaign?</div>
          </div>
          <Link to="/marketplace">
            <Btn className="h-12 px-6 text-[14px]">Browse verified media</Btn>
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 flex flex-wrap items-center justify-between gap-3 text-[12px] text-mute">
          <span>© {new Date().getFullYear()} OOHRENA</span>
          <nav className="flex gap-4">
            <Link to="/privacy" className="hover:text-ink">Privacy</Link>
            <Link to="/terms" className="hover:text-ink">Terms</Link>
            <Link to="/confidentiality" className="hover:text-ink">Confidentiality</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function Audience({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: typeof Search;
  title: string;
  body: string;
  cta: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line p-6 flex flex-col gap-3 bg-canvas">
      <Icon className="w-6 h-6 text-saffron-deep" />
      <div className="font-semibold text-[16px] text-ink">{title}</div>
      <p className="text-[13px] text-mute flex-1">{body}</p>
      {cta}
    </div>
  );
}
