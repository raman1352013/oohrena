import { createFileRoute } from "@tanstack/react-router";
import { useQuoteDetail } from "@/lib/deals-api";
import { inr, ist } from "@/lib/format";
import { Btn, Empty, PinLogo } from "@/components/app/kit";

export const Route = createFileRoute("/print/quote/$quoteId")({
  head: ({ params }) => ({
    meta: [
      { title: `Quotation ${params.quoteId} — OOHRENA` },
      { name: "description", content: "Printable 18% GST quotation." },
      { property: "og:title", content: `Quotation ${params.quoteId} — OOHRENA` },
      { property: "og:description", content: "Printable 18% GST quotation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrintQuote,
});

function PrintQuote() {
  const { quoteId } = Route.useParams();
  const { data: q, isLoading, error } = useQuoteDetail(quoteId);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto my-12 text-center text-mute text-[14px]">
        Loading quotation...
      </div>
    );
  }
  if (error || !q) {
    return <Empty title="Quotation not found" />;
  }

  const downloadPdf = () => {
    window.open(`/api/v1/quotes/${quoteId}?format=pdf`, "_blank");
  };

  return (
    <div className="max-w-3xl mx-auto bg-card my-6 p-10 border border-line rounded-xl print:border-0 print:my-0 shadow-sm">
      <div className="no-print flex justify-end gap-3 mb-6">
        <Btn size="sm" tone="secondary" onClick={downloadPdf}>
          Download Official PDF
        </Btn>
        <Btn size="sm" onClick={() => window.print()}>
          Print Page
        </Btn>
      </div>

      <div className="flex items-center gap-3">
        <PinLogo size={36} />
        <div>
          <div className="font-bold text-xl text-ink">OOHRENA</div>
          <div className="text-[12px] text-mute">Outdoor x Digital x Trackable</div>
        </div>
        <div className="ml-auto text-right text-[12px]">
          <div className="font-mono font-semibold text-ink">{q.quoteId}</div>
          <div className="text-mute">Lead Ref: {q.leadId}</div>
          {q.createdAt && <div className="text-mute">Created: {ist(q.createdAt)}</div>}
          <div className="text-mute">
            Valid Until: <span className="font-medium text-ink">{q.validUntil}</span>
          </div>
        </div>
      </div>

      <h1 className="text-2xl font-semibold mt-8 text-ink">Commercial Quotation</h1>
      <p className="text-[12px] text-mute mt-1">
        Status: <span className="uppercase font-semibold text-ink">{q.status}</span>
      </p>

      <div className="mt-6 border-t border-b border-line py-4">
        <div className="text-[12px] uppercase font-semibold text-mute tracking-wider mb-2">
          Campaign Items
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-mute text-left text-[11px] uppercase tracking-wider">
              <th className="py-2">Item</th>
              <th className="py-2">City</th>
              <th className="py-2">Dates</th>
              <th className="py-2 text-right">Media</th>
              <th className="py-2 text-right">Prod & Inst</th>
              <th className="py-2 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((it, idx) => (
              <tr key={it.inventoryId || idx} className="border-b border-line/50">
                <td className="py-2.5 font-medium">{it.title}</td>
                <td className="py-2.5 text-mute">{it.city}</td>
                <td className="py-2.5 text-mute text-[12px]">
                  {it.from} to {it.to}
                </td>
                <td className="py-2.5 text-right font-mono">{inr(it.media)}</td>
                <td className="py-2.5 text-right font-mono">
                  {inr(it.production + it.installation)}
                </td>
                <td className="py-2.5 text-right font-mono font-semibold">{inr(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end">
        <div className="w-72 space-y-2 text-[13px]">
          <div className="flex justify-between text-mute">
            <span>Media Subtotal</span>
            <span className="font-mono text-ink">{inr(q.mediaTotal)}</span>
          </div>
          <div className="flex justify-between text-mute">
            <span>Production & Installation</span>
            <span className="font-mono text-ink">
              {inr(q.productionTotal + q.installationTotal)}
            </span>
          </div>
          <div className="flex justify-between text-mute font-medium border-t border-line pt-2">
            <span>Subtotal</span>
            <span className="font-mono text-ink">{inr(q.subtotal)}</span>
          </div>
          {q.serviceFee > 0 && (
            <div className="flex justify-between text-mute">
              <span>Platform Service Fee</span>
              <span className="font-mono text-ink">{inr(q.serviceFee)}</span>
            </div>
          )}
          <div className="flex justify-between text-mute">
            <span>CGST (9%)</span>
            <span className="font-mono text-ink">{inr(q.cgst)}</span>
          </div>
          <div className="flex justify-between text-mute">
            <span>SGST (9%)</span>
            <span className="font-mono text-ink">{inr(q.sgst)}</span>
          </div>
          <div className="flex justify-between font-bold text-[15px] border-t-2 border-ink pt-2 text-ink">
            <span>Total Campaign Value</span>
            <span className="font-mono">{inr(q.total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-muted/40 rounded-lg text-[12px] text-mute space-y-1">
        <p className="font-semibold text-ink">Terms & Conditions:</p>
        <p>
          • Inventory holds are active until {q.validUntil}. Approve quote prior to expiry to
          guarantee booking.
        </p>
        <p>
          • Standard payment terms: 50% advance upon invoice issuance; remaining 50% due within 7
          days of display launch.
        </p>
        <p>• All prices are in INR and include statutory 18% Goods and Services Tax (GST).</p>
      </div>
    </div>
  );
}
