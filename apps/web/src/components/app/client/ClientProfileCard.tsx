import { useState } from "react";
import { toast } from "sonner";
import { Btn, KCard, Loading, Row } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { useClientProfile, useUpdateClientProfile, type ClientProfileData } from "@/lib/deals-api";

type Form = Record<
  | "companyName"
  | "gstin"
  | "line1"
  | "line2"
  | "city"
  | "state"
  | "pin"
  | "name"
  | "email"
  | "mobile",
  string
>;

const toForm = (p: ClientProfileData): Form => ({
  companyName: p.companyName ?? "",
  gstin: p.gstin ?? "",
  line1: p.billingAddress?.line1 ?? "",
  line2: p.billingAddress?.line2 ?? "",
  city: p.billingAddress?.city ?? "",
  state: p.billingAddress?.state ?? "",
  pin: p.billingAddress?.pin ?? "",
  name: p.contacts[0]?.name ?? "",
  email: p.contacts[0]?.email ?? "",
  mobile: p.contacts[0]?.mobile ?? "",
});

/** Only send the parts that are filled in; empty strings would fail the shared schema. */
const opt = <K extends string>(k: K, v: string) =>
  v.trim() ? ({ [k]: v.trim() } as Record<K, string>) : {};

export function ClientProfileCard() {
  const { data: profile, isLoading } = useClientProfile();
  const update = useUpdateClientProfile();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string>();

  if (isLoading || !profile)
    return (
      <KCard title="Company">
        <Loading />
      </KCard>
    );

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    form &&
    setForm({ ...form, [k]: k === "gstin" ? e.target.value.toUpperCase() : e.target.value });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(undefined);
    update.mutate(
      {
        companyName: form.companyName.trim(),
        gstin: form.gstin.trim() || null,
        ...(form.line1.trim() && {
          billingAddress: {
            line1: form.line1.trim(),
            ...opt("line2", form.line2),
            city: form.city.trim(),
            state: form.state.trim(),
            pin: form.pin.trim(),
          },
        }),
        contacts: form.name.trim()
          ? [
              {
                name: form.name.trim(),
                ...opt("email", form.email),
                ...opt("mobile", form.mobile),
                ...opt("designation", profile.contacts[0]?.designation ?? ""),
              },
            ]
          : [],
      },
      {
        onSuccess: () => {
          toast.success("Saved");
          setForm(null);
        },
        onError: (err) => setError(err instanceof Error ? err.message : String(err)),
      },
    );
  };

  const a = profile.billingAddress;
  const c = profile.contacts[0];

  return (
    <KCard
      title="Company"
      right={
        !form && (
          <Btn size="sm" variant="secondary" onClick={() => setForm(toForm(profile))}>
            Edit
          </Btn>
        )
      }
    >
      {form ? (
        <form onSubmit={save} className="space-y-4">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="cp-company"
              label="Legal name"
              required
              value={form.companyName}
              onChange={set("companyName")}
            />
            <Field
              id="cp-gstin"
              label="GSTIN"
              className="font-mono"
              value={form.gstin}
              onChange={set("gstin")}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="cp-line1"
              label="Billing address"
              className="sm:col-span-2"
              value={form.line1}
              onChange={set("line1")}
            />
            <Field
              id="cp-line2"
              label="Address line 2"
              className="sm:col-span-2"
              value={form.line2}
              onChange={set("line2")}
            />
            <Field
              id="cp-city"
              label="City"
              required={!!form.line1}
              value={form.city}
              onChange={set("city")}
            />
            <Field
              id="cp-state"
              label="State"
              required={!!form.line1}
              value={form.state}
              onChange={set("state")}
            />
            <Field
              id="cp-pin"
              label="PIN"
              inputMode="numeric"
              required={!!form.line1}
              value={form.pin}
              onChange={set("pin")}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="cp-name" label="Billing contact" value={form.name} onChange={set("name")} />
            <Field
              id="cp-email"
              label="Email"
              type="email"
              value={form.email}
              onChange={set("email")}
            />
            <Field
              id="cp-mobile"
              label="Mobile"
              type="tel"
              value={form.mobile}
              onChange={set("mobile")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="secondary" onClick={() => setForm(null)}>
              Cancel
            </Btn>
            <Btn type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Btn>
          </div>
        </form>
      ) : (
        <div className="divide-y divide-line">
          <Row k="Legal name" v={profile.companyName ?? "—"} />
          <Row k="Client ID" v={<span className="font-mono">{profile.clientId}</span>} />
          <Row k="GSTIN" v={<span className="font-mono">{profile.gstin ?? "—"}</span>} />
          <Row
            k="Billing address"
            v={
              a
                ? [a.line1, a.line2, `${a.city}, ${a.state} ${a.pin}`].filter(Boolean).join(", ")
                : "—"
            }
          />
          <Row
            k="Billing contact"
            v={c ? [c.name, c.email, c.mobile].filter(Boolean).join(" · ") : "—"}
          />
        </div>
      )}
    </KCard>
  );
}
