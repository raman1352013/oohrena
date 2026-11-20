import { createFileRoute, Link } from "@tanstack/react-router";
import { Eyebrow, KCard } from "@/components/app/kit";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use (v1.0) — OOHRENA" },
      {
        name: "description",
        content: "Terms and conditions of use for the OOHRENA marketplace platform.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="max-w-[800px] mx-auto px-4 md:px-8 py-10 space-y-6 text-[14px] leading-relaxed">
      <div>
        <Eyebrow>Legal & Compliance</Eyebrow>
        <h1 className="text-2xl font-bold mt-1">Terms of Use</h1>
        <p className="text-mute text-[12px] mt-1">Version 1.0 · Last Updated November 2026</p>
      </div>

      <KCard>
        <div className="p-6 space-y-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">1. Acceptance & User Roles</h2>
            <p className="text-mute">
              By accessing or registering with OOHRENA, you agree to be bound by these Terms of Use.
              The platform facilitates media inquiries, inventory verification, quotation holds,
              work order execution, and maker-checker financial reconciliations across five
              authorized roles: Client, Vendor, Central Admin, Growth Partner, and Finance.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              2. Inventory Verification & Booking Integrity
            </h2>
            <p className="text-mute">
              All inventory listings are subject to strict administrative review. DEMO or unverified
              inventory can never be held or booked. Double bookings are prevented at the database
              layer via atomic transaction locks. 48-hour holds automatically expire if quotation
              approval is not finalized within SLA.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              3. Proof of Display & Execution Standards
            </h2>
            <p className="text-mute">
              Vendors must upload geotagged, server-timestamped photographic and video proof of
              mounting and periodic display. Proofs deviating from registered GPS coordinates by
              more than 100 meters are flagged for manual review. Work orders can only advance to
              Live or Completed states upon verified proof approval.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              4. Financial Terms & Maker-Checker Safeguards
            </h2>
            <p className="text-mute">
              All financial entries (client receipts, vendor payouts) require maker-checker dual
              authorization. Whoever records a payment can never verify that same transaction. Tax
              invoices adhere to Indian GST regulations with CGST/SGST and IGST itemization.
              Cancellations follow the schedule defined in the platform rules.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              5. Governing Law & Dispute Resolution
            </h2>
            <p className="text-mute">
              These terms are governed by the laws of India. Any unresolved dispute arising out of
              or in connection with these terms shall be subject to arbitration under the
              Arbitration and Conciliation Act, 1996, with seat in India.
            </p>
          </section>
        </div>
      </KCard>

      <div className="text-center text-[12px] text-mute pt-4">
        <Link to="/privacy" className="underline hover:text-foreground mr-4">
          Privacy Policy
        </Link>
        <Link to="/confidentiality" className="underline hover:text-foreground">
          Confidentiality & Anti-Circumvention
        </Link>
      </div>
    </div>
  );
}
