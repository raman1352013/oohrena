import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { actions, useStore, type Escrow } from "@/lib/store";
import { inr, ist } from "@/lib/format";
import { Btn, Empty, Eyebrow, KCard, Pill } from "@/components/app/kit";

export const Route = createFileRoute("/finance")({
  head: () => ({ meta: [
    { title: "Finance Maker-Checker Ledger — OOHRENA" },
    { name: "description", content: "Dual-party escrow release after proof certification with CSV reconciliation." },
    { property: "og:title", content: "Finance Ledger — OOHRENA" },
    { property: "og:description", content: "Maker-checker escrow ledger." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Finance,
});

function Finance() {
  const s = useStore((x) => x);
  const [rel, setRel] = useState<Escrow>();
  const [utr, setUtr] = useState("");
  const [mode, setMode] = useState<"release" | "hold">("release");
  const isChecker = s.role === "finance";
  const pending = s.escrows.filter((e) => e.status !== "released");
  const done = s.escrows.filter((e) => e.status === "released");
  const sum = (l: Escrow[], k: "clientAmount" | "payout") => l.reduce((a, e) => a + e[k], 0);
  const vname = (id: string) => s.vendors.find((v) => v.id === id)?.name ?? id;

  function csv() {
    const head = ["Escrow Ref", "Campaign", "Work Order", "Booking", "Quote", "Lead", "Client", "Vendor", "Client Amount (incl GST)", "Vendor Payout", "Platform Margin", "Status", "Maker", "Maker At", "Checker", "Checker At", "UTR"];
    const rows = s.escrows.map((e) => {
      const w = s.workOrders.find((x) => x.id === e.woId)!; const l = s.leads.find((x) => x.id === w.leadId)!;
      return [e.id, e.campaignId, e.woId, w.bookingId, w.quoteId, l.id, l.client, vname(e.vendorId), e.clientAmount, e.payout, e.clientAmount - e.payout, e.status, e.makerBy, ist(e.makerAt), e.checkerBy ?? "", e.checkerAt ? ist(e.checkerAt) : "", e.utr ?? ""];
    });
    const text = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = `oohrena-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    toast.success("Reconciliation CSV downloaded");
  }

  const Rowx = ({ e }: { e: Escrow }) => (
    <div className="px-5 py-3 flex flex-wrap items-center gap-4 text-[13px]">
      <span className="font-mono text-[12px] w-40">{e.id}<br /><span className="text-mute">{e.campaignId} · {e.woId}</span></span>
      <span className="flex-1 min-w-36">{vname(e.vendorId)}<br /><span className="text-[12px] text-mute">Maker {e.makerBy} · {ist(e.makerAt)}</span></span>
      <span className="text-right">{inr(e.clientAmount)}<br /><span className="text-[12px] text-mute">Payout {inr(e.payout)}</span></span>
      {e.status === "released" ? <Pill tone="verified">Released · {e.utr}</Pill>
        : isChecker ? <div className="flex gap-2"><Btn variant="secondary" className="h-8 px-3 text-[12px]" onClick={() => { setMode("hold"); setUtr(""); setRel(e); }}>Hold</Btn><Btn className="h-8 px-3 text-[12px]" onClick={() => { setMode("release"); setUtr(""); setRel(e); }}>Approve & Release</Btn></div>
        : <Pill tone="hold">{e.status === "held" ? `On hold: ${e.note}` : "Awaiting checker"}</Pill>}
    </div>
  );

  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-end gap-3"><div><Eyebrow>Finance Maker-Checker Ledger</Eyebrow><h1 className="text-[22px] font-semibold mt-1">Escrow & Payouts</h1></div>
        <Btn variant="secondary" className="ml-auto" onClick={csv}><Download size={14} />Export CSV</Btn></div>
      {!isChecker && <p className="text-[12px] text-mute">Only the finance checker (Meera Joshi) can release escrow. Switch role in the header to act as checker.</p>}
      <div className="bg-card border border-line rounded-xl grid grid-cols-2 sm:grid-cols-4 divide-x divide-line">
        {[["Held in escrow", inr(sum(pending, "clientAmount"))], ["Vendor payouts due", inr(sum(pending, "payout"))], ["Released", inr(sum(done, "payout"))], ["Platform margin", inr(sum(s.escrows, "clientAmount") - sum(s.escrows, "payout"))]].map(([k, v]) => (
          <div key={k} className="p-4"><div className="text-[12px] text-mute">{k}</div><div className="text-xl font-bold mt-2">{v}</div></div>))}
      </div>
      <KCard title="Checker queue" bodyClass="divide-y divide-line">{pending.length ? pending.map((e) => <Rowx key={e.id} e={e} />) : <Empty title="Nothing to release" hint="Escrow entries appear after Admin certifies a proof of display." />}</KCard>
      <KCard title="Released" bodyClass="divide-y divide-line">{done.length ? done.map((e) => <Rowx key={e.id} e={e} />) : <Empty title="No releases yet" />}</KCard>
      <Link to="/admin" className="text-[13px] text-saffron-deep">Control Tower →</Link>
      <Dialog open={!!rel} onOpenChange={(v) => !v && setRel(undefined)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{mode === "release" ? `Release ${rel && inr(rel.payout)} to ${rel && vname(rel.vendorId)}` : "Put escrow on hold"}</DialogTitle></DialogHeader>
          <p className="text-[13px] text-mute">Maker: {rel?.makerBy}. As checker you confirm the certified proof and bank transfer.</p>
          <Input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder={mode === "release" ? "Bank UTR / transaction reference" : "Reason for hold"} />
          <DialogFooter><Btn variant="secondary" onClick={() => setRel(undefined)}>Cancel</Btn>
            <Btn disabled={utr.trim().length < 4} onClick={() => { if (!rel) return; mode === "release" ? actions.checkerRelease(rel.id, utr.trim()) : actions.checkerHold(rel.id, utr.trim()); toast.success(mode === "release" ? "Escrow released to vendor" : "Escrow on hold"); setRel(undefined); }}>Confirm</Btn></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
