import { useNavigate } from "@tanstack/react-router";
import { useStore, type WOStatus } from "@/lib/store";
import { gpsPasses } from "@/lib/gst";
import { left } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { Avatar, Btn, Empty, Pill } from "./kit";

export function WorkOrderRows({ limit, only }: { limit?: number; only?: WOStatus }) {
  const s = useStore((x) => x);
  const now = useNow();
  const nav = useNavigate();
  let list = s.workOrders.filter((w) => !only || w.status === only);
  if (limit) list = list.filter((w) => w.status !== "certified" || true).slice(0, limit);
  if (!list.length) return <Empty title={only ? "No proofs waiting for certification" : "No work orders yet"} hint={only ? "Vendors upload Day & Night photos from the Vendor Hub." : "Work orders are created when a client approves a quotation."} />;
  return (
    <div className="divide-y divide-line">
      {list.map((w) => {
        const v = s.vendors.find((x) => x.id === w.vendorId)!;
        const site = s.sites.find((x) => x.id === w.siteId)!;
        const dl = w.deadline - now;
        const ini = v.owner.split(" ").map((p) => p[0]).slice(0, 2).join("");
        const maxD = Math.max(w.day?.distance ?? 0, w.night?.distance ?? 0);
        const gpsOk = w.day && w.night && gpsPasses(w.day.distance) && gpsPasses(w.night.distance);
        const open = () => nav({ to: "/admin/proof/$woId", params: { woId: w.id } });
        return (
          <div key={w.id} className="px-5 py-3 min-h-14 flex flex-wrap xl:flex-nowrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span className="font-mono text-[12px] w-28 shrink-0 whitespace-nowrap">{w.id} <span className="text-mute">{w.bookingId}</span></span>
            <span className="flex items-center gap-2 w-44 shrink-0"><Avatar>{ini}</Avatar>{v.name}</span>
            <span className="w-36 shrink-0 truncate">{site.name}</span>
            <span className="w-20 shrink-0 whitespace-nowrap">
              {w.status === "certified" ? <span className="text-verified font-medium">Live</span>
                : w.status === "rejected" ? <span className="text-destructive font-medium">Re-mount</span>
                : <span className="text-saffron font-medium">{dl < 0 ? "SLA breached" : dl < 12 * 3600000 ? `Today ${new Date(w.deadline).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true }).replace(" ", "").toUpperCase()}` : left(dl)}</span>}
            </span>
            <span className="flex-1 min-w-32 whitespace-nowrap">
              {w.status === "certified" ? <Pill tone="verified">Dual GPS &lt;{Math.ceil(maxD / 5) * 5}m</Pill>
                : w.status === "rejected" ? <span className="text-mute">Rejected: {w.rejectReason}</span>
                : <span className="text-mute">{w.day ? <span className="text-verified">Day ✓</span> : "Day pending"} / {w.night ? <span className="text-verified">Night ✓</span> : "Night pending"}</span>}
            </span>
            {w.status === "proof_submitted" && gpsOk ? <Btn variant="dark" className="h-8 px-3 text-[12px] ml-auto whitespace-nowrap" onClick={open}>Certify & Release Escrow</Btn>
              : <Btn variant="secondary" className="h-8 px-3 text-[12px] ml-auto whitespace-nowrap" onClick={open}>{w.status === "certified" ? "View Proof" : "Inspect Proof"}</Btn>}
          </div>
        );
      })}
    </div>
  );
}
