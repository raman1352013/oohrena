import { MapPin, MapPinOff } from "lucide-react";
import { PROOF_TYPE_LABEL } from "@oohrena/shared";
import { assetUrl } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { ProofView } from "@/lib/execution-api";
import { Pill } from "@/components/app/kit";

/** One proof: the media, what kind of proof it is, the server time, and an honest location label. */
export function ProofTile({ p, showStatus }: { p: ProofView; showStatus?: boolean }) {
  const src = assetUrl(p.url);
  return (
    <figure className="w-56 border border-line rounded-lg overflow-hidden bg-card text-[12px]">
      {p.mime.startsWith("video/") ? (
        <video
          src={src}
          controls
          preload="metadata"
          className="h-36 w-full object-cover bg-black"
        />
      ) : (
        <a href={src} target="_blank" rel="noreferrer">
          <img
            src={src}
            alt={`${PROOF_TYPE_LABEL[p.type]} proof`}
            className="h-36 w-full object-cover"
          />
        </a>
      )}
      <figcaption className="p-2 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{PROOF_TYPE_LABEL[p.type]}</span>
          {showStatus && (
            <Pill
              tone={
                p.status === "verified" ? "verified" : p.status === "rejected" ? "danger" : "hold"
              }
              className="ml-auto"
            >
              {p.status}
            </Pill>
          )}
        </div>
        <div className="text-mute">Uploaded {fmtDate(p.uploadedAt)}</div>
        {p.capturedAt && <div className="text-mute">Device time {fmtDate(p.capturedAt)}</div>}
        <div className={p.gpsSource === "device" ? "text-ink flex gap-1" : "text-mute flex gap-1"}>
          {p.gpsSource === "device" ? (
            <MapPin size={12} className="shrink-0 mt-0.5" />
          ) : (
            <MapPinOff size={12} className="shrink-0 mt-0.5" />
          )}
          {p.gpsLabel}
        </div>
        {p.rejectReason && <div className="text-destructive">Rejected: {p.rejectReason}</div>}
        <div className="font-mono text-[10px] text-mute">{p.proofId}</div>
      </figcaption>
    </figure>
  );
}
