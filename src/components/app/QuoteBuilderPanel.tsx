import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { actions, quoteStatus, useStore } from "@/lib/store";
import { computeQuote } from "@/lib/gst";
import { inr, left } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { Btn, Eyebrow, Pill } from "./kit";

export function QuoteBuilderPanel({ leadId }: { leadId?: string }) {
  const s = useStore((x) => x);
  const now = useNow();
  const nav = useNavigate();
  const lead = s.leads.find((l) => l.id === leadId);
  if (!lead) return <aside className="p-6 text-mute text-[13px]"><Eyebrow>Quote Builder</Eyebrow><p className="mt-3">Select a lead from the queue to preview its quotation.</p></aside>;
  const q = s.quotes.find((x) => x.id === lead.quoteId);
  const site = s.sites.find((x) => x.id === (q?.siteId ?? lead.siteId));
  const c = q ? computeQuote(q) : null;
  const st = q ? quoteStatus(q, now) : null;
  return (
    <aside className="p-6 flex flex-col h-full">
      <Eyebrow>Quote Builder</Eyebrow>
      <div className="text-xl font-semibold mt-2">{lead.id}</div>
      <div className="text-mute text-[13px] mt-1">{lead.client} · {lead.media}</div>
      {q && c ? (
        <>
          <div className="mt-5 text-[13px] space-y-3">
            <div className="flex justify-between"><span className="text-mute">Base Rent</span><span className="font-semibold">{inr(q.base)}</span></div>
            <div className="flex justify-between"><span className="text-mute">Flex Print</span><span className="font-semibold">{inr(q.print)}</span></div>
            <div className="flex justify-between"><span className="text-mute">Mounting</span><span className="font-semibold">{inr(q.mounting)}</span></div>
            <div className="border-t border-line pt-3 flex justify-between"><span className="text-mute">GST 18%</span><span className="font-semibold">{inr(c.gst)}</span></div>
          </div>
          <div className="mt-5 rounded-xl border border-line bg-canvas p-4">
            <div className="text-[12px] text-mute">Total payable</div>
            <div className="text-3xl font-bold mt-1">{inr(c.total)}</div>
          </div>
          {st && st !== "draft" && (
            <div className="mt-4"><Pill tone={st === "sent" ? "hold" : st === "approved" ? "verified" : st === "expired" ? "danger" : "neutral"}>
              {st === "sent" ? `Sent · hold ${left((q.holdUntil ?? now) - now)}` : st === "approved" ? "Approved by client" : st === "expired" ? "Hold expired" : st === "revision" ? "Revision requested" : "Rejected"}
            </Pill>{q.clientNote && <p className="text-[12px] text-mute mt-2">“{q.clientNote}”</p>}</div>
          )}
          <Link to="/admin/quote/$leadId" params={{ leadId: lead.id }} className="mt-4 text-[13px] font-medium text-saffron-deep hover:underline">Open full quote builder →</Link>
          <div className="mt-auto pt-6">
            {st === "draft" ? (
              <Btn className="w-full" disabled={!site} onClick={() => { const err = actions.releaseQuote(q.id); err ? toast.error(err) : toast.success(`${q.id} released · ${site?.name} locked for 48h`); }}>Release Quote to Client</Btn>
            ) : (
              <Btn variant="secondary" className="w-full" onClick={() => nav({ to: "/admin/quote/$leadId", params: { leadId: lead.id } })}>{st === "revision" || st === "expired" || st === "rejected" ? "Create revised quote" : "View Quote"}</Btn>
            )}
          </div>
        </>
      ) : (
        <div className="mt-auto pt-6"><Btn className="w-full" onClick={() => { actions.ensureDraft(lead.id); nav({ to: "/admin/quote/$leadId", params: { leadId: lead.id } }); }}>Assign Vendor & Quote</Btn></div>
      )}
    </aside>
  );
}
