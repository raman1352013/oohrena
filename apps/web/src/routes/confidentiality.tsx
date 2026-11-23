import { createFileRoute, Link } from "@tanstack/react-router";
import { KCard } from "@/components/app/kit";

export const Route = createFileRoute("/confidentiality")({
  head: () => ({
    meta: [
      { title: "Confidentiality & Anti-Circumvention (v1.0) — OOHRENA" },
      {
        name: "description",
        content:
          "Confidentiality and anti-circumvention agreement for media owners, clients and partners.",
      },
    ],
  }),
  component: ConfidentialityPage,
});

function ConfidentialityPage() {
  return (
    <div className="max-w-[800px] mx-auto px-4 md:px-8 py-10 space-y-6 text-[14px] leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold">Confidentiality & Anti-Circumvention</h1>
        <p className="text-mute text-[12px] mt-1">Version 1.0 · Last Updated November 2026</p>
      </div>

      <KCard>
        <div className="p-6 space-y-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              1. Non-Disclosure Obligations
            </h2>
            <p className="text-mute">
              All proprietary media rates, vendor cost structures, client lead requirements,
              shortlists, unpublished location availability, and negotiated platform margins
              revealed through the OOHRENA marketplace are strictly confidential.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              2. Anti-Circumvention Covenant
            </h2>
            <p className="text-mute">
              Vendors, Clients, and Growth Partners explicitly agree not to directly or indirectly
              solicit, negotiate, contract with, or bypass OOHRENA for any media site, lead, or
              client first introduced or discovered through the platform for a period of 24 months
              from the date of initial introduction.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              3. Marketplace Integrity & Audit Records
            </h2>
            <p className="text-mute">
              Every inquiry, vendor assignment, quotation release, and transaction is immutably
              logged in an append-only audit trail. Any attempted out-of-band communication or
              circumventive booking will result in immediate suspension of vendor KYC, forfeiture of
              accrued commissions, and claims for liquidated damages equal to full platform fees.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">4. Enforceability</h2>
            <p className="text-mute">
              This agreement forms an integral part of onboarding registration and applies to all
              parties acting on behalf of registered corporate entities and media ownership
              agencies.
            </p>
          </section>
        </div>
      </KCard>

      <div className="text-center text-[12px] text-mute pt-4">
        <Link to="/privacy" className="underline hover:text-foreground mr-4">
          Privacy Policy
        </Link>
        <Link to="/terms" className="underline hover:text-foreground">
          Terms of Use
        </Link>
      </div>
    </div>
  );
}
