import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText } from "lucide-react";
import {
  ASSET_REVIEW,
  KYC_DOC_LABEL,
  RATE_CARD_REVIEW,
  REVIEW_CHECKS,
  reviewHasRejection,
  vendorReviewInput,
  type VendorReview,
  type VendorReviewInput,
} from "@oohrena/shared";
import { assetUrl } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import {
  useAdminVendor,
  useKycDecision,
  useSaveVendorReview,
  type AdminVendorDetail,
} from "@/lib/inventory-api";
import { Btn, Empty, KCard, Loading, Row } from "@/components/app/kit";
import { KycPill } from "@/components/app/status";
import { ask } from "@/components/app/ask";
import { FormError } from "@/components/app/AuthShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/vendors/$vendorId")({
  head: ({ params }) => ({ meta: [{ title: `${params.vendorId} — OOHRENA` }] }),
  component: VendorReviewPage,
});

function VendorReviewPage() {
  const { vendorId } = Route.useParams();
  const d = useAdminVendor(vendorId);
  if (d.isPending) return <Loading />;
  if (d.isError)
    return (
      <div className="p-16 text-center text-[13px]">
        <div className="text-destructive">{d.error.message}</div>
        <Btn variant="secondary" className="mt-3" onClick={() => void d.refetch()}>
          Try again
        </Btn>
      </div>
    );
  return <Workspace v={d.data} />;
}

