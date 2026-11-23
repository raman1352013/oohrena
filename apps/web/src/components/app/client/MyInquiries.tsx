import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LeadStatus } from "@oohrena/shared";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { fmtDate, inr } from "@/lib/format";
import { useMyLeads } from "@/lib/marketplace-api";
import { Btn, Empty, KCard, Loading, Pill } from "@/components/app/kit";

const LABEL: Record<LeadStatus, string> = {
  new: "Received",
  under_review: "Under review",
  assigned: "Checking with media owner",
  quoted: "Quote ready",
  won: "Booked",
  lost: "Closed — not booked",
  closed: "Closed",
};
const TONE: Record<LeadStatus, "neutral" | "hold" | "saffron" | "verified"> = {
  new: "neutral",
  under_review: "hold",
  assigned: "hold",
  quoted: "saffron",
  won: "verified",
  lost: "neutral",
  closed: "neutral",
};

export function ClientHeading() {
  const { data: user } = useSession();
  const me = useQuery({
    queryKey: ["client", "me"],
    queryFn: () => api<{ clientId: string; companyName: string }>("/clients/me"),
  });
  return (
    <div className="flex flex-wrap items-end gap-3">
      <h1 className="text-[24px] font-semibold">{me.data?.companyName ?? "…"}</h1>
      <Link to="/marketplace" className="ml-auto">
        <Btn variant="secondary">Browse media</Btn>
      </Link>
    </div>
  );
}

/** Real inquiries (Lead IDs) for the signed-in client. */
export function MyInquiries() {
  const leads = useMyLeads();
  return (
    <KCard
      title="Inquiries"
      bodyClass="divide-y divide-line"
      right={
        <Link to="/marketplace">
          <Btn className="h-8 px-3 text-[12px]">New inquiry</Btn>
        </Link>
      }
    >
      {leads.isPending ? (
        <Loading />
      ) : leads.isError ? (
        <div className="p-6 text-center text-destructive text-[13px]">{leads.error.message}</div>
      ) : !leads.data.length ? (
        <Empty title="No inquiries" />
      ) : (
        leads.data.map((l) => (
          <div key={l.leadId} className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="font-mono text-[12px] w-36">{l.leadId}</span>
            <div className="flex-1 min-w-48">
              <div className="font-medium line-clamp-1">{l.requirement}</div>
              <div className="text-mute text-[12px]">
                {l.inventoryIds.join(", ") || l.city} · {l.from} → {l.to}
                {l.budget ? ` · budget ${inr(l.budget)}` : ""}
              </div>
            </div>
            <span className="text-mute text-[12px]">{fmtDate(l.createdAt)}</span>
            <Pill tone={TONE[l.status]}>{LABEL[l.status]}</Pill>
          </div>
        ))
      )}
    </KCard>
  );
}
