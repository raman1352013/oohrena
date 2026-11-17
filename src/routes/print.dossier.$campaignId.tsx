import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { computeQuote } from "@/lib/gst";
import { inr, ist, latlng } from "@/lib/format";
import { proofSrc } from "@/lib/images";
import { Btn, Empty, PinLogo } from "@/components/app/kit";

export const Route = createFileRoute("/print/dossier/$campaignId")({
  head: ({ params }) => ({ meta: [
    { title: `Campaign Audit Dossier ${params.campaignId} — OOHRENA` },
    { name: "description", content: "Printable campaign audit dossier with certified day and night GPS proofs." },
    { property: "og:title", content: `Campaign Audit Dossier ${params.campaignId}` },
    { property: "og:description", content: "Certified proof of display with full record chain." },
  ] }),
  component: Dossier,
});

function Dossier() {
  const { campaignId } = Route.useParams();
  const s = useStore((x) => x);
  const c = s.campaigns.find((x) => x.id === campaignId);
  if (!c) return <Empty title="Campaign not found" />;
  const w = s.workOrders.find((x) => x.id === c.woId)!;
  const q = s.quotes.find((x) => x.id === w.quoteId)!;
  const l = s.leads.find((x) => x.id === w.leadId)!;
  const site = s.sites.find((x) => x.id === w.siteId)!;
  const v = s.vendors.find((x) => x.id === w.vendorId)!;
  const e = s.escrows.find((x) => x.campaignId === c.id);
  const bk = s.bookings.find((b) => b.id === w.bookingId)!;
  const chain = [["Lead", l.id], ["Quote", q.id], ["Booking", bk.id], ["Work Order", w.id], ["Campaign", c.id], ["Escrow", e?.id ?? "—"]];
  return (
    <div className="max-w-3xl mx-auto bg-card my-6 p-10 border border-line rounded-xl print:border-0 print:my-0 text-[13px]">
      <div className="no-print flex justify-end mb-4"><Btn onClick={() => window.print()}>Print / Save as PDF</Btn></div>
      <div className="flex items-center gap-3"><PinLogo size={36} /><div><div className="font-bold text-xl">OOHRENA</div><div className="text-[12px] text-mute">Ab Advertising Sirf Dikhegi Nahi... Track Bhi Hogi!</div></div></div>
      <h1 className="text-2xl font-semibold mt-8">Campaign Audit Dossier</h1>
      <p className="text-mute">{l.client} · {site.name}, {site.city} · {bk.start} → {bk.end}</p>
      <div className="mt-5 flex flex-wrap gap-1 items-center font-mono text-[11px]">{chain.map(([k, id], i) => <span key={k}>{i > 0 && <span className="text-mute mx-1">→</span>}<span className="px-2 py-1 rounded bg-muted">{k} {id}</span></span>)}</div>
      <div className="grid grid-cols-2 gap-4 mt-6">
        {([["Day proof", w.day], ["Night illumination", w.night]] as const).map(([k, p]) => p && (
          <div key={k} className="border border-line rounded-lg overflow-hidden"><img src={proofSrc(p.image)} alt={k} className="h-48 w-full object-cover" />
            <div className="p-3 text-[12px] space-y-0.5"><b>{k}</b><div>{ist(p.ts)}</div><div className="font-mono">{latlng(p.lat, p.lng)}</div><div>GPS distance {p.distance}m (&lt;50m passed)</div></div></div>))}
      </div>
      <table className="w-full mt-6"><tbody>
        {[["Media", `${site.category} · ${site.size}`], ["Vendor", `${v.name} (GSTIN ${v.gstin})`], ["Installer", w.installer], ["Material", w.material], ["Certified", `${ist(c.certifiedAt)} by ${c.certifiedBy}`], ["Campaign value (incl. 18% GST)", inr(computeQuote(q).total)], ["Escrow", e ? (e.status === "released" ? `Released · UTR ${e.utr}` : "Awaiting finance checker") : "—"]].map(([k, val]) => (
          <tr key={k} className="border-b border-line"><td className="py-2 text-mute w-1/3">{k}</td><td className="py-2">{val}</td></tr>))}
      </tbody></table>
    </div>
  );
}
