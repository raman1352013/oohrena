import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { computeQuote } from "@/lib/gst";
import { inr, ist } from "@/lib/format";
import { Btn, Empty, PinLogo } from "@/components/app/kit";

export const Route = createFileRoute("/print/quote/$quoteId")({
  head: ({ params }) => ({ meta: [
    { title: `Quotation ${params.quoteId} — OOHRENA` },
    { name: "description", content: "Printable 18% GST quotation." },
    { property: "og:title", content: `Quotation ${params.quoteId} — OOHRENA` },
    { property: "og:description", content: "Printable 18% GST quotation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PrintQuote,
});

function PrintQuote() {
  const { quoteId } = Route.useParams();
  const s = useStore((x) => x);
  const q = s.quotes.find((x) => x.id === quoteId);
  if (!q) return <Empty title="Quotation not found" />;
  const l = s.leads.find((x) => x.id === q.leadId)!;
  const site = s.sites.find((x) => x.id === q.siteId)!;
  const c = computeQuote(q);
  return (
    <div className="max-w-3xl mx-auto bg-card my-6 p-10 border border-line rounded-xl print:border-0 print:my-0">
      <div className="no-print flex justify-end mb-4"><Btn onClick={() => window.print()}>Print / Save as PDF</Btn></div>
      <div className="flex items-center gap-3"><PinLogo size={36} /><div><div className="font-bold text-xl">OOHRENA</div><div className="text-[12px] text-mute">Outdoor x Digital x Trackable</div></div>
        <div className="ml-auto text-right text-[12px]"><div className="font-mono">{q.id}</div><div className="text-mute">Lead {l.id}</div>{q.sentAt && <div className="text-mute">{ist(q.sentAt)}</div>}</div></div>
      <h1 className="text-2xl font-semibold mt-8">Tax Quotation</h1>
      <div className="grid grid-cols-2 gap-6 mt-4 text-[13px]">
        <div><div className="text-mute">Billed to</div><div className="font-semibold">{l.client}</div><div>{l.contact} · {l.email}</div></div>
        <div><div className="text-mute">Media</div><div className="font-semibold">{site.name}</div><div>{site.corridor}, {site.city} · {site.size} · {l.durationDays} days from {l.startDate}</div></div>
      </div>
      <table className="w-full mt-6 text-[13px]"><tbody>
        {[["Base Media Rental", q.base], [`Star Flex Printing (${site.sqft} sq.ft)`, q.print], ["Frame Mounting & Labour", q.mounting]].map(([k, v]) => <tr key={k as string} className="border-b border-line"><td className="py-2">{k}</td><td className="text-right font-mono">{inr(v as number)}</td></tr>)}
        <tr><td className="py-2 font-semibold">Subtotal</td><td className="text-right font-mono font-semibold">{inr(c.subtotal)}</td></tr>
        <tr><td className="py-1 text-mute">CGST (9%)</td><td className="text-right font-mono">{inr(c.cgst)}</td></tr>
        <tr><td className="py-1 text-mute">SGST (9%)</td><td className="text-right font-mono">{inr(c.sgst)}</td></tr>
        <tr className="border-t-2 border-ink"><td className="py-3 font-bold">Total Campaign Value</td><td className="text-right font-mono font-bold text-lg">{inr(c.total)}</td></tr>
      </tbody></table>
      {q.holdEnabled && <p className="mt-6 text-[12px] text-mute">Inventory is held for 48 hours from dispatch. Approve within the hold window to confirm the booking.</p>}
    </div>
  );
}
