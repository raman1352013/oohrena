import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, MapPin, X, ChevronLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { actions, useStore, type Proof } from "@/lib/store";
import { GPS_THRESHOLD_M, gpsPasses } from "@/lib/gst";
import { ist, latlng } from "@/lib/format";
import { proofSrc } from "@/lib/images";
import { Btn, Empty, Eyebrow } from "@/components/app/kit";

export const Route = createFileRoute("/admin/proof/$woId")({
  head: ({ params }) => ({ meta: [
    { title: `Proof of Display ${params.woId} — OOHRENA` },
    { name: "description", content: "Day & Night proof of display certification with GPS hardware check." },
    { property: "og:title", content: `Proof of Display ${params.woId} — OOHRENA` },
    { property: "og:description", content: "Day & Night proof of display certification with GPS hardware check." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ProofPage,
});

const REASONS = ["Creative artwork mismatch", "Flex wrinkled / torn", "Floodlights not operational", "GPS stamp outside 50m", "Photo blurred / unclear"];

function ProofCard({ label, proof, dark }: { label: string; proof?: Proof | undefined; dark?: boolean }) {
  return (
    <div className="bg-card border border-line rounded-xl p-3 pb-5">
      <div className={`relative h-[275px] rounded-lg overflow-hidden ${dark ? "bg-navy" : "bg-muted"}`}>
        {proof ? <img src={proofSrc(proof.image)} alt={label} className="w-full h-full object-cover" /> : <div className="h-full grid place-items-center text-[12px] text-mute tracking-wider uppercase">Awaiting upload</div>}
        <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold ${dark ? "bg-navy/80 text-navy-foreground border border-navy-foreground/20" : "bg-card text-ink"}`}>{label}</span>
      </div>
      <div className="px-2 mt-3 text-[13px] space-y-2">
        <div className="flex justify-between"><span className="text-mute">Timestamp</span><span className="font-mono text-[12px]">{proof ? ist(proof.ts) : "—"}</span></div>
        <div className="flex justify-between"><span className="text-mute">Lat / Lng</span><span className="font-mono text-[12px]">{proof ? latlng(proof.lat, proof.lng) : "—"}</span></div>
        <div className="flex justify-between items-center"><span className="text-mute">Status</span>
          {proof ? <span className={`px-2.5 py-1 rounded-full border text-[12px] font-semibold ${gpsPasses(proof.distance) ? "border-line" : "border-destructive/30 text-destructive"}`}>{gpsPasses(proof.distance) ? "Validated" : `${proof.distance}m — outside range`}</span> : <span className="text-mute">Pending</span>}</div>
      </div>
    </div>
  );
}

function ProofPage() {
  const { woId } = Route.useParams();
  const s = useStore((x) => x);
  const nav = useNavigate();
  const [dayOk, setDayOk] = useState(false);
  const [nightOk, setNightOk] = useState(false);
  const [rej, setRej] = useState(false);
  const [reason, setReason] = useState("");
  const w = s.workOrders.find((x) => x.id === woId);
  if (!w) return <div className="p-10"><Empty title="Work order not found" /></div>;
  const site = s.sites.find((x) => x.id === w.siteId)!;
  const v = s.vendors.find((x) => x.id === w.vendorId)!;
  const lead = s.leads.find((x) => x.id === w.leadId)!;
  const maxD = Math.max(w.day?.distance ?? 0, w.night?.distance ?? 0);
  const both = !!(w.day && w.night);
  const gpsOk = both && gpsPasses(w.day!.distance) && gpsPasses(w.night!.distance);
  const lastTs = Math.max(w.day?.ts ?? 0, w.night?.ts ?? 0);
  const slaMet = both && lastTs <= w.deadline;
  const done = w.status === "certified";
  const esc = s.escrows.find((e) => e.woId === w.id);

  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6">
      <Link to="/admin" className="no-print inline-flex items-center gap-1 text-[12px] text-mute hover:text-ink mb-2"><ChevronLeft size={14} />Control Tower</Link>
      <div className="flex flex-wrap items-end gap-4">
        <div><div className="font-mono text-[12px] text-mute">{w.id} <span className="mx-1 text-line">|</span> {w.bookingId}</div>
          <h1 className="text-[24px] font-semibold mt-1">{site.name} <span className="text-mute font-normal">· {site.city}</span></h1></div>
        <div className="ml-auto text-right"><Eyebrow>Client</Eyebrow><div className="font-semibold mt-1">{lead.client}</div></div>
      </div>

      <div className="mt-6 bg-card border border-line rounded-xl grid md:grid-cols-2 md:divide-x divide-line">
        <div className="p-5 flex items-center gap-4"><span className={`w-8 h-8 rounded-full grid place-items-center ${both ? (slaMet ? "bg-navy text-navy-foreground" : "bg-destructive text-destructive-foreground") : "bg-muted text-mute"}`}><Check size={15} /></span>
          <div><div className="text-[12px] text-mute">Mounting SLA</div><div className="text-[14px]">{!both ? <><b>Pending</b> <span className="text-mute">— awaiting both proofs</span></> : slaMet ? <><b>Met</b> <span className="text-mute">— completed on schedule</span></> : <><b>Missed</b> <span className="text-mute">— uploaded after deadline</span></>}</div></div></div>
        <div className="p-5 flex items-center gap-4"><span className={`w-8 h-8 rounded-full grid place-items-center ${gpsOk ? "bg-navy text-navy-foreground" : both ? "bg-destructive text-destructive-foreground" : "bg-muted text-mute"}`}><MapPin size={15} /></span>
          <div><div className="text-[12px] text-mute">Simulated GPS Stamp</div><div className="text-[14px]">{w.day || w.night ? <><b className="font-mono">{maxD}m</b> <b>from registered asset</b> <span className="text-mute">— {gpsOk ? `<${GPS_THRESHOLD_M}m check passed` : both ? `exceeds ${GPS_THRESHOLD_M}m threshold` : "awaiting second proof"}</span></> : <span className="text-mute">No stamps yet</span>}</div></div></div>
      </div>

      <div className="mt-5 grid lg:grid-cols-[1fr_1fr_392px] gap-5">
        <ProofCard label="Day proof" proof={w.day} />
        <ProofCard label="Night illumination" proof={w.night} dark />
        <div className="space-y-5">
          <section className="bg-card border border-line rounded-xl p-5">
            <Eyebrow>Vendor & Installer</Eyebrow>
            <div className="mt-3 text-[13px] divide-y divide-line">
              <div className="flex justify-between py-3"><span className="text-mute">Vendor</span><span className="font-medium">{v.name}</span></div>
              <div className="flex justify-between py-3"><span className="text-mute">Installer</span><span className="text-right font-medium">{w.installer || "Not assigned"}<br /><span className="text-[11px] text-mute font-normal">Browser demo</span></span></div>
              <div className="flex justify-between py-3"><span className="text-mute">Material</span><span className="font-medium">{w.material}</span></div>
            </div>
          </section>
          <section className="bg-card border border-line rounded-xl p-5">
            <h2 className="font-semibold text-[15px]">Certification</h2>
            {done ? (
              <div className="mt-4 text-[13px] space-y-3">
                <div className="flex items-center gap-2 text-verified font-semibold"><Check size={16} />Certified · {w.campaignId}</div>
                <p className="text-mute">Proof released to client. Escrow {esc?.id} is {esc?.status === "released" ? "released to vendor" : "awaiting finance checker"}.</p>
                <Btn variant="secondary" className="w-full" onClick={() => nav({ to: "/finance" })}>Open Finance Ledger</Btn>
              </div>
            ) : (
              <>
                <label className="flex gap-3 mt-4 text-[13px] cursor-pointer"><Checkbox checked={dayOk} disabled={!w.day} onCheckedChange={(v) => setDayOk(!!v)} className="mt-0.5 rounded-[4px]" />Day mounting verified (no wrinkles, correct creative artwork)</label>
                <label className="flex gap-3 mt-3 text-[13px] cursor-pointer"><Checkbox checked={nightOk} disabled={!w.night} onCheckedChange={(v) => setNightOk(!!v)} className="mt-0.5 rounded-[4px]" />Night lighting verified (all floodlights operational)</label>
                {both && !gpsOk && <p className="text-[12px] text-destructive mt-3">GPS stamp is outside {GPS_THRESHOLD_M}m. This proof can only be rejected.</p>}
                <Btn className="w-full mt-5" disabled={!dayOk || !nightOk || !gpsOk} onClick={() => { actions.certify(w.id); toast.success("Certified · proof released to client, escrow sent to checker"); }}>Certify sample proof & create demo payout</Btn>
                <Btn variant="secondary" className="w-full mt-2.5" disabled={!w.day && !w.night} onClick={() => setRej(true)}>Reject with Mandatory Reason</Btn>
              </>
            )}
          </section>
        </div>
      </div>

      <Dialog open={rej} onOpenChange={setRej}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject proof of display</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2">{REASONS.map((r) => <button key={r} onClick={() => setReason(r)} className={`h-8 px-3 rounded-lg border text-[12px] ${reason === r ? "border-navy bg-navy text-navy-foreground" : "border-line"}`}>{r}</button>)}</div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason sent to the vendor (required)" />
          <DialogFooter>
            <Btn variant="secondary" onClick={() => setRej(false)}><X size={14} />Cancel</Btn>
            <Btn variant="dark" disabled={reason.trim().length < 5} onClick={() => { actions.rejectProof(w.id, reason.trim()); setRej(false); toast("Proof rejected · vendor asked to re-upload"); nav({ to: "/admin" }); }}>Reject & notify vendor</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
