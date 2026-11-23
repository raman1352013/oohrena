import { useState } from "react";
import { toast } from "sonner";
import { AVAILABILITY_STATE_LABEL, type AvailabilityState } from "@oohrena/shared";
import { ApiError } from "@/lib/api";
import { useAvailabilityActions, useOwnerCalendar, type Entry } from "@/lib/marketplace-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Pill } from "@/components/app/kit";
import { ask } from "@/components/app/ask";
import { Field } from "@/components/app/AuthShell";
import { AvailabilityCalendar } from "@/components/app/AvailabilityCalendar";

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const today = () => iso(Date.now());

const errText = (e: Error) => {
  const days =
    e instanceof ApiError
      ? (e.details as { unavailableDays?: { date: string }[] } | undefined)?.unavailableDays
      : undefined;
  return days?.length
    ? `${e.message}: ${days
        .slice(0, 5)
        .map((d) => d.date)
        .join(", ")}${days.length > 5 ? "…" : ""}`
    : e.message;
};

/** Calendar + holds/blocks for one listing. Vendor: own listing, block dates, live-calendar switch. Admin: also place/release holds. */
export function OwnerAvailabilityDialog({
  scope,
  listing,
  onClose,
}: {
  scope: "vendor" | "admin";
  listing: { inventoryId: string; title: string } | undefined;
  onClose: () => void;
}) {
  const from = today();
  const to = iso(Date.now() + 89 * 86_400_000);
  const cal = useOwnerCalendar(scope, listing?.inventoryId, from, to);
  const act = useAvailabilityActions(scope);
  const [form, setForm] = useState({
    from: iso(Date.now() + 7 * 86_400_000),
    to: iso(Date.now() + 36 * 86_400_000),
    qty: "1",
    reason: "",
  });
  const [err, setErr] = useState<string>();
  if (!listing) return null;
  const id = listing.inventoryId;
  const cap = cal.data?.days[0]?.capacity ?? 1;

  const run = (p: Promise<unknown>, ok: string) => {
    setErr(undefined);
    p.then(() => toast.success(ok)).catch((e: Error) => setErr(errText(e)));
  };
  const doBlock = () => {
    if (form.reason.trim().length < 3)
      return setErr("Give a reason for blocking (at least 3 characters)");
    run(
      act.block.mutateAsync({
        id,
        from: form.from,
        to: form.to,
        ...(cap > 1 ? { qty: Number(form.qty) } : {}),
        reason: form.reason.trim(),
      }),
      "Dates blocked",
    );
    return undefined;
  };
  const doHold = () =>
    run(
      act.hold.mutateAsync({
        inventoryId: id,
        from: form.from,
        to: form.to,
        qty: Number(form.qty) || 1,
        ...(form.reason.trim() ? { note: form.reason.trim() } : {}),
      }),
      "Hold placed",
    );

  return (
    <Dialog open={!!listing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Availability · {listing.title}{" "}
            <span className="font-mono text-[12px] text-mute">{id}</span>
          </DialogTitle>
        </DialogHeader>
        {cal.isPending ? (
          <div className="h-48 rounded-lg bg-muted animate-pulse" />
        ) : cal.isError ? (
          <p className="text-destructive text-[13px]">{cal.error.message}</p>
        ) : (
          <div className="space-y-5 text-[13px]">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
              <div className="flex-1 min-w-60">
                <div className="font-semibold">
                  {cal.data.mode === "managed"
                    ? "Live calendar (vendor-managed)"
                    : "On request — each hold needs vendor confirmation"}
                </div>
                <div className="text-mute text-[12px]">
                  {cal.data.mode === "managed"
                    ? "Clients see dates as confirmed. Keep blocked dates up to date."
                    : "Clients see “Subject to vendor confirmation”. The vendor confirms or declines every hold within 48 hours."}
                </div>
              </div>
              {scope === "vendor" && (
                <Btn
                  variant="secondary"
                  className="h-9"
                  disabled={act.setMode.isPending}
                  onClick={() =>
                    run(
                      act.setMode.mutateAsync({
                        id,
                        mode: cal.data.mode === "managed" ? "on_request" : "managed",
                      }),
                      "Availability mode updated",
                    )
                  }
                >
                  {cal.data.mode === "managed"
                    ? "Switch to on-request"
                    : "I keep this calendar live"}
                </Btn>
              )}
            </div>

            <AvailabilityCalendar days={cal.data.days} showUnits={cap > 1} />

            <div>
              <div className="font-semibold mb-2">Holds, bookings and blocks (next 90 days)</div>
              {cal.data.entries.length ? (
                <div className="divide-y divide-line border border-line rounded-lg">
                  {cal.data.entries.map((e) => (
                    <EntryRow
                      key={e.holdId}
                      e={e}
                      scope={scope}
                      onEnd={(reason) =>
                        run(
                          e.kind === "hold"
                            ? act.release.mutateAsync({ holdId: e.holdId, reason })
                            : act.unblock.mutateAsync({ id, blockId: e.holdId }),
                          e.kind === "hold" ? "Hold released" : "Dates unblocked",
                        )
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="text-mute">Nothing held or blocked</p>
              )}
            </div>

            <div className="grid sm:grid-cols-4 gap-3 items-end border-t border-line pt-4">
              <Field
                id="af"
                label="From"
                type="date"
                min={from}
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
              />
              <Field
                id="at"
                label="To"
                type="date"
                min={form.from}
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
              />
              {cap > 1 ? (
                <Field
                  id="aq"
                  label={`Units (of ${cap})`}
                  inputMode="numeric"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                />
              ) : (
                <div />
              )}
              <div />
              <Field
                id="ar"
                className="sm:col-span-4"
                label={
                  scope === "admin"
                    ? "Reason / note (reason required to block)"
                    : "Reason (e.g. maintenance, sold offline)"
                }
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
              <div className="sm:col-span-4 flex flex-wrap gap-2">
                <Btn
                  variant="dark"
                  className="h-9"
                  disabled={act.block.isPending}
                  onClick={doBlock}
                >
                  Block dates
                </Btn>
                {scope === "admin" && (
                  <Btn className="h-9" disabled={act.hold.isPending} onClick={doHold}>
                    Place 48h hold
                  </Btn>
                )}
              </div>
              {err && <p className="sm:col-span-4 text-destructive text-[12px]">{err}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EntryRow({
  e,
  scope,
  onEnd,
}: {
  e: Entry;
  scope: "vendor" | "admin";
  onEnd: (reason: string) => void;
}) {
  const label =
    e.kind === "block"
      ? "Blocked"
      : e.kind === "booking"
        ? "Booked"
        : (AVAILABILITY_STATE_LABEL[
            (e.status === "held" ? "hold" : e.status) as AvailabilityState
          ] ?? e.status);
  const canEnd = (e.kind === "hold" && scope === "admin") || e.kind === "block";
  return (
    <div className="px-3 py-2 flex flex-wrap items-center gap-3">
      <Pill tone={e.kind === "block" ? "neutral" : e.kind === "booking" ? "navy" : "hold"}>
        {label}
      </Pill>
      <span className="font-mono text-[12px]">
        {e.from} → {e.to}
      </span>
      {e.qty > 1 && <span className="text-mute">{e.qty} units</span>}
      {e.leadId && <span className="font-mono text-[12px] text-mute">{e.leadId}</span>}
      <span className="flex-1 text-mute text-[12px] truncate">
        {e.reason}
        {e.expiresAt && e.kind === "hold"
          ? ` · expires ${new Date(e.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
          : ""}
      </span>
      {canEnd && (
        <button
          className="text-[12px] font-semibold text-saffron-deep hover:underline"
          onClick={async () => {
            if (e.kind !== "hold") return onEnd("");
            const r = await ask({ title: "Release hold", action: "Release", required: false });
            if (r) onEnd(r.reason || "Released by admin");
            return undefined;
          }}
        >
          {e.kind === "hold" ? "Release" : "Unblock"}
        </button>
      )}
    </div>
  );
}