function Workspace({ v }: { v: AdminVendorDetail }) {
  return (
    <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <Link
        to="/admin"
        search={{ tab: "vendors" }}
        className="inline-flex items-center gap-1 text-[13px] text-mute hover:text-ink"
      >
        <ArrowLeft size={14} /> Vendors
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold">{v.legalName}</h1>
        <span className="font-mono text-[12px] text-mute">{v.vendorId}</span>
        <KycPill status={v.kycStatus} />
        {v.onboarding?.submittedAt && (
          <span className="text-[12px] text-mute">
            Submitted {fmtDate(v.onboarding.submittedAt)}
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-5 min-w-0">
          <KCard title="Contact" bodyClass="px-5 divide-y divide-line">
            <Row k="Name" v={v.contact?.name ?? "—"} />
            <Row k="Email" v={v.contact?.email ?? "—"} />
            <Row k="Mobile" v={v.contact?.mobile ?? "—"} />
            <Row k="City" v={v.city} />
            <Row k="Registered" v={fmtDate(v.createdAt)} />
          </KCard>
          <Section title="Business" data={v.business} />
          <Section title="Category" data={v.category} />
          <Section title="Territory" data={v.territory} />
          <Section title="Execution" data={v.execution} />
          <Section title="Availability & SLA" data={v.sla} />
          <Documents v={v} />
          <KCard title="Bank" bodyClass="px-5 divide-y divide-line">
            {v.bank ? (
              <>
                <Row k="Account name" v={v.bank.accountName} />
                <Row k="Account no." v={<span className="font-mono">{v.bank.accountNo}</span>} />
                <Row k="IFSC" v={v.bank.ifsc} />
              </>
            ) : (
              <Empty title="No bank details" />
            )}
          </KCard>
          <Section title="Declaration" data={v.declaration} />
        </div>

        <div className="lg:sticky lg:top-20 space-y-4">
          <ReviewForm v={v} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Read-only onboarding sections ---------- */

const humanize = (k: string) =>
  k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

function show(v: unknown): ReactNode {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.map((x) => String(show(x))).join(", ") : "—";
  if (typeof v === "object")
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== null && x !== undefined && x !== "")
      .map(([k, x]) => `${humanize(k)}: ${String(show(x))}`)
      .join(" · ");
  // Stored enum values (pvt_ltd, gps_proof) read as words; IDs, codes and free text stay as typed.
  if (typeof v === "string" && /^[a-z]+(_[a-z]+)*$/.test(v)) return humanize(v);
  return String(v);
}

function Section({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  return (
    <KCard title={title} bodyClass="px-5 divide-y divide-line">
      {data ? (
        Object.entries(data).map(([k, x]) => (
          <Row key={k} k={humanize(k)} v={<span className="break-words">{show(x)}</span>} />
        ))
      ) : (
        <Empty title="Not filled" />
      )}
    </KCard>
  );
}

function Documents({ v }: { v: AdminVendorDetail }) {
  return (
    <KCard title="Documents" bodyClass="divide-y divide-line">
      {v.documents.length ? (
        v.documents.map((doc) => (
          <a
            key={doc.docId}
            href={assetUrl(`/api/v1/files/${doc.fileId}`)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-5 py-3 text-[13px] hover:bg-canvas"
          >
            <FileText size={15} className="text-mute" aria-hidden />
            <span className="font-medium text-ink">{KYC_DOC_LABEL[doc.type]}</span>
            <span className="ml-auto text-[12px] text-mute">
              {fmtDate(doc.uploadedAt)} · {doc.status}
            </span>
          </a>
        ))
      ) : (
        <Empty title="No documents" />
      )}
    </KCard>
  );
}

/* ---------- §L checklist + KYC decision ---------- */

const LABEL: Record<string, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  partial: "Partial",
  approved: "Approved",
  clarification: "Clarification",
  no: "No",
  yes: "Yes",
};

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-medium text-ink">{label}</div>
      <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "flex-1 h-8 rounded-md text-[12px] transition-colors",
              value === o
                ? o === "rejected"
                  ? "bg-destructive text-white font-semibold"
                  : "bg-card text-ink font-semibold shadow-sm"
                : "text-mute hover:text-ink",
            )}
          >
            {LABEL[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}

const fromSaved = (r: VendorReview | null): VendorReviewInput => ({
  identity: r?.identity ?? "pending",
  ownership: r?.ownership ?? "pending",
  assets: r?.assets ?? "pending",
  permission: r?.permission ?? "pending",
  rateCard: r?.rateCard ?? "pending",
  siteVisitRequired: r?.siteVisitRequired ?? false,
  territoryNote: r?.territoryNote ?? "",
  remarks: r?.remarks ?? "",
  nextReviewDate: r?.nextReviewDate ?? null,
  ...(r?.reason ? { reason: r.reason } : {}),
});

function ReviewForm({ v }: { v: AdminVendorDetail }) {
  const save = useSaveVendorReview(v.vendorId);
  const decide = useKycDecision();
  const [f, setF] = useState<VendorReviewInput>(() => fromSaved(v.review));
  const [error, setError] = useState<string>();
  const set = <K extends keyof VendorReviewInput>(k: K, x: VendorReviewInput[K]) =>
    setF((cur) => ({ ...cur, [k]: x }));

  const rejected = reviewHasRejection(f);
  const missingDocs = v.documents.length === 0;
  const canApprove = v.kycStatus === "pending" && !rejected;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const p = vendorReviewInput.safeParse({
      ...f,
      ...(f.reason?.trim() ? { reason: f.reason.trim() } : { reason: undefined }),
    });
    if (!p.success) return setError(p.error.issues[0]?.message ?? "Check the form");
    save.mutate(p.data, {
      onSuccess: () => toast.success("Review saved"),
      onError: (err) => setError(err.message),
    });
    return undefined;
  }

  async function decideKyc(decision: "approve" | "reject") {
    let reason: string | undefined;
    if (decision === "reject") {
      const r = await ask({
        title: `Reject ${v.legalName}`,
        action: "Reject",
        danger: true,
        body: "The vendor sees this reason.",
      });
      if (!r) return;
      reason = r.reason;
    }
    decide.mutate(
      { id: v.vendorId, decision, ...(reason ? { reason } : {}) },
      {
        onSuccess: (r) => toast.success(`KYC ${r.kycStatus}`),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <>
      {v.kycStatus === "pending" && (
        <KCard title="KYC decision">
          <div className="space-y-3">
            {rejected && (
              <p className="text-[12px] text-destructive">
                An item is rejected. Approve stays off until it is fixed.
              </p>
            )}
            {missingDocs && <p className="text-[12px] text-hold">No documents uploaded</p>}
            <div className="flex gap-2">
              <Btn
                variant="secondary"
                className="flex-1"
                disabled={decide.isPending}
                onClick={() => void decideKyc("reject")}
              >
                Reject
              </Btn>
              <Btn
                className="flex-1"
                disabled={!canApprove || decide.isPending}
                onClick={() => void decideKyc("approve")}
              >
                Approve
              </Btn>
            </div>
          </div>
        </KCard>
      )}
      <KCard title="Review">
        <form onSubmit={submit} className="space-y-4">
          <Segmented
            label="Identity"
            options={REVIEW_CHECKS}
            value={f.identity}
            onChange={(x) => set("identity", x)}
          />
          <Segmented
            label="Ownership / authorisation"
            options={REVIEW_CHECKS}
            value={f.ownership}
            onChange={(x) => set("ownership", x)}
          />
          <Segmented
            label="Assets"
            options={ASSET_REVIEW}
            value={f.assets}
            onChange={(x) => set("assets", x)}
          />
          <Segmented
            label="Permissions"
            options={REVIEW_CHECKS}
            value={f.permission}
            onChange={(x) => set("permission", x)}
          />
          <Segmented
            label="Rate card"
            options={RATE_CARD_REVIEW}
            value={f.rateCard}
            onChange={(x) => set("rateCard", x)}
          />
          <Segmented
            label="Site visit"
            options={["no", "yes"] as const}
            value={f.siteVisitRequired ? "yes" : "no"}
            onChange={(x) => set("siteVisitRequired", x === "yes")}
          />
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-ink">Territory note</span>
            <Input
              value={f.territoryNote}
              maxLength={500}
              onChange={(e) => set("territoryNote", e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-ink">Remarks</span>
            <Textarea
              rows={3}
              value={f.remarks}
              maxLength={2000}
              onChange={(e) => set("remarks", e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-ink">Next review</span>
            <Input
              type="date"
              value={f.nextReviewDate ?? ""}
              onChange={(e) => set("nextReviewDate", e.target.value || null)}
            />
          </label>
          {rejected && (
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-ink">Reason (rejected item)</span>
              <Textarea
                rows={2}
                value={f.reason ?? ""}
                maxLength={1000}
                onChange={(e) => set("reason", e.target.value)}
              />
            </label>
          )}
          <FormError message={error} />
          <Btn type="submit" variant="secondary" className="w-full" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save review"}
          </Btn>
          {v.review && (
            <div className="text-[12px] text-mute">Saved {fmtDate(v.review.reviewedAt)}</div>
          )}
        </form>
      </KCard>
    </>
  );
}
