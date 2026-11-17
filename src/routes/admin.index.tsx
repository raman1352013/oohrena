import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { actions, getState, quoteStatus, useStore, type Lead } from "@/lib/store";
import { computeQuote } from "@/lib/gst";
import { inr, lakh, left } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { Avatar, Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { QuoteBuilderPanel } from "@/components/app/QuoteBuilderPanel";
import { WorkOrderRows } from "@/components/app/WorkOrderRows";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [
    { title: "Central Control Tower — OOHRENA" },
    { name: "description", content: "Priority lead queue, GST quotes, 48h holds, work orders and proof certification." },
    { property: "og:title", content: "Central Control Tower — OOHRENA" },
    { property: "og:description", content: "Admin operations tower for outdoor and digital campaigns." },
  ] }),
  component: AdminTower,
});

type Tab = "leads" | "orders" | "proofs" | "vendors";

function Chip({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="relative h-8 px-3 rounded-lg border border-line bg-card flex items-center gap-1 text-[12px] cursor-pointer">
      <span>{value || label} ▾</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer">
        <option value="">{label}: All</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function AdminTower() {
  const s = useStore((x) => x);
  const now = useNow(15000);
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("leads");
  const [sel, setSel] = useState<string | undefined>(() => getState().leads.find((l) => l.status === "new")?.id);
  const [fc, setFc] = useState(""); const [fm, setFm] = useState(""); const [fs, setFs] = useState("");

  const queue = s.leads.filter((l) => l.status === "new" || l.status === "revision" || l.status === "quoted");
  const newLeads = s.leads.filter((l) => l.status === "new" || l.status === "revision");
  const holds = s.sites.filter((x) => x.holdUntil && x.holdUntil > now).length;
  const proofs = s.workOrders.filter((w) => w.status === "proof_submitted");
  const active = s.workOrders.filter((w) => w.status !== "certified" || true);
  const gmv = s.quotes.filter((q) => q.status === "approved").reduce((a, q) => a + computeQuote(q).total, 0);
  const pendingKyc = s.vendors.filter((v) => v.kyc === "pending").length + s.sites.filter((x) => x.status === "pending").length;
  const slaLeft = (l: Lead) => l.createdAt + l.slaMins * 60000 - now;

  const rows = useMemo(() => queue
    .filter((l) => !fc || l.corridor === fc)
    .filter((l) => !fm || s.sites.find((x) => x.id === l.siteId)?.category === fm)
    .filter((l) => !fs || (fs === "Under 1h" ? l.status !== "quoted" && slaLeft(l) < 3600000 : fs === "Overdue" ? l.status !== "quoted" && slaLeft(l) <= 0 : l.status === "quoted"))
    .sort((a, b) => (a.status === "quoted" ? 1 : 0) - (b.status === "quoted" ? 1 : 0) || slaLeft(a) - slaLeft(b)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [s, fc, fm, fs, now]);

  const kpis = [
    { k: "New Leads", v: newLeads.length, sub: newLeads.length ? "Needs assignment" : undefined },
    { k: "Active Campaigns", v: active.length },
    { k: "Sites on 48h Hold", v: holds },
    { k: "Proofs to Certify", v: proofs.length },
    { k: "GMV", v: lakh(gmv) },
  ];
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "leads", label: "Lead Intake", n: newLeads.length },
    { id: "orders", label: "Active Work Orders", n: s.workOrders.length },
    { id: "proofs", label: "Proof Certification", n: proofs.length },
    { id: "vendors", label: "Vendor KYC", n: pendingKyc },
  ];

  function assign(l: Lead) { actions.ensureDraft(l.id); nav({ to: "/admin/quote/$leadId", params: { leadId: l.id } }); }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] min-h-[calc(100vh-56px)]">
      <main className="p-4 md:p-6 space-y-5 min-w-0">
        <div className="bg-card border border-line rounded-xl grid grid-cols-2 sm:grid-cols-5 divide-x divide-line overflow-hidden">
          {kpis.map((x) => (
            <div key={x.k} className="p-4 border-b sm:border-b-0 border-line">
              <div className="text-[12px] text-mute">{x.k}</div>
              <div className="text-2xl font-bold mt-2">{x.v}</div>
              {x.sub && <div className="text-[11px] text-saffron mt-1">{x.sub}</div>}
            </div>
          ))}
        </div>

        <nav className="flex gap-6 border-b border-line text-[13px] overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("pt-1 pb-2.5 border-b-2 whitespace-nowrap flex items-center gap-1.5", tab === t.id ? "border-navy text-ink font-semibold" : "border-transparent text-mute")}>
              {t.label}
              {tab === t.id ? <span className="px-1.5 rounded bg-navy text-navy-foreground text-[11px]">{t.n}</span> : <span className="text-[11px]">{t.n}</span>}
            </button>
          ))}
        </nav>

        {tab === "leads" && (
          <>
            <KCard title="Priority Lead & Inquiry Queue" bodyClass="" right={
              <div className="flex flex-wrap gap-2">
                <Chip label="Corridor" value={fc} onChange={setFc} options={[...new Set(queue.map((l) => l.corridor))]} />
                <Chip label="Media Category" value={fm} onChange={setFm} options={[...new Set(s.sites.map((x) => x.category))]} />
                <Chip label="SLA Urgency" value={fs} onChange={setFs} options={["Under 1h", "Overdue", "Quote sent"]} />
              </div>}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[860px]">
                  <thead><tr className="text-left text-[12px] text-mute border-b border-line">
                    {["Lead", "Client", "Corridor", "Media", "Budget", "SLA", ""].map((h) => <th key={h} className="font-normal px-5 py-2.5 first:pl-5">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((l) => {
                      const ms = slaLeft(l);
                      const q = s.quotes.find((x) => x.id === l.quoteId);
                      const qs = q ? quoteStatus(q, now) : null;
                      return (
                        <tr key={l.id} onClick={() => setSel(l.id)} className={cn("border-b border-line last:border-0 cursor-pointer hover:bg-canvas h-14", sel === l.id && "bg-saffron/5")}>
                          <td className="px-5 font-mono text-[12px] whitespace-nowrap">{l.id}</td>
                          <td className="px-2"><span className="font-semibold">{l.client}</span>{l.client === "Tata Capital" && <span className="text-mute"> {l.contact}</span>}{l.partner && <Pill className="ml-1">Partner</Pill>}</td>
                          <td className="px-2">{l.corridor}</td>
                          <td className="px-2">{l.media}</td>
                          <td className="px-2 font-semibold">{inr(l.budget)}</td>
                          <td className="px-2">
                            {l.status === "quoted"
                              ? <Pill tone={qs === "expired" ? "danger" : "neutral"}>{qs === "expired" ? "Hold expired" : "Quote Sent · 48h Hold"}</Pill>
                              : <Pill tone={ms < 3600000 ? "saffron" : "saffron"}>{l.status === "revision" ? "Revision · " : ""}{left(ms)}</Pill>}
                          </td>
                          <td className="px-5 text-right">
                            {l.status === "quoted"
                              ? <Btn variant="secondary" className="h-8 px-3 text-[12px]" onClick={(e) => { e.stopPropagation(); nav({ to: "/admin/quote/$leadId", params: { leadId: l.id } }); }}>View Quote</Btn>
                              : <Btn variant="dark" className="h-8 px-3 text-[12px] whitespace-nowrap" onClick={(e) => { e.stopPropagation(); assign(l); }}>Assign Vendor & Quote</Btn>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!rows.length && <Empty title="No leads match these filters" hint="New marketplace inquiries land here with a 2-hour SLA." />}
              </div>
            </KCard>
            <KCard title="Active Work Orders & SLA Tracker" bodyClass=""><WorkOrderRows limit={4} /></KCard>
          </>
        )}
        {tab === "orders" && <KCard title="Active Work Orders & SLA Tracker" bodyClass=""><WorkOrderRows /></KCard>}
        {tab === "proofs" && <KCard title="Proof of Display Certification Queue" bodyClass=""><WorkOrderRows only="proof_submitted" /></KCard>}
        {tab === "vendors" && <VendorKyc />}

        <KCard title="Recent activity" bodyClass="divide-y divide-line">
          {s.activity.slice(0, 6).map((a, i) => (
            <div key={i} className="px-5 py-3 text-[13px] flex gap-3"><span className="font-mono text-[12px] text-mute w-28 shrink-0">{a.ref}</span><span className="flex-1">{a.text}</span><span className="text-mute text-[12px]">{a.who}</span></div>
          ))}
        </KCard>
      </main>
      <div className="bg-card border-l border-line lg:sticky lg:top-14 lg:h-[calc(100vh-56px)]">
        <QuoteBuilderPanel leadId={sel} />
      </div>
    </div>
  );
}

function VendorKyc() {
  const s = useStore((x) => x);
  const vendors = s.vendors;
  const sites = s.sites.filter((x) => x.status === "pending");
  return (
    <>
      <KCard title="Vendor KYC" bodyClass="divide-y divide-line">
        {vendors.map((v) => (
          <div key={v.id} className="px-5 py-3 flex flex-wrap items-center gap-4 text-[13px]">
            <Avatar>{v.initials}</Avatar>
            <div className="flex-1 min-w-40"><div className="font-semibold">{v.name}</div><div className="text-mute text-[12px]">{v.owner} · {v.city}</div></div>
            <div className="font-mono text-[12px] text-mute">GSTIN {v.gstin}<br />PAN {v.pan}</div>
            {v.kyc === "pending" ? (
              <div className="flex gap-2"><Btn variant="secondary" className="h-8 px-3 text-[12px]" onClick={() => { actions.reviewVendor(v.id, false); toast("KYC rejected"); }}>Reject</Btn><Btn variant="dark" className="h-8 px-3 text-[12px]" onClick={() => { actions.reviewVendor(v.id, true); toast.success(`${v.name} verified`); }}>Verify KYC</Btn></div>
            ) : <Pill tone={v.kyc === "verified" ? "verified" : "danger"}>{v.kyc === "verified" ? "KYC Verified" : "Rejected"}</Pill>}
          </div>
        ))}
      </KCard>
      <KCard title="Media assets awaiting review" bodyClass="divide-y divide-line">
        {sites.length ? sites.map((x) => (
          <div key={x.id} className="px-5 py-3 flex flex-wrap items-center gap-4 text-[13px]">
            <span className="font-mono text-[12px]">{x.id}</span>
            <div className="flex-1"><div className="font-semibold">{x.name}</div><div className="text-mute text-[12px]">{x.city} · {x.category} · {x.size} · {inr(x.monthlyRate)}/mo · {x.lat.toFixed(4)}, {x.lng.toFixed(4)}</div></div>
            <div className="flex gap-2"><Btn variant="secondary" className="h-8 px-3 text-[12px]" onClick={() => actions.reviewSite(x.id, false)}>Reject</Btn><Btn variant="dark" className="h-8 px-3 text-[12px]" onClick={() => { actions.reviewSite(x.id, true); toast.success("Asset is live on the marketplace"); }}>Approve & list</Btn></div>
          </div>
        )) : <Empty title="No assets waiting" hint="Vendor uploads from the Vendor Hub appear here before going live." />}
      </KCard>
      <Link to="/" className="text-[13px] text-saffron-deep">View marketplace →</Link>
    </>
  );
}
