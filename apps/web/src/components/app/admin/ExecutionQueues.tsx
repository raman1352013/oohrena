import { useState } from "react";
import { toast } from "sonner";
import { ISSUE_STATUSES, PROOF_TYPE_LABEL, type IssueStatus } from "@oohrena/shared";
import { fmtDate, selectCls } from "@/lib/format";
import { useAdminExecution, useIssues, useOverdue, useProofQueue, type IssueView } from "@/lib/execution-api";
import { Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { ProofTile } from "@/components/app/ProofMedia";
import { cn } from "@/lib/utils";

/** Admin verifies or rejects (with reason) every uploaded proof before clients can see it. */
export function ProofQueue() {
  const q = useProofQueue("uploaded");
  const overdue = useOverdue();
  const act = useAdminExecution();
  const decide = (id: string, decision: "verify" | "reject") => {
    let reason: string | undefined;
    if (decision === "reject") {
      reason = (prompt("Reason for rejecting this proof (the vendor sees it and must re-upload):") ?? "").trim();
      if (reason.length < 3) return toast.error("A reason is required to reject proof");
    }
    act.decide.mutate({ id, decision, ...(reason ? { reason } : {}) }, { onSuccess: () => toast.success(decision === "verify" ? "Proof verified — visible to the client" : "Proof rejected — sent back to vendor"), onError: (e) => toast.error(e.message) });
    return undefined;
  };
  return (
    <>
      <KCard title="Proof of display — verification queue" bodyClass="divide-y divide-line" right={q.data?.length ? <Pill tone="saffron">{q.data.length} waiting</Pill> : undefined}>
        {q.isPending ? <div className="p-8 text-center text-mute text-[13px]">Loading…</div>
          : !q.data?.length ? <Empty title="Nothing to verify" hint="Vendor uploads appear here. Clients only ever see proof you verify." />
          : q.data.map((p) => (
            <div key={p.proofId} className="p-5 flex flex-wrap gap-5 text-[13px]">
              <ProofTile p={p} />
              <div className="flex-1 min-w-60 space-y-1">
                <div className="font-semibold">{PROOF_TYPE_LABEL[p.type]} · <span className="font-mono">{p.inventoryId}</span></div>
                <div className="font-mono text-[12px] text-mute">{p.workOrderId} · {p.bookingId} · {p.campaignId} · vendor {p.vendorId}</div>
                <div>Server upload time: <b>{fmtDate(p.uploadedAt)}</b></div>
                <div className="text-mute">Device-reported time: {p.capturedAt ? fmtDate(p.capturedAt) : "not provided"}</div>
                <div>{p.gpsLabel}{p.lat != null ? <span className="text-mute font-mono text-[12px]"> ({p.lat.toFixed(5)}, {p.lng?.toFixed(5)})</span> : null}</div>
                {p.distanceM != null && p.distanceM > 100 && <Pill tone="danger">More than 100 m from the listed site — check carefully</Pill>}
                {p.note && <div className="text-mute">Vendor note: {p.note}</div>}
                <div className="flex gap-2 pt-2">
                  <Btn variant="secondary" className="h-8 px-3 text-[12px]" disabled={act.decide.isPending} onClick={() => decide(p.proofId, "reject")}>Reject…</Btn>
                  <Btn variant="dark" className="h-8 px-3 text-[12px]" disabled={act.decide.isPending} onClick={() => decide(p.proofId, "verify")}>Verify</Btn>
                </div>
              </div>
            </div>
          ))}
      </KCard>
      <KCard title="Overdue proof" bodyClass="divide-y divide-line" right={overdue.data?.length ? <Pill tone="danger">{overdue.data.length}</Pill> : undefined}>
        {!overdue.data?.length ? <Empty title="No overdue proof" hint="Slots whose due date passed without accepted proof show up here." />
          : overdue.data.map((s) => (
            <div key={s.scheduleId} className="px-5 py-2.5 flex flex-wrap gap-3 text-[13px]">
              <span className="font-mono text-[12px]">{s.workOrderId}</span><span className="font-mono text-[12px] text-mute">{s.inventoryId}</span>
              <span>{PROOF_TYPE_LABEL[s.type]}</span><span className="text-destructive">due {s.dueDate}</span><Pill>{s.status === "rejected" ? "rejected, awaiting re-upload" : "not uploaded"}</Pill>
            </div>
          ))}
      </KCard>
    </>
  );
}

/** Complaint and issue tracker: owner, due date, status and resolution notes. */
export function IssueTracker() {
  const [status, setStatus] = useState<IssueStatus | undefined>(undefined);
  const list = useIssues(status);
  return (
    <KCard title="Issues & complaints" bodyClass="divide-y divide-line" right={
      <div className="flex gap-1 text-[12px]">
        {[{ id: undefined, label: "Open" }, ...ISSUE_STATUSES.map((s) => ({ id: s, label: s.replace("_", " ") }))].map((f) => (
          <button key={f.label} onClick={() => setStatus(f.id)} className={cn("px-2.5 h-7 rounded-md capitalize", status === f.id ? "bg-navy text-navy-foreground font-semibold" : "text-mute hover:text-ink")}>{f.label}</button>
        ))}
      </div>}>
      {list.isPending ? <div className="p-8 text-center text-mute text-[13px]">Loading…</div>
        : !list.data?.length ? <Empty title="No issues here" hint="Issues raised by vendors, clients or admins on a campaign land here." />
        : list.data.map((i) => <IssueRow key={i.issueId} i={i} />)}
    </KCard>
  );
}

function IssueRow({ i }: { i: IssueView }) {
  const { updateIssue } = useAdminExecution();
  const [f, setF] = useState({ owner: i.owner ?? "", dueDate: i.dueDate ?? "", status: i.status, resolutionNote: i.resolutionNote ?? "" });
  const save = () => updateIssue.mutate(
    { id: i.issueId, ...(f.owner ? { owner: f.owner } : {}), ...(f.dueDate ? { dueDate: f.dueDate } : {}), status: f.status, ...(f.resolutionNote ? { resolutionNote: f.resolutionNote } : {}) },
    { onSuccess: () => toast.success(`${i.issueId} updated`), onError: (e) => toast.error(e.message) },
  );
  const overdue = i.dueDate && i.status !== "resolved" && new Date(i.dueDate) < new Date();
  const cell = "h-9 rounded-md border border-line bg-card px-2 text-[12px]";
  return (
    <div className="p-5 space-y-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[12px]">{i.issueId}</span><Pill>{i.category.replace("_", " ")}</Pill>
        <span className="text-[12px] text-mute">raised by {i.raisedByRole} {i.raisedBy} · {fmtDate(i.createdAt)}</span>
        <span className="font-mono text-[12px] text-mute">{i.workOrderId ?? i.bookingId}</span>
        <Pill tone={i.status === "resolved" ? "verified" : overdue ? "danger" : "hold"} className="ml-auto">{overdue ? "overdue" : i.status.replace("_", " ")}</Pill>
      </div>
      <p>{i.description}</p>
      {i.status === "resolved" ? <p className="text-verified text-[12px]">Resolved: {i.resolutionNote}</p> : (
        <div className="grid sm:grid-cols-[1fr_150px_150px_auto] gap-2 items-start">
          <input className={cell} placeholder="Owner (who is fixing it)" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
          <input className={cell} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          <select className={selectCls.replace("h-11", "h-9")} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as IssueStatus })}>{ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
          <Btn variant="dark" className="h-9 px-3 text-[12px]" disabled={updateIssue.isPending} onClick={save}>Save</Btn>
          {f.status === "resolved" && <input className={cn(cell, "sm:col-span-4")} placeholder="Resolution notes (required to resolve)" value={f.resolutionNote} onChange={(e) => setF({ ...f, resolutionNote: e.target.value })} />}
        </div>
      )}
    </div>
  );
}
