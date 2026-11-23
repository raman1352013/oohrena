import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { inr } from "@/lib/format";
import { Btn, Empty, KCard, Loading, Notice, Pill, Row, Stats } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCreatePartnerLead, usePartnerEarnings, usePartnerLeads } from "@/lib/partner-api";

export const Route = createFileRoute("/partner")({
  head: () => ({
    meta: [{ title: "Referrals — OOHRENA" }],
  }),
  component: Partner,
});

function Partner() {
  const { data: leads, isLoading: leadsLoading } = usePartnerLeads();
  const { data: earnings } = usePartnerEarnings();
  const createLead = useCreatePartnerLead();

  const [form, setForm] = useState({
    clientName: "",
    clientMobile: "",
    clientEmail: "",
    city: "",
    budget: "",
    requirement: "",
  });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await createLead.mutateAsync({
        clientName: form.clientName,
        clientMobile: form.clientMobile,
        city: form.city,
        ...(form.clientEmail ? { clientEmail: form.clientEmail } : {}),
        ...(form.budget ? { budget: Number(form.budget) } : {}),
        requirement: form.requirement,
      });
      setSuccessMsg(`Referred as ${res.leadId}`);
      setForm({
        clientName: "",
        clientMobile: "",
        clientEmail: "",
        city: "",
        budget: "",
        requirement: "",
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-6">
      <h1 className="text-[22px] font-semibold">Referrals</h1>

      <Stats
        items={[
          { label: "Referrals", value: earnings?.totalLeads ?? leads?.length ?? 0 },
          { label: "Booked", value: earnings?.convertedBookings ?? 0 },
          {
            label: "Commission earned",
            value: inr(earnings?.earnedCommission ?? 0),
            tone: "verified",
          },
          {
            label: "Commission pending",
            value: inr(earnings?.pendingCommission ?? 0),
            tone: "hold",
          },
        ]}
      />

      {/* New referral */}
      <KCard title="New referral">
        <form onSubmit={handleSubmit} className="space-y-4">
          {successMsg && <Notice>{successMsg}</Notice>}
          <FormError message={errorMsg ?? undefined} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field
              id="ref-name"
              label="Advertiser"
              required
              value={form.clientName}
              onChange={set("clientName")}
            />
            <Field
              id="ref-mobile"
              label="Mobile"
              type="tel"
              required
              value={form.clientMobile}
              onChange={set("clientMobile")}
            />
            <Field
              id="ref-email"
              label="Email"
              type="email"
              value={form.clientEmail}
              onChange={set("clientEmail")}
            />
            <Field id="ref-city" label="City" required value={form.city} onChange={set("city")} />
            <Field
              id="ref-budget"
              label="Budget (₹)"
              type="number"
              min={0}
              value={form.budget}
              onChange={set("budget")}
            />
            <div className="md:col-span-3 space-y-1.5">
              <Label htmlFor="ref-req" className="text-[13px] text-ink">
                Requirement
              </Label>
              <Textarea
                id="ref-req"
                required
                rows={3}
                value={form.requirement}
                onChange={set("requirement")}
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Btn type="submit" disabled={createLead.isPending}>
              {createLead.isPending ? "Submitting…" : "Refer"}
            </Btn>
          </div>
        </form>
      </KCard>

      {/* Referrals List */}
      <KCard title="Referrals" bodyClass="divide-y divide-line">
        {leadsLoading ? (
          <Loading />
        ) : leads && leads.length > 0 ? (
          leads.map((l) => (
            <div
              key={l.leadId}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[13px]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-medium">{l.leadId}</span>
                  <Pill
                    tone={
                      l.status === "won" ? "verified" : l.status === "quoted" ? "hold" : "neutral"
                    }
                  >
                    {l.status}
                  </Pill>
                </div>
                <div className="font-medium mt-1">
                  {l.clientName || "Client"} · {l.city}
                </div>
                <div className="text-[12px] text-mute line-clamp-1">{l.requirement}</div>
              </div>
              <div className="flex items-center gap-4 text-right">
                {l.budget ? <div className="font-semibold">{inr(l.budget)}</div> : null}
                {l.booking ? (
                  <div className="text-right space-y-1">
                    <div className="text-[11px] font-mono text-mute">{l.booking.bookingId}</div>
                    <Pill tone="verified">{l.booking.status}</Pill>
                  </div>
                ) : (
                  <span className="text-[12px] text-mute">
                    {l.quotesCount} {l.quotesCount === 1 ? "quote" : "quotes"}
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty title="No referrals" />
        )}
      </KCard>

      {/* Commission Breakdown */}
      {earnings && earnings.breakdown && earnings.breakdown.length > 0 && (
        <KCard title="Commission" bodyClass="px-5 divide-y divide-line">
          {earnings.breakdown.map((b) => (
            <Row
              key={b.bookingId}
              k={
                <div>
                  <div className="font-medium text-ink">{b.clientName}</div>
                  <div className="text-[12px] font-mono text-mute">
                    {b.bookingId} · {b.leadId}
                  </div>
                </div>
              }
              v={
                <div className="text-right space-y-1">
                  <div className="font-semibold text-[14px]">{inr(b.commissionAmount)}</div>
                  <Pill tone={b.earned ? "verified" : "hold"}>
                    {b.earned ? "Earned" : "Pending"}
                  </Pill>
                </div>
              }
            />
          ))}
        </KCard>
      )}
    </div>
  );
}
