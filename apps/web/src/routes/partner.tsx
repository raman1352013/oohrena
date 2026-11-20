import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { inr } from "@/lib/format";
import { Btn, Empty, Eyebrow, KCard, Pill, Row } from "@/components/app/kit";
import { useCreatePartnerLead, usePartnerEarnings, usePartnerLeads } from "@/lib/partner-api";

export const Route = createFileRoute("/partner")({
  head: () => ({
    meta: [
      { title: "City Growth Partner — OOHRENA" },
      {
        name: "description",
        content: "Refer advertisers to OOHRENA media and track referral commission.",
      },
      { property: "og:title", content: "City Growth Partner — OOHRENA" },
      { property: "og:description", content: "Refer advertisers and track commission." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Partner,
});

function Partner() {
  const { data: leads, isLoading: leadsLoading } = usePartnerLeads();
  const { data: earnings, isLoading: earningsLoading } = usePartnerEarnings();
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
        clientEmail: form.clientEmail || undefined,
        city: form.city,
        budget: form.budget ? Number(form.budget) : undefined,
        requirement: form.requirement,
      });
      setSuccessMsg(
        `Lead ${res.leadId} submitted successfully! Central Admin will review availability.`,
      );
      setForm({
        clientName: "",
        clientMobile: "",
        clientEmail: "",
        city: "",
        budget: "",
        requirement: "",
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit referral lead");
    }
  };

  const commRate = earnings?.commissionRatePct ?? 5;

  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-6">
      <div>
        <Eyebrow>City Growth Partner</Eyebrow>
        <h1 className="text-[22px] font-semibold mt-1">Referrals & Commission</h1>
        <p className="text-[13px] text-mute mt-1">
          Earn {commRate}% of media value on every referred campaign that goes live.
        </p>
      </div>

      {/* Summary KPI Strip */}
      <div className="bg-card border border-line rounded-xl grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-line">
        <div className="p-4">
          <div className="text-[12px] text-mute">Total Inquiries</div>
          <div className="text-2xl font-bold mt-1">
            {earnings?.totalLeads ?? leads?.length ?? 0}
          </div>
        </div>
        <div className="p-4">
          <div className="text-[12px] text-mute">Converted Campaigns</div>
          <div className="text-2xl font-bold mt-1">{earnings?.convertedBookings ?? 0}</div>
        </div>
        <div className="p-4">
          <div className="text-[12px] text-mute">Commission Earned</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">
            {inr(earnings?.earnedCommission ?? 0)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-[12px] text-mute">Pending Payout</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">
            {inr(earnings?.pendingCommission ?? 0)}
          </div>
        </div>
      </div>

      {/* Refer a New Client Form */}
      <KCard title="Refer a New Advertiser">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {successMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-800 text-[13px] rounded-lg border border-emerald-200">
              {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-800 text-[13px] rounded-lg border border-red-200">
              {errorMsg}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">
                Advertiser / Brand Name *
              </label>
              <input
                required
                type="text"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="e.g. Apollo Pharmacy"
                className="w-full h-10 rounded-lg border border-line bg-card px-3 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">
                Mobile Number *
              </label>
              <input
                required
                type="text"
                value={form.clientMobile}
                onChange={(e) => setForm({ ...form, clientMobile: e.target.value })}
                placeholder="+91 9876543210"
                className="w-full h-10 rounded-lg border border-line bg-card px-3 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">Email Address</label>
              <input
                type="email"
                value={form.clientEmail}
                onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                placeholder="client@example.com"
                className="w-full h-10 rounded-lg border border-line bg-card px-3 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">Target City *</label>
              <input
                required
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="e.g. Mumbai, Indore"
                className="w-full h-10 rounded-lg border border-line bg-card px-3 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">
                Indicative Budget (₹)
              </label>
              <input
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="e.g. 250000"
                className="w-full h-10 rounded-lg border border-line bg-card px-3 text-[13px]"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[12px] font-medium text-mute mb-1">
                Requirement / Media Corridor Details *
              </label>
              <textarea
                required
                rows={3}
                value={form.requirement}
                onChange={(e) => setForm({ ...form, requirement: e.target.value })}
                placeholder="Describe locations, billboard formats, campaign duration or expected dates..."
                className="w-full rounded-lg border border-line bg-card p-3 text-[13px]"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Btn type="submit" tone="primary" disabled={createLead.isPending}>
              {createLead.isPending ? "Submitting Inquiry..." : "Submit Referral Lead"}
            </Btn>
          </div>
        </form>
      </KCard>

      {/* Referrals List */}
      <KCard title="My Referred Leads" bodyClass="divide-y divide-line">
        {leadsLoading ? (
          <div className="p-8 text-center text-mute text-[13px]">Loading referrals...</div>
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
                  <div className="text-right">
                    <span className="text-[11px] font-mono text-emerald-600 block">
                      {l.booking.bookingId}
                    </span>
                    <span className="text-[12px] font-medium text-emerald-700">
                      {l.booking.status}
                    </span>
                  </div>
                ) : (
                  <span className="text-[12px] text-mute">{l.quotesCount} quote(s)</span>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty
            title="No referrals yet"
            hint="Submit your first advertiser inquiry above to begin earning commission."
          />
        )}
      </KCard>

      {/* Commission Breakdown */}
      {earnings && earnings.breakdown && earnings.breakdown.length > 0 && (
        <KCard title="Commission Earnings Breakdown" bodyClass="divide-y divide-line">
          {earnings.breakdown.map((b) => (
            <Row
              key={b.bookingId}
              label={
                <div>
                  <div className="font-medium">{b.clientName}</div>
                  <div className="text-[12px] font-mono text-mute">
                    {b.bookingId} · Lead {b.leadId}
                  </div>
                </div>
              }
              value={
                <div className="text-right">
                  <div className="font-bold text-[14px]">{inr(b.commissionAmount)}</div>
                  <Pill tone={b.earned ? "verified" : "hold"}>
                    {b.earned ? "Earned & Payout Ready" : "Pending Live Completion"}
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
