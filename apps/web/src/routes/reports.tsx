import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStore, currentVendorId } from "@/lib/store";
import { inr, ist } from "@/lib/format";
import { computeQuote } from "@/lib/gst";
import { Btn, Empty, Eyebrow, KCard } from "@/components/app/kit";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [
    { title: "Reports & Activity — OOHRENA" },
    { name: "description", content: "Review OOHRENA sample lead conversion, pending tasks and activity records." },
    { property: "og:title", content: "Reports & Activity — OOHRENA" },
    { property: "og:description", content: "Campaign funnel and scoped sample activity reports." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Reports,
});

function Reports() {
  const s = useStore((state) => state);
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("");
  const [date, setDate] = useState("");
  const vendorId = currentVendorId(s.role);
  const all = s.role === "admin" || s.role === "finance";
  const leads = s.leads.filter((lead) => all || (s.role === "client" ? lead.client === "Tata Capital" : s.role === "partner" ? lead.partner : s.workOrders.some((wo) => wo.leadId === lead.id && wo.vendorId === vendorId)));
  const leadIds = new Set(leads.map((lead) => lead.id));
  const quotes = s.quotes.filter((quote) => leadIds.has(quote.leadId));
  const orders = s.workOrders.filter((wo) => leadIds.has(wo.leadId));
  const refs = new Set([...leads.map((x) => x.id), ...quotes.map((x) => x.id), ...orders.flatMap((x) => [x.id, x.bookingId, x.campaignId ?? ""])]);
  const activity = s.activity.filter((entry) => (all || refs.has(entry.ref)) && `${entry.ref} ${entry.text}`.toLowerCase().includes(query.toLowerCase()) && (!actor || entry.who === actor) && (!date || new Date(entry.t).toISOString().slice(0, 10) === date));
  const now = Date.now();
  const tasks = [
    ...leads.filter((l) => l.status === "new" || l.status === "revision").map((l) => ({ id: l.id, text: `${l.client} · Admin review`, due: l.createdAt + l.slaMins * 60000 })),
    ...quotes.filter((q) => q.status === "sent" && q.holdUntil).map((q) => ({ id: q.id, text: "Quote hold", due: q.holdUntil ?? now })),
    ...orders.filter((w) => w.status !== "certified").map((w) => ({ id: w.id, text: "Proof certification pending", due: w.deadline })),
  ];
  function exportActivity() {
    const rows = [["Reference", "Actor", "Timestamp", "Action"], ...activity.map((entry) => [entry.ref, entry.who, ist(entry.t), entry.text])];
    const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "oohrena-sample-activity.csv"; link.click(); URL.revokeObjectURL(url);
  }
  return <main className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
    <div className="flex flex-wrap gap-3 items-end"><div><Eyebrow>Sample reports</Eyebrow><h1 className="text-2xl font-semibold">Reports & activity</h1></div><Btn className="ml-auto no-print" variant="secondary" onClick={() => window.print()}>Print / Save PDF</Btn></div>
    <div className="grid grid-cols-2 md:grid-cols-4 border-y border-line divide-x divide-line">{[["Inquiries", leads.length], ["Quoted leads", leads.filter((l) => !!l.quoteId).length], ["Bookings", s.bookings.filter((b) => leadIds.has(b.leadId)).length], ["Certified orders", orders.filter((w) => w.status === "certified").length]].map(([label, value]) => <div className="p-4" key={label}><div className="text-[12px] text-mute">{label}</div><div className="text-2xl font-bold mt-2">{value}</div></div>)}</div>
    <p className="text-[13px] text-mute">Approved sample value: {inr(quotes.filter((q) => q.status === "approved").reduce((total, q) => total + computeQuote(q).total, 0))} · Actual receipts: not recorded</p>
    <KCard title="Pending tasks & exceptions" bodyClass="divide-y divide-line">{tasks.length ? tasks.map((task) => <div key={task.id} className="px-5 py-3 flex flex-wrap gap-3 text-[13px]"><span className="font-mono">{task.id}</span><span className="flex-1">{task.text}</span><span className={task.due < now ? "text-destructive" : "text-mute"}>{task.due < now ? "Overdue · " : "Due · "}{ist(task.due)}</span></div>) : <Empty title="No pending tasks" />}</KCard>
    <KCard title="Activity records" right={<Btn variant="secondary" className="h-9 px-3 no-print" onClick={exportActivity}><Download size={14} />CSV</Btn>}>
      <div className="grid sm:grid-cols-3 gap-3 mb-4 no-print"><Input aria-label="Search activity" placeholder="Reference or action" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Filter actor" className="border border-line rounded-md bg-card px-3 h-10" value={actor} onChange={(e) => setActor(e.target.value)}><option value="">All actors</option>{[...new Set(s.activity.map((a) => a.who))].map((who) => <option key={who}>{who}</option>)}</select><Input aria-label="Activity date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {activity.length ? activity.map((entry, index) => <div key={`${entry.t}-${index}`} className="border-t border-line py-3 grid sm:grid-cols-[140px_1fr_180px] gap-2"><span className="font-mono text-[12px]">{entry.ref}</span><span>{entry.text}<span className="block text-mute text-[12px]">{entry.who}</span></span><span className="text-mute text-[12px]">{ist(entry.t)}</span></div>) : <Empty title="No matching activity" />}
      <p className="text-[11px] text-mute mt-3">Sample activity only · Protected before/after audit records and notification delivery are not connected.</p>
    </KCard>
  </main>;
}