import { createFileRoute, Link } from "@tanstack/react-router";
import { Eyebrow, KCard } from "@/components/app/kit";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy (v1.0) — OOHRENA" },
      {
        name: "description",
        content: "Privacy Policy and data protection terms for OOHRENA marketplace users.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="max-w-[800px] mx-auto px-4 md:px-8 py-10 space-y-6 text-[14px] leading-relaxed">
      <div>
        <Eyebrow>Legal & Compliance</Eyebrow>
        <h1 className="text-2xl font-bold mt-1">Privacy Policy</h1>
        <p className="text-mute text-[12px] mt-1">Version 1.0 · Last Updated November 2026</p>
      </div>

      <KCard>
        <div className="p-6 space-y-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              1. Overview & Data Controller
            </h2>
            <p className="text-mute">
              OOHRENA ("we", "us", "our") operates an outdoor and digital media advertising
              marketplace. This Privacy Policy explains how personal and commercial data is
              collected, processed, and protected when using our web platform, APIs, and partner
              portals.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">2. Data We Collect</h2>
            <ul className="list-disc pl-5 space-y-1 text-mute">
              <li>
                <strong>Account & Identity:</strong> Full name, verified business email, mobile
                number, company name, role.
              </li>
              <li>
                <strong>KYC & Regulatory:</strong> PAN card, GSTIN certificate, company registration
                documents (AES-256-GCM encrypted at rest).
              </li>
              <li>
                <strong>Financial Information:</strong> Bank account numbers and IFSC codes
                (encrypted, masked, accessible strictly to designated Finance officers).
              </li>
              <li>
                <strong>Execution & Telemetry:</strong> Geotagged campaign display proofs, timestamp
                verification, device metadata, IP address, and append-only audit trail logs.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">3. How Information is Used</h2>
            <p className="text-mute">
              We process information solely to verify inventory, facilitate media holds and
              quotations, execute work orders, verify display proof against GPS coordinates,
              generate tax invoices, and prevent duplicate booking or fraudulent billing.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              4. Storage & Security Controls
            </h2>
            <p className="text-mute">
              Sensitive documents and bank accounts are stored using AES-256-GCM encryption with
              per-session key derivation. Proof media is served through short-lived (10-minute)
              cryptographic signed URLs. Privileged actions require multi-factor authentication
              (TOTP) and re-authentication within 10 minutes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">5. Contact & Data Rights</h2>
            <p className="text-mute">
              You may request an export of your personal audit logs or close your account by
              contacting{" "}
              <a href="mailto:privacy@oohrena.com" className="text-accent underline">
                privacy@oohrena.com
              </a>
              .
            </p>
          </section>
        </div>
      </KCard>

      <div className="text-center text-[12px] text-mute pt-4">
        <Link to="/terms" className="underline hover:text-foreground mr-4">
          Terms of Use
        </Link>
        <Link to="/confidentiality" className="underline hover:text-foreground">
          Confidentiality & Anti-Circumvention
        </Link>
      </div>
    </div>
  );
}
