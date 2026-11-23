import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { inr } from "@/lib/format";
import { assetUrl } from "@/lib/api";
import { useCampaignReport } from "@/lib/reports-api";
import { Btn, Empty, Loading, PinLogo, Pill } from "@/components/app/kit";

export const Route = createFileRoute("/print/dossier/$campaignId")({
  head: ({ params }) => ({
    meta: [
      { title: `Campaign Audit Dossier ${params.campaignId} — OOHRENA` },
      {
        name: "description",
        content: "Certified campaign audit dossier with verified GPS proofs.",
      },
      { property: "og:title", content: `Campaign Audit Dossier ${params.campaignId}` },
      { property: "og:description", content: "Certified proof of display with full record chain." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dossier,
});

function Dossier() {
  const { campaignId } = Route.useParams();
  const rep = useCampaignReport(campaignId);

  if (rep.isPending) {
    return <Loading />;
  }
  if (rep.isError || !rep.data) {
    return <Empty title="Campaign not found" />;
  }

  const d = rep.data;

  return (
    <div className="max-w-3xl mx-auto bg-card my-6 p-10 border border-line rounded-xl print:border-0 print:my-0 text-[13px] space-y-6">
      <div className="no-print flex justify-between items-center gap-2 pb-4 border-b border-line">
        <div className="flex gap-2">
          <a
            href={assetUrl(`/api/v1/reports/client-campaign/${d.campaignId}?format=pdf`)}
            target="_blank"
            rel="noreferrer"
          >
            <Btn variant="primary" className="h-9 gap-1.5">
              <Download size={14} /> Download Certified PDF
            </Btn>
          </a>
          <a
            href={assetUrl(`/api/v1/reports/client-campaign/${d.campaignId}?format=csv`)}
            target="_blank"
            rel="noreferrer"
          >
            <Btn variant="secondary" className="h-9 gap-1.5">
              <Download size={14} /> CSV
            </Btn>
          </a>
        </div>
        <Btn variant="ghost" onClick={() => window.print()}>
          Print / Save as PDF
        </Btn>
      </div>

      <div className="flex items-center gap-3">
        <PinLogo size={36} />
        <div>
          <div className="font-bold text-xl">OOHRENA</div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Campaign Audit Dossier</h1>
          <Pill tone={d.status === "completed" ? "verified" : "neutral"}>{d.status}</Pill>
        </div>
        <p className="text-mute mt-1">
          Campaign {d.campaignId} · Booking {d.bookingId} · {d.start} → {d.end}
        </p>
      </div>

      {/* Spend overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted p-4 rounded-lg">
        <div>
          <div className="text-[11px] text-mute">Invoice Total</div>
          <div className="font-bold text-base">{inr(d.spend.invoiced)}</div>
        </div>
        <div>
          <div className="text-[11px] text-mute">Verified Received</div>
          <div className="font-bold text-base text-verified">{inr(d.spend.received)}</div>
        </div>
        <div>
          <div className="text-[11px] text-mute">Refunded</div>
          <div className="font-bold text-base">{inr(d.spend.refunded)}</div>
        </div>
        <div>
          <div className="text-[11px] text-mute">Balance Due</div>
          <div className="font-bold text-base text-destructive">{inr(d.spend.balance)}</div>
        </div>
      </div>

      {/* Verified proof */}
      <div>
        <h2 className="text-base font-semibold mb-3">Verified Proof of Display</h2>
        {d.proofs.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {d.proofs.map((p) => (
              <div
                key={p.proofId}
                className="border border-line rounded-lg overflow-hidden bg-card"
              >
                <img
                  src={assetUrl(p.url)}
                  alt={`${p.type} proof`}
                  className="h-44 w-full object-cover"
                />
                <div className="p-3 space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>{p.type.toUpperCase()} PROOF</span>
                    <span className="font-mono text-[11px] text-mute">{p.inventoryId}</span>
                  </div>
                  <div className="text-mute text-[12px]">
                    Uploaded: {p.uploadedAt.slice(0, 16).replace("T", " ")}
                  </div>
                  <div className="text-[12px] font-mono bg-muted px-2 py-0.5 rounded">
                    {p.gpsLabel}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No verified proof uploaded" />
        )}
      </div>

      {/* Work Orders */}
      <div>
        <h2 className="text-base font-semibold mb-2">Work Orders</h2>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line text-mute text-[12px]">
              <th className="py-2">WO ID</th>
              <th>Vendor</th>
              <th>Status</th>
              <th>Sites</th>
            </tr>
          </thead>
          <tbody>
            {d.workOrders.map((w) => (
              <tr key={w.workOrderId} className="border-b border-line">
                <td className="py-2 font-mono">{w.workOrderId}</td>
                <td>{w.vendorId}</td>
                <td>
                  <Pill tone={w.status === "completed" ? "verified" : "neutral"}>{w.status}</Pill>
                </td>
                <td>{w.itemsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Issues */}
      {d.issues.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Issues & Resolutions</h2>
          <div className="divide-y divide-line border border-line rounded-lg p-3">
            {d.issues.map((i) => (
              <div key={i.issueId} className="py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {i.category}: {i.description}
                  </span>
                  <Pill tone={i.status === "resolved" ? "verified" : "danger"}>{i.status}</Pill>
                </div>
                {i.resolutionNote && (
                  <div className="text-mute text-[12px]">Resolution: {i.resolutionNote}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
