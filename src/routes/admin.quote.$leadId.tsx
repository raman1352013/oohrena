import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronLeft, Clock, Lock, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { actions, quoteStatus, useStore } from "@/lib/store";
import { computeQuote } from "@/lib/gst";
import { inr, left } from "@/lib/format";
import { SITE_IMG } from "@/lib/images";
import { useNow } from "@/hooks/use-now";
import { Btn, Empty, Eyebrow, Pill } from "@/components/app/kit";

export const Route = createFileRoute("/admin/quote/$leadId")({
  head: ({ params }) => ({ meta: [
    { title: `Quotation ${params.leadId} — OOHRENA` },
    { name: "description", content: "Itemized 18% GST quotation builder with 48-hour auto-hold." },
    { property: "og:title", content: `Quotation ${params.leadId} — OOHRENA` },
    { property: "og:description", content: "Itemized 18% GST quotation builder with 48-hour auto-hold." },
  ] }),
  component: QuotePage,
});

function Money({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <input inputMode="numeric" disabled={disabled} value={"₹" + value.toLocaleString("en-IN")} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
      className="w-32 text-right font-mono text-[13px] bg-transparent outline-none rounded px-1 hover:bg-canvas focus:bg-canvas focus:ring-1 focus:ring-saffron disabled:hover:bg-transparent" />
  );
}

