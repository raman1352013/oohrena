import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Btn } from "@/components/app/kit";
import { Field } from "@/components/app/AuthShell";

export type AskOptions = {
  title: string;
  /** Button text, a verb: "Reject", "Cancel booking". */
  action: string;
  danger?: boolean | undefined;
  /** State the user must see before deciding (a fee, who sees the reason). Never instructions. */
  body?: ReactNode;
  /** Text box label; "Reason" by default. */
  label?: string | undefined;
  /** A reason is required (3+ characters) unless this is false. */
  required?: boolean | undefined;
  /** Also ask for a date (YYYY-MM-DD). */
  date?: { label: string; min?: string | undefined; value?: string | undefined } | undefined;
};
export type AskResult = { reason: string; date: string };

type Pending = AskOptions & { resolve: (r: AskResult | null) => void };
let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Ask for a reason (and optionally a date) in a dialog. Resolves to null if the user cancels.
 * Use it instead of window.prompt/confirm: `const r = await ask({ title: "Reject proof", action: "Reject", danger: true })`.
 */
export function ask(opts: AskOptions): Promise<AskResult | null> {
  pending?.resolve(null);
  return new Promise((resolve) => {
    pending = { ...opts, resolve };
    emit();
  });
}

function settle(r: AskResult | null) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(r);
}

/** Mount once (in the root layout). Renders whatever `ask()` is waiting on. */
export function AskHost() {
  const p = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => null,
  );
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setReason("");
    setDate(p?.date?.value ?? "");
    setError(undefined);
  }, [p]);

  if (!p) return null;
  const required = p.required !== false;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    if (p.date && !date) return setError("Pick a date");
    if (required && reason.trim().length < 3) return setError("Give a reason");
    settle({ reason: reason.trim(), date });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && settle(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{p.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {p.body && (
            <div className="rounded-lg bg-muted px-3 py-2.5 text-[13px] text-ink">{p.body}</div>
          )}
          {p.date && (
            <Field
              id="ask-date"
              type="date"
              label={p.date.label}
              min={p.date.min}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ask-reason" className="text-[13px] text-ink">
              {p.label ?? "Reason"}
            </Label>
            <Textarea
              id="ask-reason"
              rows={3}
              autoFocus={!p.date}
              value={reason}
              aria-invalid={!!error}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
            />
            {error && (
              <p role="alert" className="text-[12px] text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="secondary" onClick={() => settle(null)}>
              Back
            </Btn>
            <Btn
              type="submit"
              variant={p.danger ? "dark" : "primary"}
              className={p.danger ? "bg-destructive text-white hover:bg-destructive/90" : ""}
            >
              {p.action}
            </Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
