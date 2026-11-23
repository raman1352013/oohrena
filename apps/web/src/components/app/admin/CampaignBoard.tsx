import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { WO_STATUS_LABEL } from "@oohrena/shared";
import { Empty, KCard, Loading, Pill } from "@/components/app/kit";
import { useCampaignBoard } from "@/lib/execution-api";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  scheduled: "hold",
  live: "verified",
  completed: "neutral",
  cancelled: "danger",
} as const;

/** Module 3: every active campaign on one screen — work orders, proof and issues at a glance. */
export function CampaignBoard() {
  const [view, setView] = useState<"active" | "all">("active");
  const board = useCampaignBoard(view);

  return (
    <KCard
      title="Campaigns"
      bodyClass=""
      right={
        <div className="flex gap-1 text-[12px]">
          {(["active", "all"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-2.5 h-7 rounded-md capitalize",
                view === v
                  ? "bg-navy text-navy-foreground font-semibold"
                  : "text-mute hover:text-ink",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      }
    >
      {board.isPending ? (
        <Loading />
      ) : board.isError ? (
        <div role="alert" className="p-8 text-center text-destructive text-[13px]">
          {board.error.message}
        </div>
      ) : !board.data.length ? (
        <Empty title={view === "active" ? "No active campaigns" : "No campaigns"} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead>
              <tr className="text-left text-[12px] text-mute border-b border-line">
                {["Campaign", "Client", "Dates", "Status", "Work orders", "Proof", "Issues"].map(
                  (h) => (
                    <th key={h} className="font-normal px-4 py-2.5">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {board.data.map((c) => (
                <tr key={c.campaignId} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3">
                    {c.leadId ? (
                      <Link
                        to="/admin/leads/$leadId"
                        params={{ leadId: c.leadId }}
                        className="font-mono font-medium hover:text-saffron-deep"
                      >
                        {c.campaignId}
                      </Link>
                    ) : (
                      <span className="font-mono font-medium">{c.campaignId}</span>
                    )}
                    <div className="font-mono text-[11px] text-mute">{c.bookingId}</div>
                  </td>
                  <td className="px-4 py-3">{c.client ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {c.start} → {c.end}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>
                  </td>
                  <td className="px-4 py-3 space-y-1">
                    {c.workOrders.length ? (
                      c.workOrders.map((w) => (
                        <div key={w.workOrderId} className="flex items-center gap-2">
                          <span className="truncate max-w-40">{w.vendor}</span>
                          <Pill tone={w.status === "issue_raised" ? "danger" : "neutral"}>
                            {WO_STATUS_LABEL[w.status]}
                          </Pill>
                        </div>
                      ))
                    ) : (
                      <span className="text-mute">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    <span className="text-verified">{c.proofs.verified} verified</span>
                    {c.proofs.toReview > 0 && (
                      <span className="text-hold"> · {c.proofs.toReview} to review</span>
                    )}
                    {c.proofs.overdue > 0 && (
                      <span className="text-destructive font-semibold">
                        {" "}
                        · {c.proofs.overdue} overdue
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {c.openIssues ? (
                      <span className="text-destructive font-semibold">{c.openIssues}</span>
                    ) : (
                      <span className="text-mute">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </KCard>
  );
}
