import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { leadCreateInput, minDaysFor, registerClientInput } from "@oohrena/shared";
import { ApiError } from "@/lib/api";
import { useRegisterClient, useSession } from "@/lib/auth";
import { useCreateLead } from "@/lib/marketplace-api";
import { getSavedReferralCode } from "@/lib/referral-capture";
import { Btn, ChipGroup } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

export type QuoteSite = { inventoryId: string; title: string; category: string; quantity: number };

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (from: string, days: number) => iso(new Date(Date.parse(from) + days * DAY));
const today = () => iso(new Date());
/** A calendar day (YYYY-MM-DD) as "2 Jan 2027"; no time, no timezone shift. */
const dayText = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type Length = "1" | "3" | "6" | "custom";
const LENGTHS: { id: Length; label: string }[] = [
  { id: "1", label: "1 month" },
  { id: "3", label: "3 months" },
  { id: "6", label: "6 months" },
  { id: "custom", label: "Pick dates" },
];
type Budget = "none" | "50000" | "100000" | "250000" | "500000";
const BUDGETS: { id: Budget; label: string }[] = [
  { id: "none", label: "Not sure" },
  { id: "50000", label: "Up to ₹50k" },
  { id: "100000", label: "₹1 lakh" },
  { id: "250000", label: "₹2.5 lakh" },
  { id: "500000", label: "₹5 lakh+" },
];

const firstErrors = (issues: { path: PropertyKey[]; message: string }[]) =>
  Object.fromEntries(issues.map((i) => [i.path.join("."), i.message]).reverse());

/**
 * Ask for a quote in as few taps as possible: dates and budget are chips, the note is optional when
 * sites are chosen, and a visitor creates the account in the same sheet (name, email, mobile,
 * password). Company and GST are asked later, when the quote is approved.
 */
