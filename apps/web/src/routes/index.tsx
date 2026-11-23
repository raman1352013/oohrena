import { createFileRoute, Link } from "@tanstack/react-router";
import { CATEGORY_DEFS } from "@oohrena/shared";
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
  ["LD", "Inquiry"],
  ["QT", "Quote"],
  ["BK", "Booking"],
  ["WO", "Work order"],
  ["CMP", "Proof"],
  ["PAY", "Payment"],
] as const;

function Landing() {
  const { data: user } = useSession();

  return (
    <main>
      <section className="bg-navy text-navy-foreground">
        <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-16 md:py-24 grid gap-12 md:grid-cols-[1.3fr_1fr] items-center">
          <div className="space-y-8">
            <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight text-balance">
              Outdoor advertising <span className="text-saffron">you can track.</span>
            </h1>
            <div className="flex flex-wrap gap-3">
              <Link to="/marketplace">
                <Btn className="h-12 px-6 text-[14px]">Browse media</Btn>
              </Link>
              {user ? (
                <Link to={ROLE_HOME[user.role]}>
                  <Btn variant="secondary" className="h-12 px-6 text-[14px]">
                    My workspace
                  </Btn>
                </Link>
              ) : (
                <Link to="/register" search={{ as: "vendor" }}>
                  <Btn variant="secondary" className="h-12 px-6 text-[14px]">
                    List your media
                  </Btn>
                </Link>
              )}
            </div>
          </div>

          <ol className="rounded-2xl border border-navy-foreground/10 bg-navy-foreground/5 p-2">
            {CHAIN.map(([id, label]) => (
              <li key={id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-mono text-[12px] text-saffron">{id}-2026-000001</span>
                <span className="text-[14px] text-navy-foreground/85">{label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="max-w-[1216px] mx-auto px-4 md:px-8 py-14">
        <ul className="flex flex-wrap gap-2">
          {CATEGORY_DEFS.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink"
            >
              {c.name}
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-line">
        <nav className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 flex flex-wrap gap-4 text-[12px] text-mute">
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
