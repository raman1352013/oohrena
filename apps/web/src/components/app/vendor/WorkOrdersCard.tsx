import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import {
  ISSUE_CATEGORIES,
  MAX_PROOF_BYTES,
  PROOF_TYPE_LABEL,
  WO_STATUS_LABEL,
  todayIST,
  type WorkOrderStatus,
} from "@oohrena/shared";
import { fmtDate } from "@/lib/format";
import { useAcknowledge, useMyWorkOrders, type WorkOrderView } from "@/lib/deals-api";
import {
  getPosition,
  useExecution,
  useExecutionActions,
  useRaiseIssue,
  useVendorOverdue,
  type Slot,
} from "@/lib/execution-api";
import { Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { ProofTile } from "@/components/app/ProofMedia";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/lib/format";

const NEXT: Partial<
  Record<WorkOrderStatus, { to: "installed" | "inspection_due" | "completed"; label: string }>
> = {
  scheduled: { to: "installed", label: "Mark installed / live" },
  installed: { to: "inspection_due", label: "Mark inspection due" },
  inspection_due: { to: "completed", label: "Mark completed" },
};

/** Work orders issued to this vendor, with execution status, proof schedule and uploads. */
export function WorkOrdersCard() {
  const wos = useMyWorkOrders();
  const overdue = useVendorOverdue();
  const toAck = (wos.data ?? []).filter(
    (w) => w.status === "scheduled" && !w.acknowledgedAt,
  ).length;
  return (
    <KCard
      title="Work orders"
      bodyClass="divide-y divide-line"
      right={
        <>
          {!!overdue.data?.length && <Pill tone="danger">{overdue.data.length} proof overdue</Pill>}
          {toAck > 0 && <Pill tone="saffron">{toAck} to acknowledge</Pill>}
        </>
      }
    >
      {wos.isPending ? (
        <div className="p-6 text-center text-mute text-[13px]">Loading…</div>
      ) : !wos.data?.length ? (
        <Empty
          title="No work orders yet"
          hint="When a client's booking includes your media, OOHRENA issues a work order here with the campaign instructions."
        />
      ) : (
        wos.data.map((w) => <WorkOrderBlock key={w.workOrderId} w={w} />)
      )}
    </KCard>
  );
}

function WorkOrderBlock({ w }: { w: WorkOrderView }) {
  const ack = useAcknowledge();
  const ex = useExecution(w.workOrderId);
  const act = useExecutionActions(w.workOrderId);
  const [issueOpen, setIssueOpen] = useState(false);
  const status = (ex.data?.status ?? w.status) as WorkOrderStatus;
  const next = NEXT[status];
  return (
    <div className="p-5 space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[12px]">{w.workOrderId}</span>
        <span className="font-mono text-[12px] text-mute">{w.bookingId}</span>
        {ex.data?.campaignId && (
          <span className="font-mono text-[12px] text-mute">{ex.data.campaignId}</span>
        )}
        <Pill
          tone={
            status === "issue_raised" || status === "cancelled"
              ? "danger"
              : status === "completed"
                ? "verified"
                : "saffron"
          }
          className="ml-auto"
        >
          {WO_STATUS_LABEL[status]}
        </Pill>
        {status === "scheduled" && !w.acknowledgedAt && (
          <Btn
            variant="secondary"
            className="h-8 px-3 text-[12px]"
            disabled={ack.isPending}
            onClick={() =>
              ack.mutate(w.workOrderId, {
                onSuccess: () => toast.success("Work order acknowledged"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Acknowledge
          </Btn>
        )}
        {next && (
          <Btn
            variant="dark"
            className="h-8 px-3 text-[12px]"
            disabled={act.status.isPending}
            onClick={() =>
              act.status.mutate(
                { status: next.to },
                {
                  onSuccess: () => toast.success(WO_STATUS_LABEL[next.to]),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {next.label}
          </Btn>
        )}
      </div>
      {w.items.map((i) => (
        <div key={i.inventoryId} className="text-[12px]">
          <span className="font-mono">{i.inventoryId}</span> · <b>{i.title}</b>, {i.city} · {i.from}{" "}
          → {i.to}
        </div>
      ))}
      <p className="rounded-lg bg-muted px-3 py-2 whitespace-pre-line">{w.instructions}</p>
      {status === "issue_raised" && (
        <p className="text-destructive text-[12px]">
          An issue is open on this work order. OOHRENA will resolve it and the work order returns to{" "}
          {ex.data?.previousStatus ? WO_STATUS_LABEL[ex.data.previousStatus] : "its previous step"}.
        </p>
      )}

      {ex.data && !["cancelled"].includes(status) && (
        <div className="space-y-2">
          <div className="font-semibold">Proof schedule</div>
          {/* One block per site, so a multi-site work order doesn't show look-alike rows. */}
          {w.items
            .map((item) => ({
              item,
              slots: ex.data!.schedule.filter((s) => s.inventoryId === item.inventoryId),
            }))
            .filter((g) => g.slots.length > 0)
            .map(({ item, slots }) => (
              <div key={item.inventoryId} className="space-y-1">
                <div className="text-[12px] text-mute">
                  <span className="font-mono">{item.inventoryId}</span> · {item.title}, {item.city}
                </div>
                <div className="divide-y divide-line border border-line rounded-lg">
                  {slots.map((s) => (
                    <SlotRow
                      key={s.scheduleId}
                      s={s}
                      woId={w.workOrderId}
                      closed={status === "completed"}
                      rejectReason={
                        ex.data!.proofs.find((p) => p.proofId === s.latestProofId)?.rejectReason ??
                        null
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          {ex.data.proofs.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {ex.data.proofs.map((p) => (
                <ProofTile key={p.proofId} p={p} showStatus />
              ))}
            </div>
          )}
        </div>
      )}

      {ex.data?.campaignId &&
        status !== "completed" &&
        status !== "cancelled" &&
        (issueOpen ? (
          <IssueForm
            campaignId={ex.data.campaignId}
            workOrderId={w.workOrderId}
            onDone={() => setIssueOpen(false)}
          />
        ) : (
          <button
            className="text-[12px] text-destructive font-semibold hover:underline"
            onClick={() => setIssueOpen(true)}
          >
            Raise an issue (damage, access, creative…)
          </button>
        ))}
      <p className="text-[11px] text-mute">
        Issued {fmtDate(w.issuedAt)}
        {w.acknowledgedAt ? ` · acknowledged ${fmtDate(w.acknowledgedAt)}` : ""}
      </p>
    </div>
  );
}

function SlotRow({
  s,
  woId,
  closed,
  rejectReason,
}: {
  s: Slot;
  woId: string;
  closed: boolean;
  rejectReason: string | null;
}) {
  const act = useExecutionActions(woId);
  const ref = useRef<HTMLInputElement>(null);
  const [withGps, setWithGps] = useState(true);
  const [busy, setBusy] = useState(false);
  const overdue = (s.status === "due" || s.status === "rejected") && s.dueDate < todayIST();
  // Installation proof can come in early; later slots open on their due date.
  const canUpload =
    !closed && s.status !== "verified" && (s.type === "before" || s.dueDate <= todayIST());

  async function send(file?: File) {
    if (!file) return;
    if (file.size > MAX_PROOF_BYTES) return toast.error("File is larger than 25 MB");
    setBusy(true);
    const pos = withGps ? await getPosition() : undefined;
    if (withGps && !pos)
      toast.message("Location not available — the proof will say “Location not captured”.");
    act.upload.mutate(
      { file, inventoryId: s.inventoryId, scheduleId: s.scheduleId, ...(pos ?? {}) },
      {
        onSuccess: (p) => toast.success(`Proof uploaded · ${p.gpsLabel}`),
        onError: (e) => toast.error(e.message),
        onSettled: () => {
          setBusy(false);
          if (ref.current) ref.current.value = "";
        },
      },
    );
    return undefined;
  }

  return (
    <div className="px-3 py-2 flex flex-wrap items-center gap-3">
      <span className="w-44">{PROOF_TYPE_LABEL[s.type]}</span>
      <span className="font-mono text-[12px] w-28">{s.dueDate}</span>
      <Pill
        tone={
          s.status === "verified"
            ? "verified"
            : s.status === "rejected" || overdue
              ? "danger"
              : s.status === "uploaded"
                ? "hold"
                : "neutral"
        }
      >
        {overdue
          ? `Overdue · ${s.status === "rejected" ? "rejected" : "not uploaded"}`
          : s.status === "uploaded"
            ? "Awaiting verification"
            : s.status}
      </Pill>
      {rejectReason && s.status === "rejected" && (
        <span className="text-[12px] text-destructive flex-1 min-w-40">
          Re-upload needed: {rejectReason}
        </span>
      )}
      {canUpload && s.status !== "uploaded" && (
        <span className="ml-auto flex items-center gap-2">
          <label className="text-[11px] text-mute flex items-center gap-1">
            <input
              type="checkbox"
              checked={withGps}
              onChange={(e) => setWithGps(e.target.checked)}
            />
            attach location
          </label>
          <label className="h-8 px-3 rounded-lg border border-line bg-card text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {busy ? "Uploading…" : s.status === "rejected" ? "Re-upload" : "Upload proof"}
            <input
              ref={ref}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => void send(e.target.files?.[0])}
            />
          </label>
        </span>
      )}
    </div>
  );
}

export function IssueForm({
  campaignId,
  workOrderId,
  onDone,
}: {
  campaignId: string;
  workOrderId?: string;
  onDone: () => void;
}) {
  const raise = useRaiseIssue();
  const [category, setCategory] = useState<string>("installation");
  const [description, setDescription] = useState("");
  return (
    <div className="rounded-lg border border-line p-3 space-y-2">
      <div className="grid sm:grid-cols-[200px_1fr] gap-2">
        <select
          className={selectCls}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {ISSUE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace("_", " ")}
            </option>
          ))}
        </select>
        <Textarea
          rows={2}
          value={description}
          placeholder="What happened? (at least 10 characters)"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Btn
          variant="dark"
          className="h-8 px-3 text-[12px]"
          disabled={description.trim().length < 10 || raise.isPending}
          onClick={() =>
            raise.mutate(
              {
                campaignId,
                ...(workOrderId ? { workOrderId } : {}),
                category,
                description: description.trim(),
              },
              {
                onSuccess: (i) => {
                  toast.success(`Issue ${i.issueId} raised`);
                  onDone();
                },
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          Raise issue
        </Btn>
        <Btn variant="ghost" className="h-8 px-3 text-[12px]" onClick={onDone}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}
