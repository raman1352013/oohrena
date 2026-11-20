import { useState } from "react";
import { useBookingProofs } from "@/lib/execution-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, Pill } from "@/components/app/kit";
import { ProofTile } from "@/components/app/ProofMedia";
import { IssueForm } from "@/components/app/vendor/WorkOrdersCard";

/** Client view: only proof that OOHRENA has verified, for this client's own booking. Links expire after a few minutes. */
export function ProofGallery({ bookingId, onClose }: { bookingId: string | undefined; onClose: () => void }) {
  const g = useBookingProofs(bookingId);
  const [report, setReport] = useState(false);
  return (
    <Dialog open={!!bookingId} onOpenChange={(o) => { if (!o) { setReport(false); onClose(); } }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">Proof of display <span className="font-mono">{bookingId}</span>
          {g.data?.campaignId && <span className="font-mono text-[12px] text-mute">{g.data.campaignId}</span>}
          {g.data?.campaignStatus && <Pill tone={g.data.campaignStatus === "live" ? "verified" : "neutral"}>{g.data.campaignStatus}</Pill>}</DialogTitle></DialogHeader>
        {g.isPending ? <div className="h-40 bg-muted rounded-lg animate-pulse" /> : g.isError ? <p className="text-destructive">{g.error.message}</p> : (
          <div className="space-y-4 text-[13px]">
            {g.data.proofs.length
              ? <div className="flex flex-wrap gap-3">{g.data.proofs.map((p) => <ProofTile key={p.proofId} p={p} />)}</div>
              : <Empty title="No verified proof yet" hint="Proof appears here after the media owner uploads it and OOHRENA verifies it. Location is shown exactly as captured." />}
            <p className="text-[12px] text-mute">Each photo shows the server upload time and whether the device shared its location. OOHRENA checks every proof before it appears here.</p>
            {g.data.campaignId && (report
              ? <IssueForm campaignId={g.data.campaignId} onDone={() => setReport(false)} />
              : <button className="text-[12px] text-destructive font-semibold hover:underline" onClick={() => setReport(true)}>Report a problem with this campaign</button>)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