function QuotePage() {
  const { leadId } = Route.useParams();
  const s = useStore((x) => x);
  const now = useNow(15000);
  const nav = useNavigate();
  const lead = s.leads.find((l) => l.id === leadId);
  if (!lead) return <div className="p-10"><Empty title="Lead not found" /></div>;
  const q = s.quotes.find((x) => x.id === lead.quoteId);
  if (!q) {
    return <div className="p-10 text-center"><Empty title="No quotation drafted yet" /><Btn onClick={() => actions.ensureDraft(lead.id)}>Assign Vendor & Quote</Btn></div>;
  }
  const site = s.sites.find((x) => x.id === q.siteId)!;
  const vendor = s.vendors.find((x) => x.id === q.vendorId)!;
  const c = computeQuote(q);
  const st = quoteStatus(q, now);
  const editable = st === "draft";
  const sla = lead.createdAt + lead.slaMins * 60000 - now;
  const sqftRate = site.sqft ? Math.round(q.print / site.sqft) : 0;
  const candidates = s.sites.filter((x) => x.status === "live" && (x.city === lead.city || x.id === lead.siteId));
  const up = (p: Partial<typeof q>) => actions.updateQuote(q.id, p);

  function release() {
    const err = actions.releaseQuote(q!.id);
    if (err) return toast.error(err);
    toast.success(`${q!.id} released to ${lead!.client}${q!.holdEnabled ? ` · ${site.name} locked for 48h` : ""}`);
    nav({ to: "/admin" });
    return undefined;
  }

  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-7">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/admin" className="flex items-center gap-1 text-[13px] text-mute hover:text-ink pr-5 border-r border-line"><ChevronLeft size={15} />Lead Inbox</Link>
        <div>
          <div className="font-mono text-[11px] text-mute">{lead.id}</div>
          <h1 className="text-[22px] font-semibold">{lead.client} — {lead.contact}</h1>
        </div>
        <span className="px-3 py-1 rounded-full border border-line text-[12px] text-mute bg-card">
          {st === "draft" ? "Draft Quotation" : st === "sent" ? "Sent · Awaiting client" : st === "approved" ? "Approved" : st === "revision" ? "Revision requested" : st === "expired" ? "Hold expired" : "Rejected"}
        </span>
        <div className="ml-auto flex items-center gap-2 h-10 px-4 rounded-lg border border-saffron/30 bg-saffron/10 text-saffron-deep font-mono text-[14px]">
          <Clock size={14} />{st === "draft" || lead.status === "revision" ? <>SLA <span className="text-[15px]">{sla > 0 ? `${left(sla).replace(" left", "")} remaining` : "breached"}</span></> : st === "sent" ? <>HOLD {left((q.holdUntil ?? now) - now).replace(" left", "")}</> : <>SLA closed</>}
        </div>
      </div>

      {q.clientNote && <div className="mt-5 rounded-lg border border-hold/30 bg-hold-soft px-4 py-3 text-[13px]"><b>Client note:</b> {q.clientNote}</div>}

      <div className="mt-7 grid lg:grid-cols-[400px_1fr] gap-6">
        <div className="space-y-5">
          <section className="bg-card border border-line rounded-xl overflow-hidden">
            <img src={site.image === "tower" ? SITE_IMG.tower : SITE_IMG[site.image]} alt={site.name} className="h-28 w-full object-cover" />
            <div className="p-5">
              <Eyebrow>Client & Media</Eyebrow>
              <div className="font-semibold text-[15px] mt-2">{lead.client === "Tata Capital" ? "Tata Capital Financial Services" : lead.client}</div>
              <div className="mt-3 text-[13px] space-y-3">
                <div className="flex justify-between gap-3"><span className="text-mute">Corridor</span>
                  <span className="text-right"><span className="font-medium">{site.corridor}</span><br />
                    {editable && candidates.length > 1 ? (
                      <select value={q.siteId} onChange={(e) => up({ siteId: e.target.value })} className="text-mute bg-transparent text-right outline-none">
                        {candidates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>) : <span className="text-mute">{site.name}</span>}
                  </span></div>
                <div className="flex justify-between"><span className="text-mute">Media size</span><span className="font-medium">{site.size} · {site.sqft} sq.ft</span></div>
                <div className="flex justify-between"><span className="text-mute">Duration</span><span className="font-medium">{lead.durationDays} Days</span></div>
              </div>
            </div>
          </section>
          <section className="bg-card border border-line rounded-xl p-5">
            <Eyebrow>Assigned Vendor</Eyebrow>
            <div className="flex items-center gap-3 mt-3">
              <span className="w-10 h-10 rounded-full bg-navy text-navy-foreground grid place-items-center text-[13px] font-semibold">{vendor.initials}</span>
              <div><div className="font-semibold">{vendor.name}</div><div className="text-[12px] text-mute">{vendor.owner}</div></div>
            </div>
            <div className={`mt-4 flex items-center gap-2 text-[12px] ${vendor.kyc === "verified" ? "text-verified" : "text-hold"}`}><Check size={14} />{vendor.kyc === "verified" ? "KYC Verified — GSTIN & PAN Active" : "KYC pending — verify before releasing"}</div>
            <div className="border-t border-line mt-4 pt-4 flex justify-between items-center"><span className="text-[13px] text-mute">Media owner payout</span>
              <span className="text-[17px]"><Money value={q.payout} disabled={!editable} onChange={(n) => up({ payout: n })} /></span></div>
            {q.payout > c.subtotal && <p className="text-[12px] text-destructive mt-2">Payout is higher than the client subtotal.</p>}
          </section>
        </div>

        <div className="space-y-5">
          <section className="bg-card border border-line rounded-xl overflow-hidden">
            <div className="px-6 h-14 flex items-center border-b border-line"><h2 className="font-semibold text-[15px]">Itemized GST Quote</h2><span className="ml-auto font-mono text-[11px] text-mute">{q.id}</span></div>
            <div className="px-6 text-[13px]">
              <div className="flex justify-between items-center h-12 border-b border-line">Base Media Rental ({lead.durationDays} Days)<Money value={q.base} disabled={!editable} onChange={(n) => up({ base: n })} /></div>
              <div className="flex justify-between items-center h-12 border-b border-line">
                <span>Star Flex Printing <span className="text-mute">{site.sqft} sq.ft @ ₹
                  {editable ? <input type="number" min={0} value={sqftRate} onChange={(e) => up({ print: site.sqft * (Number(e.target.value) || 0) })} className="w-8 bg-transparent outline-none hover:bg-canvas rounded [appearance:textfield]" /> : sqftRate}/sq.ft</span></span>
                <span className="font-mono">{inr(q.print)}</span></div>
              <div className="flex justify-between items-center h-12 border-b border-line">Frame Mounting & Labour<Money value={q.mounting} disabled={!editable} onChange={(n) => up({ mounting: n })} /></div>
              <div className="flex justify-between items-center h-11 font-semibold">Subtotal<span className="font-mono">{inr(c.subtotal)}</span></div>
              <div className="flex justify-between h-8 text-mute">CGST (9%)<span className="font-mono">{inr(c.cgst)}</span></div>
              <div className="flex justify-between h-8 text-mute">SGST (9%)<span className="font-mono">{inr(c.sgst)}</span></div>
            </div>
            <div className="bg-navy text-navy-foreground px-6 py-5 flex items-center mt-2">
              <div><div className="font-semibold text-[13px]">Total Campaign Value</div><div className="text-[11px] text-navy-foreground/60">18% GST incl.</div></div>
              <div className="ml-auto font-mono text-3xl">{inr(c.total)}</div>
            </div>
          </section>
          <section className="bg-card border border-line rounded-xl px-6 py-4 flex items-center gap-4">
            <Lock size={17} />
            <div className="flex-1"><div className="font-semibold text-[14px]">48-Hour Auto-Hold</div>
              <div className="text-[12px] text-mute">{st === "sent" && q.holdUntil ? `${site.name} locked until ${new Date(q.holdUntil).toLocaleString("en-IN")}` : `Lock ${site.name} for 48 hours upon dispatch to prevent double-booking`}</div></div>
            {st === "sent" && q.holdUntil ? <Pill tone="hold">Locked · {left(q.holdUntil - now)}</Pill> : <Switch checked={q.holdEnabled} disabled={!editable} onCheckedChange={(v) => up({ holdEnabled: v })} />}
          </section>
        </div>
      </div>

      <div className="border-t border-line mt-6 pt-5 flex flex-wrap justify-end gap-3">
        {editable ? (
          <>
            <Btn variant="secondary" onClick={() => { actions.saveDraft(q.id); toast.success("Draft saved"); }}>Save Draft</Btn>
            <Btn variant="secondary" onClick={() => window.open(`/print/quote/${q.id}`, "_blank")}>Download PDF Preview</Btn>
            <Btn onClick={release}>Release 18% GST Quotation to Client</Btn>
          </>
        ) : (
          <>
            <Btn variant="secondary" onClick={() => window.open(`/print/quote/${q.id}`, "_blank")}>Download PDF</Btn>
            {(st === "revision" || st === "expired" || st === "rejected") && <Btn onClick={() => { actions.ensureDraft(lead.id); toast.success("Revised draft created"); }}>Create revised quote</Btn>}
          </>
        )}
      </div>
    </div>
  );
}
