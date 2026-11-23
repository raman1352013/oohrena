import { useState } from "react";
import { toast } from "sonner";
import { cancellationFor, todayIST } from "@oohrena/shared";
import { fmtDate, inr } from "@/lib/format";
import {
  useClientActions,
  useMyBookings,
  useMyQuotes,
  useQuoteDetail,
  type BookingView,
} from "@/lib/deals-api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Btn, Empty, KCard, Loading, Pill } from "@/components/app/kit";
import { QuoteBreakdown, QuotePill } from "@/components/app/QuoteBreakdown";
import { cn } from "@/lib/utils";
import { ProofGallery } from "./ProofGallery";

/** Real quotations addressed to this client: open one to see every line, earlier versions, and decide. */
export function MyQuotations() {
  const quotes = useMyQuotes();
  const [open, setOpen] = useState<string>();
  // Show the latest version per quote number.
  const latest = Object.values(
    (quotes.data ?? []).reduce<Record<string, NonNullable<typeof quotes.data>[number]>>(
      (acc, q) => {
        if (!acc[q.quoteNo] || acc[q.quoteNo]!.version < q.version) acc[q.quoteNo] = q;
        return acc;
      },
      {},
    ),
  );
  return (
    <KCard title="Quotes" bodyClass="divide-y divide-line">
      {quotes.isPending ? (
        <Loading />
      ) : !latest.length ? (
        <Empty title="No quotes" />
      ) : (
        latest.map((q) => (
          <div key={q.quoteId} className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="font-mono text-[12px] w-44">{q.quoteId}</span>
            <span className="flex-1 min-w-48">
              {q.items.map((i) => i.title).join(", ")}
              <span className="text-mute text-[12px] block">
                Lead {q.leadId} · valid until {q.validUntil}
              </span>
            </span>
            <span className="font-semibold">{inr(q.total)}</span>
            <QuotePill status={q.status} />
            <Btn
              variant={q.status === "released" ? "primary" : "secondary"}
              className="h-8 px-3 text-[12px]"
              onClick={() => setOpen(q.quoteId)}
            >
              {q.status === "released" ? "Review & decide" : "View"}
            </Btn>
          </div>
        ))
      )}
      <QuoteDialog id={open} onClose={() => setOpen(undefined)} onPick={setOpen} />
    </KCard>
  );
}

