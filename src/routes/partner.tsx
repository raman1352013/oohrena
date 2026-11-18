import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { computeQuote } from "@/lib/gst";
import { inr } from "@/lib/format";
import { Empty, Eyebrow, KCard, Pill } from "@/components/app/kit";
import { RequestQuoteDialog } from "@/components/app/RequestQuoteDialog";

export const Route = createFileRoute("/partner")({
  head: () => ({ meta: [
    { title: "City Growth Partner — OOHRENA" },
    { name: "description", content: "Refer advertisers to OOHRENA media and track referral commission." },
    { property: "og:title", content: "City Growth Partner — OOHRENA" },
    { property: "og:description", content: "Refer advertisers and track commission." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Partner,
});

function Partner() {
  const s = useStore((x) => x);
  const [site, setSite] = useState<string>();
  const leads = s.leads.filter((l) => l.partner);
  const won = leads.filter((l) => l.status === "approved");
  const comm = won.reduce((a, l) => { const q = s.quotes.find((x) => x.id === l.quoteId); return a + (q ? computeQuote(q).subtotal * 0.05 : 0); }, 0);
  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <div><Eyebrow>City Growth Partner</Eyebrow><h1 className="text-[22px] font-semibold mt-1">Referrals & commission</h1><p className="text-[13px] text-mute mt-1">Earn 5% of media value (pre-GST) on every referred campaign that goes live.</p></div>
      <div className="bg-card border border-line rounded-xl grid grid-cols-3 divide-x divide-line">
        {[["Referred leads", leads.length], ["Converted", won.length], ["Commission earned", inr(comm)]].map(([k, v]) => <div key={k as string} className="p-4"><div className="text-[12px] text-mute">{k}</div><div className="text-xl font-bold mt-2">{v}</div></div>)}
      </div>
      <KCard title="Refer a new advertiser">
        <div className="flex flex-wrap gap-3 items-center">
          <select value={site ?? ""} onChange={(e) => setSite(e.target.value || undefined)} className="h-10 rounded-lg border border-line bg-card px-3 text-[13px] flex-1 min-w-60">
            <option value="">Choose a media site…</option>{s.sites.filter((x) => x.status === "live").map((x) => <option key={x.id} value={x.id}>{x.name} · {x.city}</option>)}
          </select>
          <span className="text-[12px] text-mute">Pick a site to enter the advertiser's details.</span>
        </div>
      </KCard>
      <RequestQuoteDialog site={s.sites.find((x) => x.id === site)} months={1} open={!!site} onOpenChange={(v) => { if (!v) { setSite(undefined); } }} source="partner" />
      <KCard title="My referrals" bodyClass="divide-y divide-line">
        {leads.length ? leads.map((l) => <div key={l.id} className="px-5 py-3 flex items-center gap-4 text-[13px]"><span className="font-mono text-[12px]">{l.id}</span><span className="flex-1">{l.client} · {l.corridor}</span><span>{inr(l.budget)}</span><Pill tone={l.status === "approved" ? "verified" : l.status === "rejected" ? "danger" : "hold"}>{l.status}</Pill></div>)
          : <Empty title="No referrals yet" />}
      </KCard>
    </div>
  );
}
