import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Lock, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { actions, quoteStatus, quoteTotal, useStore, type WorkOrder } from "@/lib/store";
import { computeQuote } from "@/lib/gst";
import { inr, ist, latlng, left } from "@/lib/format";
import { proofSrc } from "@/lib/images";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { Btn, Empty, Eyebrow, KCard, Pill } from "@/components/app/kit";

export const Route = createFileRoute("/client")({
  head: () => ({ meta: [
    { title: "Client Portal — OOHRENA" },
    { name: "description", content: "Approve quotations, track live campaigns and view GPS-certified day and night proofs." },
    { property: "og:title", content: "Client Portal — OOHRENA" },
    { property: "og:description", content: "Track every campaign with certified proof of display." },
  ] }),
  component: ClientPortal,
});

const CLIENT = "Tata Capital";
const STEPS = ["Booked", "Mounting", "Proof review", "Live & certified"];
const stepOf = (w: WorkOrder) => (w.status === "certified" ? 3 : w.status === "proof_submitted" ? 2 : w.status === "assigned" ? 0 : 1);

function ClientPortal() {
  const s = useStore((x) => x);
  const now = useNow(15000);
  const [dlg, setDlg] = useState<{ id: string; kind: "reject" | "revision" }>();
  const [note, setNote] = useState("");
  const leads = s.leads.filter((l) => l.client === CLIENT);
  const ids = new Set(leads.map((l) => l.id));
  const quotes = s.quotes.filter((q) => ids.has(q.leadId));
  const open = quotes.filter((q) => ["sent", "expired", "revision"].includes(quoteStatus(q, now)));
  const pending = leads.filter((l) => l.status === "new" || (l.status === "revision"));
  const wos = s.workOrders.filter((w) => ids.has(w.leadId));
  const live = wos.filter((w) => w.status === "certified");
  const spend = quotes.filter((q) => q.status === "approved").reduce((a, q) => a + quoteTotal(q), 0);

  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div><Eyebrow>Client Portal</Eyebrow><h1 className="text-[24px] font-semibold mt-1">Tata Capital — Ananya Deshmukh</h1></div>
        <Link to="/" className="ml-auto"><Btn variant="secondary">Browse media</Btn></Link>
      </div>
      <div className="bg-card border border-line rounded-xl grid grid-cols-2 sm:grid-cols-4 divide-x divide-line">
        {[["Quotes awaiting you", open.filter((q) => quoteStatus(q, now) === "sent").length], ["Campaigns in execution", wos.length - live.length], ["Live & certified", live.length], ["Approved spend", inr(spend)]].map(([k, v]) => (
          <div key={k as string} className="p-4"><div className="text-[12px] text-mute">{k}</div><div className="text-2xl font-bold mt-2">{v}</div></div>))}
      </div>

      <KCard title="Open quotations" bodyClass="divide-y divide-line">
        {open.length ? open.map((q) => {
          const l = s.leads.find((x) => x.id === q.leadId)!; const site = s.sites.find((x) => x.id === q.siteId)!;
          const c = computeQuote(q); const st = quoteStatus(q, now);
          return (
            <div key={q.id} className="px-5 py-4 flex flex-wrap gap-4 items-center text-[13px]">
              <div className="w-40"><div className="font-mono text-[12px]">{q.id}</div><div className="text-mute text-[12px]">{l.id}</div></div>
              <div className="flex-1 min-w-48"><div className="font-semibold">{site.name}</div><div className="text-mute text-[12px]">{site.city} · {site.size} · {l.durationDays} days from {l.startDate}</div>
                <div className="text-[12px] text-mute mt-1">Rent {inr(q.base)} + Print {inr(q.print)} + Mount {inr(q.mounting)} + GST {inr(c.gst)}</div></div>
              <div className="text-right"><div className="font-bold text-[16px]">{inr(c.total)}</div>
                {st === "sent" ? <Pill tone="hold"><Lock size={11} />Held for you · {left((q.holdUntil ?? now) - now)}</Pill> : st === "expired" ? <Pill tone="danger">Hold expired</Pill> : <Pill>Revision requested</Pill>}</div>
              <div className="flex gap-2 flex-wrap">
                <a href={`/print/quote/${q.id}`} target="_blank" rel="noreferrer"><Btn variant="ghost" className="h-9 px-2">PDF</Btn></a>
                {st === "sent" && <>
                  <Btn variant="secondary" className="h-9 px-3" onClick={() => { setNote(""); setDlg({ id: q.id, kind: "revision" }); }}>Request Revision</Btn>
                  <Btn variant="secondary" className="h-9 px-3" onClick={() => { setNote(""); setDlg({ id: q.id, kind: "reject" }); }}>Reject</Btn>
                  <Btn className="h-9 px-4" onClick={() => { actions.clientApprove(q.id); toast.success("Approved · booking and work order created"); }}>Approve</Btn></>}
                {st === "expired" && <Btn variant="secondary" className="h-9 px-3" onClick={() => { actions.clientRevision(q.id, "Hold expired — please re-issue the quotation"); toast("Asked OOHRENA to re-issue"); }}>Ask to re-issue</Btn>}
              </div>
            </div>);
        }) : <Empty title="No quotations waiting" hint="When OOHRENA releases a GST quote, it appears here with a 48h hold on the site." />}
        {pending.length > 0 && <div className="px-5 py-3 text-[12px] text-mute bg-canvas">{pending.length} inquir{pending.length > 1 ? "ies" : "y"} under Admin review: {pending.map((l) => l.id).join(", ")}</div>}
      </KCard>

      <KCard title="Campaign tracking" bodyClass="divide-y divide-line">
        {wos.length ? wos.map((w) => {
          const site = s.sites.find((x) => x.id === w.siteId)!; const bk = s.bookings.find((b) => b.id === w.bookingId)!; const step = stepOf(w);
          return (
            <div key={w.id} className="p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <div className="font-mono text-[12px] text-mute">{w.bookingId} · {w.id}{w.campaignId && ` · ${w.campaignId}`}</div>
                <div className="font-semibold text-[15px] w-full sm:w-auto">{site.name} <span className="text-mute font-normal">· {site.city}</span></div>
                <span className="text-mute text-[12px]">{bk.start} → {bk.end}</span>
                {w.status === "certified" && <Link to="/print/dossier/$campaignId" params={{ campaignId: w.campaignId! }} target="_blank" className="ml-auto"><Btn variant="dark" className="h-9 px-4">Campaign Audit Dossier PDF</Btn></Link>}
              </div>
              <ol className="grid grid-cols-4 gap-2">
                {STEPS.map((t, i) => (
                  <li key={t} className="text-[12px]"><div className={cn("h-1.5 rounded-full", i <= step ? (step === 3 ? "bg-verified" : "bg-saffron") : "bg-muted")} />
                    <div className={cn("mt-1.5", i <= step ? "text-ink font-medium" : "text-mute")}>{t}</div></li>))}
              </ol>
              {w.status === "rejected" && <p className="text-[12px] text-hold">Proof sent back to vendor for re-mounting: {w.rejectReason}</p>}
              {w.status !== "certified" && w.status !== "rejected" && <p className="text-[12px] text-mute">{w.status === "assigned" ? `Vendor mounting deadline ${left(w.deadline - now)}.` : w.status === "proof_submitted" ? "Day & Night photos received — OOHRENA is verifying GPS and quality." : "Mounting in progress."} Proofs appear here once certified.</p>}
              {w.status === "certified" && w.day && w.night && (
                <div className="grid sm:grid-cols-2 gap-4">
                  {([["Day proof", w.day], ["Night illumination", w.night]] as const).map(([k, p]) => (
                    <div key={k} className="rounded-lg border border-line overflow-hidden">
                      <img src={proofSrc(p.image)} alt={k} className="h-44 w-full object-cover" loading="lazy" />
                      <div className="p-3 text-[12px] flex flex-wrap gap-x-4 gap-y-1"><span className="font-semibold">{k}</span><span className="text-mute">{ist(p.ts)}</span>
                        <span className="text-mute flex items-center gap-1"><MapPin size={11} />{latlng(p.lat, p.lng)}</span><Pill tone="verified"><Check size={11} />{p.distance}m · GPS verified</Pill></div>
                    </div>))}
                </div>)}
            </div>);
        }) : <Empty title="No campaigns yet" hint="Approve a quotation to start a campaign." />}
      </KCard>

      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(undefined)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dlg?.kind === "reject" ? "Reject quotation" : "Request revision"}</DialogTitle></DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={dlg?.kind === "reject" ? "Why are you rejecting? (required)" : "What should change — budget, dates, site? (required)"} />
          <DialogFooter>
            <Btn variant="secondary" onClick={() => setDlg(undefined)}>Cancel</Btn>
            <Btn disabled={note.trim().length < 3} onClick={() => { if (!dlg) return; dlg.kind === "reject" ? actions.clientReject(dlg.id, note.trim()) : actions.clientRevision(dlg.id, note.trim()); toast.success(dlg.kind === "reject" ? "Quotation rejected · hold released" : "Revision request sent to OOHRENA"); setDlg(undefined); }}>Send</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
