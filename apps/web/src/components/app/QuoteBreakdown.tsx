import { GST_PCT, PRICING_UNIT_LABEL, type QuoteStatus } from "@oohrena/shared";
import { inr } from "@/lib/format";
import type { QuoteView } from "@/lib/deals-api";
import { Pill } from "@/components/app/kit";

export const QUOTE_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  released: "Awaiting client",
  approved: "Approved",
  rejected: "Rejected",
  revision_requested: "Revision requested",
  expired: "Expired",
  superseded: "Superseded",
};
export function QuotePill({ status }: { status: QuoteStatus }) {
  const tone =
    status === "approved"
      ? "verified"
      : status === "released"
        ? "saffron"
        : status === "revision_requested" || status === "draft"
          ? "hold"
          : status === "rejected" || status === "expired"
            ? "danger"
            : "neutral";
  return <Pill tone={tone}>{QUOTE_LABEL[status]}</Pill>;
}

/** Itemised quotation: every line, the platform fee and GST shown separately. Totals come from the server. */
export function QuoteBreakdown({ q, showCost }: { q: QuoteView; showCost?: boolean }) {
  return (
    <div className="space-y-3 text-[13px]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px]">
          <thead>
            <tr className="text-left text-[12px] text-mute border-b border-line">
              {[
                "Media",
                "Dates",
                "Rate × qty × units",
                "Media cost",
                "Production",
                "Installation",
                "Line total",
                ...(showCost ? ["Vendor cost"] : []),
              ].map((h, idx) => (
                <th key={`${idx}-${h}`} className="font-normal py-2 pr-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.items.map((i) => (
              <tr key={i.inventoryId} className="border-b border-line align-top">
                <td className="py-2 pr-3">
                  <div className="font-medium">{i.title}</div>
                  <div className="text-[11px] text-mute font-mono">
                    {i.inventoryId} · {i.city}
                  </div>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {i.from} → {i.to}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {inr(i.rate)} {PRICING_UNIT_LABEL[i.pricingUnit]} × {i.qty} × {i.billableUnits}
                </td>
                <td className="py-2 pr-3">{inr(i.media)}</td>
                <td className="py-2 pr-3">{inr(i.production)}</td>
                <td className="py-2 pr-3">{inr(i.installation)}</td>
                <td className="py-2 pr-3 font-semibold">{inr(i.lineTotal)}</td>
                {showCost && (
                  <td className="py-2 pr-3 text-mute">
                    {i.vendorCost !== undefined ? inr(i.vendorCost) : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto max-w-sm space-y-1">
        {(
          [
            ["Subtotal (media + production + installation)", q.subtotal],
            [`Platform / service fee (${q.serviceFeePct}%)`, q.serviceFee],
            [`CGST ${GST_PCT / 2}%`, q.cgst],
            [`SGST ${GST_PCT / 2}%`, q.sgst],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <span className="text-mute">{k}</span>
            <span>{inr(v)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-line pt-1.5 text-[15px] font-semibold">
          <span>Total (INR)</span>
          <span>{inr(q.total)}</span>
        </div>
        {showCost && q.margin !== undefined && (
          <div className="flex justify-between gap-4 text-[12px] text-mute">
            <span>Vendor cost {inr(q.vendorCostTotal ?? 0)} · margin before fee</span>
            <span>{inr(q.margin)}</span>
          </div>
        )}
        <div className="text-[11px] text-mute">
          Valid until {q.validUntil}. Amounts are rounded to the nearest rupee.
        </div>
      </div>
    </div>
  );
}
