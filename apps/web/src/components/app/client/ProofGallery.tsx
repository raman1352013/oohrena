import { useState } from "react";
import { Download } from "lucide-react";
import { useBookingProofs } from "@/lib/execution-api";
import { assetUrl } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Empty, Pill } from "@/components/app/kit";
import { ProofTile } from "@/components/app/ProofMedia";
import { IssueForm } from "@/components/app/vendor/WorkOrdersCard";

/** Client view: only proof that OOHRENA has verified, for this client's own booking. Links expire after a few minutes. */
export function ProofGallery({
  bookingId,
  onClose,
}: {
  bookingId: string | undefined;
  onClose: () => void;
}) {
  const g = useBookingProofs(bookingId);
  const [report, setReport] = useState(false);
  return (
    <Dialog
      open={!!bookingId}
      onOpenChange={(o) => {
        if (!o) {
          setReport(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Proof of display <span className="font-mono">{bookingId}</span>
            {g.data?.campaignId && (
              <span className="font-mono text-[12px] text-mute">{g.data.campaignId}</span>
            )}
            {g.data?.campaignStatus && (
              <Pill tone={g.data.campaignStatus === "live" ? "verified" : "neutral"}>
                {g.data.campaignStatus}
              </Pill>
            )}
          </DialogTitle>
        </DialogHeader>
        {g.isPending ? (
          <div className="h-40 bg-muted rounded-lg animate-pulse" />
        ) : g.isError ? (
          <p className="text-destructive">{g.error.message}</p>
        ) : (
          <div className="space-y-4 text-[13px]">
            {g.data.proofs.length ? (
              <div className="flex flex-wrap gap-3">
                {g.data.proofs.map((p) => (
                  <ProofTile key={p.proofId} p={p} />
                ))}
              </div>
            ) : (
              <Empty title="No verified proof" />
            )}
            {g.data.campaignId && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
                <div className="flex items-center gap-2">
                  <a
                    href={assetUrl(
                      `/api/v1/reports/client-campaign/${g.data.campaignId}?format=pdf`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Btn variant="secondary" className="h-8 px-3 text-[12px] gap-1.5">
                      <Download size={13} /> Campaign Report (PDF)
                    </Btn>
                  </a>
                  <a
                    href={assetUrl(
                      `/api/v1/reports/client-campaign/${g.data.campaignId}?format=csv`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Btn variant="ghost" className="h-8 px-3 text-[12px] gap-1.5">
                      <Download size={13} /> CSV
                    </Btn>
                  </a>
                </div>
                {report ? (
                  <IssueForm campaignId={g.data.campaignId} onDone={() => setReport(false)} />
                ) : (
                  <button
                    className="text-[12px] text-destructive font-semibold hover:underline"
                    onClick={() => setReport(true)}
                  >
                    Report a problem with this campaign
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
