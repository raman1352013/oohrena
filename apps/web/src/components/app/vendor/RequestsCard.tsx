import { toast } from "sonner";
import { useRespond, useVendorRequests } from "@/lib/marketplace-api";
import { Btn, Empty, KCard, Loading, Pill } from "@/components/app/kit";
import { left } from "@/lib/format";

/** Holds waiting for this vendor's confirmation (listings in on-request mode). */
export function RequestsCard() {
  const reqs = useVendorRequests();
  const respond = useRespond();
  const pending = (reqs.data ?? []).filter((r) => r.status === "pending");
  const recent = (reqs.data ?? []).filter((r) => r.status !== "pending").slice(0, 5);
  return (
    <KCard
      title="Hold requests to confirm"
      bodyClass="divide-y divide-line"
      right={pending.length ? <Pill tone="saffron">{pending.length} waiting</Pill> : undefined}
    >
      {reqs.isPending ? (
        <Loading />
      ) : !pending.length && !recent.length ? (
        <Empty title="No hold requests" />
      ) : (
        <>
          {pending.map((r) => (
            <div
              key={r.requestId}
              className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]"
            >
              <span className="font-mono text-[12px]">{r.inventoryId}</span>
              <span className="font-semibold">
                {r.from} → {r.to}
              </span>
              {r.qty > 1 && <span className="text-mute">{r.qty} units</span>}
              <Pill tone="saffron" className="ml-auto">
                Respond within {left(new Date(r.respondBy).getTime() - Date.now())}
              </Pill>
              <Btn
                variant="secondary"
                className="h-8 px-3 text-[12px]"
                disabled={respond.isPending}
                onClick={() => {
                  const note = prompt("Why can't you offer these dates?");
                  if (note === null) return;
                  respond.mutate(
                    {
                      id: r.requestId,
                      response: "decline",
                      ...(note.trim() ? { note: note.trim() } : {}),
                    },
                    {
                      onSuccess: () => toast("Declined — dates released"),
                      onError: (e) => toast.error(e.message),
                    },
                  );
                }}
              >
                Decline
              </Btn>
              <Btn
                variant="dark"
                className="h-8 px-3 text-[12px]"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate(
                    { id: r.requestId, response: "confirm" },
                    {
                      onSuccess: () => toast.success("Dates confirmed"),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                Confirm dates
              </Btn>
            </div>
          ))}
          {recent.map((r) => (
            <div
              key={r.requestId}
              className="px-5 py-2.5 flex flex-wrap items-center gap-3 text-[12px] text-mute"
            >
              <span className="font-mono">{r.inventoryId}</span>
              <span>
                {r.from} → {r.to}
              </span>
              <Pill tone={r.status === "confirmed" ? "verified" : "neutral"} className="ml-auto">
                {r.status}
              </Pill>
            </div>
          ))}
        </>
      )}
    </KCard>
  );
}