export function QuickQuote({
  sites,
  defaultFrom,
  onDone,
  onSubmitted,
}: {
  sites: QuoteSite[];
  defaultFrom?: string | undefined;
  onDone: () => void;
  onSubmitted?: (() => void) | undefined;
}) {
  const { data: user } = useSession();
  const create = useCreateLead();
  const register = useRegisterClient();

  const minDays = Math.max(1, ...sites.map((s) => minDaysFor(s.category)));
  const [from, setFrom] = useState(defaultFrom ?? plus(today(), 7));
  const [length, setLength] = useState<Length>("1");
  const [customTo, setCustomTo] = useState(plus(defaultFrom ?? plus(today(), 7), 29));
  const [qty, setQty] = useState("1");
  const [budget, setBudget] = useState<Budget>("none");
  const [note, setNote] = useState("");
  const [acct, setAcct] = useState({ fullName: "", email: "", mobile: "", password: "" });
  const [accept, setAccept] = useState(false);
  const [step, setStep] = useState<"campaign" | "account">("campaign");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [done, setDone] = useState<string>();

  const to = length === "custom" ? customTo : plus(from, Number(length) * 30 - 1);
  const single = sites.length === 1 ? sites[0]! : undefined;
  const busy = create.isPending || register.isPending;

  if (user && user.role !== "client")
    return (
      <p className="text-[13px] text-mute">Sign in with a client account to request a quote.</p>
    );

  if (done)
    return (
      <div className="rounded-lg border border-verified/30 bg-verified-soft p-5 text-center">
        <CheckCircle2 className="mx-auto text-verified" size={32} />
        <div className="font-semibold mt-2">Inquiry received</div>
        <p className="font-mono text-[15px] mt-1">{done}</p>
        <div className="flex justify-center gap-2 mt-4">
          <Btn variant="secondary" className="h-9" onClick={onDone}>
            Keep browsing
          </Btn>
          <Link to="/client">
            <Btn className="h-9" tabIndex={-1}>
              Track it
            </Btn>
          </Link>
        </div>
      </div>
    );

  const lead = () =>
    leadCreateInput.safeParse({
      inventoryIds: sites.map((s) => s.inventoryId),
      from,
      to,
      qty: single && single.quantity > 1 ? qty : 1,
      budget: budget === "none" ? undefined : Number(budget),
      requirement: note,
    });

  function next(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const p = lead();
    if (!p.success) return setErrors(firstErrors(p.error.issues));
    if (Date.parse(to) - Date.parse(from) + DAY < minDays * DAY)
      return setErrors({ to: `Book at least ${minDays} days for this media` });
    setErrors({});
    if (!user) return setStep("account");
    void send();
    return undefined;
  }

  async function send() {
    setFormError(undefined);
    const p = lead();
    if (!p.success) {
      setStep("campaign");
      return setErrors(firstErrors(p.error.issues));
    }
    try {
      if (!user) {
        const ref = getSavedReferralCode();
        const a = registerClientInput.safeParse({
          ...acct,
          acceptTerms: accept,
          ...(ref ? { ref } : {}),
        });
        if (!a.success) return setErrors(firstErrors(a.error.issues));
        setErrors({});
        await register.mutateAsync(a.data);
      }
      const l = await create.mutateAsync(p.data);
      setDone(l.leadId);
      toast.success(`Inquiry ${l.leadId} submitted`);
      onSubmitted?.();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]!])));
      else if (err instanceof ApiError && err.code === "CONFLICT") {
        const field = (err.details as { field?: string } | undefined)?.field;
        if (field === "email" || field === "mobile") setErrors({ [field]: err.message });
        else setFormError(err.message);
      } else setFormError(err instanceof Error ? err.message : String(err));
    }
    return undefined;
  }

  if (step === "account")
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        noValidate
        className="space-y-3 text-[13px]"
      >
        <div className="flex items-center justify-between">
          <div className="font-semibold text-[15px]">Your details</div>
          <span className="text-[12px] text-mute">Step 2 of 2</span>
        </div>
        <FormError message={formError} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            id="qq-name"
            label="Your name"
            autoComplete="name"
            value={acct.fullName}
            error={errors["fullName"]}
            onChange={(e) => setAcct({ ...acct, fullName: e.target.value })}
          />
          <Field
            id="qq-mobile"
            label="Mobile"
            type="tel"
            autoComplete="tel"
            value={acct.mobile}
            error={errors["mobile"]}
            onChange={(e) => setAcct({ ...acct, mobile: e.target.value })}
          />
          <Field
            id="qq-email"
            label="Work email"
            type="email"
            autoComplete="email"
            value={acct.email}
            error={errors["email"]}
            onChange={(e) => setAcct({ ...acct, email: e.target.value })}
          />
          <Field
            id="qq-pw"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={acct.password}
            error={errors["password"]}
            onChange={(e) => setAcct({ ...acct, password: e.target.value })}
          />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={accept}
            onCheckedChange={(v) => setAccept(v === true)}
            className="mt-0.5"
            aria-invalid={!!errors["acceptTerms"]}
          />
          <span>
            I accept the{" "}
            <Link to="/privacy" target="_blank" className="underline">
              Privacy Policy
            </Link>
            ,{" "}
            <Link to="/terms" target="_blank" className="underline">
              Terms of Use
            </Link>{" "}
            and the{" "}
            <Link to="/confidentiality" target="_blank" className="underline">
              Confidentiality &amp; Anti-circumvention Agreement
            </Link>{" "}
            (v1.0).
          </span>
        </label>
        {errors["acceptTerms"] && (
          <p className="text-[12px] text-destructive">{errors["acceptTerms"]}</p>
        )}
        <div className="flex gap-2 pt-1">
          <Btn
            type="button"
            variant="secondary"
            onClick={() => setStep("campaign")}
            disabled={busy}
          >
            Back
          </Btn>
          <Btn type="submit" className="flex-1" disabled={busy}>
            {busy ? "Sending…" : "Get my quote"}
          </Btn>
        </div>
        <p className="text-[12px] text-mute">
          Already have an account?{" "}
          <Link to="/login" search={{ redirect: "/marketplace" }} className="underline">
            Sign in
          </Link>
        </p>
      </form>
    );

  return (
    <form onSubmit={next} noValidate className="space-y-4 text-[13px]">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-[15px]">
          {sites.length > 1 ? `Get a quote for ${sites.length} sites` : "Get a quote"}
        </div>
        {!user && <span className="text-[12px] text-mute">Step 1 of 2</span>}
      </div>
      <FormError message={formError} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          id="qq-from"
          label="Start"
          type="date"
          min={today()}
          value={from}
          error={errors["from"]}
          onChange={(e) => {
            setFrom(e.target.value);
            if (customTo < e.target.value) setCustomTo(plus(e.target.value, 29));
          }}
        />
        {length === "custom" ? (
          <Field
            id="qq-to"
            label="End"
            type="date"
            min={from}
            value={customTo}
            error={errors["to"]}
            onChange={(e) => setCustomTo(e.target.value)}
          />
        ) : (
          <div className="space-y-1.5">
            <div className="font-medium">End</div>
            <div className="h-10 flex items-center text-mute">{dayText(to)}</div>
            {errors["to"] && <p className="text-[12px] text-destructive">{errors["to"]}</p>}
          </div>
        )}
      </div>
      <ChipGroup
        label="How long"
        options={LENGTHS.map((l) => ({
          ...l,
          disabled: l.id !== "custom" && Number(l.id) * 30 < minDays,
        }))}
        value={length}
        onChange={setLength}
      />
      {single && single.quantity > 1 && (
        <Field
          id="qq-qty"
          label={`Quantity (of ${single.quantity})`}
          inputMode="numeric"
          value={qty}
          error={errors["qty"]}
          onChange={(e) => setQty(e.target.value)}
        />
      )}
      <ChipGroup label="Budget" options={BUDGETS} value={budget} onChange={setBudget} />
      <div className="space-y-1.5">
        <label htmlFor="qq-note" className="font-medium">
          Note (optional)
        </label>
        <Textarea id="qq-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        {errors["requirement"] && (
          <p className="text-[12px] text-destructive">{errors["requirement"]}</p>
        )}
      </div>
      <Btn type="submit" className="w-full" disabled={busy}>
        {busy ? "Sending…" : user ? "Get my quote" : "Next"}
      </Btn>
    </form>
  );
}