function QuoteDialog({
  id,
  onClose,
  onPick,
}: {
  id: string | undefined;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const q = useQuoteDetail(id);
  const { decide } = useClientActions();
  const [mode, setMode] = useState<"reject" | "revise">();
  const [comment, setComment] = useState("");
  const send = (decision: "approve" | "reject" | "revise") => {
    if (!id) return;
    if (decision !== "approve" && comment.trim().length < 3)
      return toast.error("Tell us why (at least 3 characters)");
    decide.mutate(
      { id, decision, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      {
        onSuccess: () => {
          toast.success(
            decision === "approve"
              ? "Quote approved"
              : decision === "reject"
                ? "Quote rejected"
                : "Revision requested",
          );
          setMode(undefined);
          setComment("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
    return undefined;
  };
  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => {
        if (!o) {
          setMode(undefined);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Quotation <span className="font-mono">{id}</span>
            {q.data && <QuotePill status={q.data.status} />}
          </DialogTitle>
        </DialogHeader>
        {q.isPending ? (
          <div className="h-48 bg-muted rounded-lg animate-pulse" />
        ) : q.isError ? (
          <p className="text-destructive">{q.error.message}</p>
        ) : (
          <div className="space-y-4">
            {(q.data.versions?.length ?? 0) > 1 && (
              <div className="flex flex-wrap gap-2 text-[12px]">
                {q.data.versions!.map((v) => (
                  <button
                    key={v.quoteId}
                    onClick={() => onPick(v.quoteId)}
                    className={cn(
                      "h-8 px-3 rounded-md border",
                      v.quoteId === id ? "bg-navy text-navy-foreground border-navy" : "border-line",
                    )}
                  >
                    V{v.version} · {inr(v.total)} · {v.status.replace("_", " ")}
                  </button>
                ))}
              </div>
            )}
            <QuoteBreakdown q={q.data} />
            {q.data.terms && (
              <p className="text-[12px] text-mute whitespace-pre-line">{q.data.terms}</p>
            )}
            {q.data.decisionComment && (
              <p className="text-[13px] rounded-lg bg-muted px-3 py-2">
                Your note: “{q.data.decisionComment}”
              </p>
            )}
            {q.data.status === "released" &&
              (mode ? (
                <div className="space-y-2">
                  <label htmlFor="qc" className="font-medium text-[13px]">
                    {mode === "reject"
                      ? "Why are you rejecting this quote?"
                      : "What should we change?"}
                  </label>
                  <Textarea
                    id="qc"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <DialogFooter>
                    <Btn variant="secondary" onClick={() => setMode(undefined)}>
                      Back
                    </Btn>
                    <Btn variant="dark" disabled={decide.isPending} onClick={() => send(mode)}>
                      {mode === "reject" ? "Reject quote" : "Request revision"}
                    </Btn>
                  </DialogFooter>
                </div>
              ) : (
                <DialogFooter className="gap-2">
                  <Btn variant="ghost" onClick={() => setMode("reject")}>
                    Reject
                  </Btn>
                  <Btn variant="secondary" onClick={() => setMode("revise")}>
                    Request revision
                  </Btn>
                  <Btn disabled={decide.isPending} onClick={() => send("approve")}>
                    Approve {inr(q.data.total)}
                  </Btn>
                </DialogFooter>
              ))}
            {q.data.status === "expired" && (
              <p className="text-[13px] text-destructive">Expired on {q.data.validUntil}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MyBookings() {
  const b = useMyBookings();
  const { cancel } = useClientActions();
  const [target, setTarget] = useState<BookingView>();
  const [gallery, setGallery] = useState<string>();
  const [reason, setReason] = useState("");
  const fee = target ? cancellationFor(target.total, target.start, todayIST()) : undefined;
  return (
    <KCard title="Bookings" bodyClass="divide-y divide-line">
      {b.isPending ? (
        <Loading />
      ) : !b.data?.length ? (
        <Empty title="No bookings" />
      ) : (
        b.data.map((x) => (
          <div
            key={x.bookingId}
            className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]"
          >
            <span className="font-mono text-[12px] w-36">{x.bookingId}</span>
            <span className="flex-1 min-w-48">
              {x.items.map((i) => i.title).join(", ")}
              <span className="block text-[12px] text-mute">
                {x.start} → {x.end} · booked {fmtDate(x.createdAt)}
              </span>
              {x.cancellation && (
                <span className="block text-[12px] text-destructive">
                  Cancelled: fee {inr(x.cancellation.fee)}, refundable{" "}
                  {inr(x.cancellation.refundable)}
                </span>
              )}
            </span>
            <span className="font-semibold">{inr(x.total)}</span>
            <Pill tone={x.status === "cancelled" ? "danger" : "verified"}>{x.status}</Pill>
            {x.status !== "cancelled" && (
              <Btn
                variant="secondary"
                className="h-8 px-3 text-[12px]"
                onClick={() => setGallery(x.bookingId)}
              >
                Proof & updates
              </Btn>
            )}
            {x.status === "confirmed" && (
              <Btn variant="ghost" className="h-8 px-3 text-[12px]" onClick={() => setTarget(x)}>
                Cancel
              </Btn>
            )}
          </div>
        ))
      )}
      <ProofGallery bookingId={gallery} onClose={() => setGallery(undefined)} />
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {target?.bookingId}?</DialogTitle>
          </DialogHeader>
          {fee && target && (
            <div className="space-y-3 text-[13px]">
              <p className="rounded-lg bg-hold-soft border border-hold/30 p-3">
                {fee.rule}.<br />
                Cancellation fee <b>{inr(fee.fee)}</b> of {inr(target.total)}; refundable{" "}
                <b>{inr(fee.refundable)}</b>
              </p>
              <label htmlFor="cr" className="font-medium">
                Reason
              </label>
              <Textarea
                id="cr"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <DialogFooter>
                <Btn variant="secondary" onClick={() => setTarget(undefined)}>
                  Keep booking
                </Btn>
                <Btn
                  variant="dark"
                  disabled={reason.trim().length < 3 || cancel.isPending}
                  onClick={() =>
                    cancel.mutate(
                      { id: target.bookingId, reason: reason.trim() },
                      {
                        onSuccess: () => {
                          toast.success("Booking cancelled");
                          setTarget(undefined);
                          setReason("");
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  Cancel booking
                </Btn>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </KCard>
  );
}
