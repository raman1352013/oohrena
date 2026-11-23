import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import {
  DEFAULT_SERVICE_FEE_PCT,
  PRICING_UNIT_LABEL,
  WO_STATUS_LABEL,
  cancellationFor,
  computeQuoteTotals,
  defaultBillableUnits,
  todayIST,
  type PricingUnit,
  type WorkOrderStatus,
} from "@oohrena/shared";
import { ApiError } from "@/lib/api";
import { fmtDate, inr } from "@/lib/format";
import {
  useLeadActions,
  useLeadDetail,
  type LeadDetail,
  type QuoteItemInput,
  type QuoteView,
} from "@/lib/deals-api";
import { Btn, Empty, KCard, Loading, Pill, Row } from "@/components/app/kit";
import { ask } from "@/components/app/ask";
import { QuoteBreakdown, QuotePill } from "@/components/app/QuoteBreakdown";
import { Field } from "@/components/app/AuthShell";
import { Textarea } from "@/components/ui/textarea";
import { AdminPaymentStatus } from "@/components/app/FinanceCards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/leads/$leadId")({
  head: ({ params }) => ({ meta: [{ title: `${params.leadId} — OOHRENA` }] }),
  component: LeadPage,
});

const errMsg = (e: Error) => {
  const p =
    e instanceof ApiError
      ? (e.details as { problems?: string[] } | undefined)?.problems
      : undefined;
  return p?.length ? `${e.message}: ${p.join("; ")}` : e.message;
};
const LEAD_TONE: Record<string, "neutral" | "hold" | "saffron" | "verified" | "danger"> = {
  new: "saffron",
  under_review: "hold",
  assigned: "hold",
  quoted: "saffron",
  won: "verified",
  lost: "danger",
  closed: "neutral",
};

function LeadPage() {
  const { leadId } = Route.useParams();
  const lead = useLeadDetail(leadId);
  if (lead.isPending) return <Loading />;
  if (lead.isError)
    return (
      <div className="p-16 text-center text-[13px]">
        <div className="text-destructive">{lead.error.message}</div>
        <Link to="/admin" className="text-saffron-deep">
          Inbox
        </Link>
      </div>
    );
  return <LeadWorkspace l={lead.data} />;
}

function LeadWorkspace({ l }: { l: LeadDetail }) {
  const act = useLeadActions(l.leadId);
  const latest = l.quotes[0];
  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((e: Error) => toast.error(errMsg(e)));
  const close = async (status: "lost" | "closed") => {
    const r = await ask({
      title: status === "lost" ? "Mark as lost" : "Close lead",
      action: status === "lost" ? "Mark lost" : "Close",
      danger: true,
    });
    if (r) void run(act.status.mutateAsync({ status, reason: r.reason }), `Lead marked ${status}`);
  };

  return (
    <div className="max-w-[1216px] mx-auto p-4 md:p-8 space-y-5">
      <Link to="/admin" className="text-[13px] text-mute flex items-center gap-1 hover:text-ink">
        <ArrowLeft size={14} />
        Inbox
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-72">
          <h1 className="text-[22px] font-semibold font-mono">{l.leadId}</h1>
          <p className="text-[13px] mt-1">{l.requirement}</p>
        </div>
        <Pill className="text-[13px]">{l.source.replace("_", " ")}</Pill>
        <Pill tone={LEAD_TONE[l.status] ?? "neutral"} className="text-[13px]">
          {l.status.replace("_", " ")}
        </Pill>
        {l.status === "new" && (
          <Btn
            variant="dark"
            className="h-9"
            onClick={() =>
              void run(act.status.mutateAsync({ status: "under_review" }), "Marked under review")
            }
          >
            Start review
          </Btn>
        )}
        {!["won", "lost", "closed"].includes(l.status) && (
          <>
            <Btn variant="secondary" className="h-9" onClick={() => close("lost")}>
              Mark lost
            </Btn>
            <Btn variant="ghost" className="h-9" onClick={() => close("closed")}>
              Close
            </Btn>
          </>
        )}
      </div>
      {l.possibleDuplicates.length > 0 && (
        <div className="rounded-lg border border-hold/40 bg-hold-soft px-4 py-2.5 text-[13px] flex items-center gap-2">
          <AlertTriangle size={15} className="text-hold" />
          Possible duplicate of{" "}
          {l.possibleDuplicates.map((d) => (
            <Link
              key={d}
              to="/admin/leads/$leadId"
              params={{ leadId: d }}
              className="font-mono underline"
            >
              {d}
            </Link>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <KCard title="Client">
          <Row k="Company" v={l.client?.companyName ?? l.contact?.company ?? "—"} />
          <Row k="Contact" v={l.contact?.name ?? "—"} />
          <Row k="Email" v={l.contact?.email ?? "—"} />
          <Row k="Mobile" v={l.contact?.mobile ?? "—"} />
          <Row k="GSTIN" v={l.client?.gstin ?? "—"} />
        </KCard>
        <KCard title="Requirement">
          <Row k="Dates" v={`${l.from} → ${l.to}`} />
          <Row k="Quantity" v={l.qty} />
          <Row k="Budget" v={l.budget ? inr(l.budget) : "—"} />
          <Row k="City" v={l.city ?? l.items[0]?.city ?? "—"} />
        </KCard>
        <AssignCard l={l} />
      </div>

      <KCard title="Requested media" bodyClass="divide-y divide-line">
        {l.items.length ? (
          l.items.map((i) => {
            const v = l.vendors.find((x) => x.vendorId === i.vendorId);
            return (
              <div
                key={i.inventoryId}
                className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]"
              >
                <span className="font-mono text-[12px]">{i.inventoryId}</span>
                <span className="font-semibold flex-1 min-w-48">
                  {i.title}
                  <span className="text-mute font-normal">
                    {" "}
                    · {i.locality}, {i.city}
                  </span>
                </span>
                <span>
                  Client {i.indicativePrice ? inr(i.indicativePrice) : "—"} · vendor{" "}
                  {inr(i.vendorRate)} {PRICING_UNIT_LABEL[i.pricingUnit]}
                </span>
                <span className="text-mute">
                  {v?.legalName} ({v?.kycStatus})
                </span>
                <Pill tone={i.availabilityMode === "managed" ? "verified" : "hold"}>
                  {i.availabilityMode === "managed" ? "Live calendar" : "Needs vendor confirmation"}
                </Pill>
              </div>
            );
          })
        ) : (
          <Empty title="No specific media chosen" />
        )}
      </KCard>

      <QuoteSection l={l} latest={latest} />
      {l.booking ? (
        <BookingSection l={l} />
      ) : (
        latest?.status === "approved" && (
          <KCard title="Booking">
            <p className="text-[13px] mb-3">
              The client approved <b className="font-mono">{latest.quoteId}</b> ({inr(latest.total)}
              ). Creating the booking turns the hold into booked dates.
            </p>
            <Btn
              onClick={() => void run(act.book.mutateAsync(latest.quoteId), "Booking created")}
              disabled={act.book.isPending}
            >
              Create booking
            </Btn>
          </KCard>
        )
      )}
    </div>
  );
}

function AssignCard({ l }: { l: LeadDetail }) {
  const act = useLeadActions(l.leadId);
  const [vid, setVid] = useState("");
  const active = l.assignments.filter((a) => a.status === "active");
  const suggestions = l.vendors.filter((v) => !active.some((a) => a.vendorId === v.vendorId));
  const assign = (vendorId: string) =>
    act.assign
      .mutateAsync({ vendorId })
      .then(() => {
        toast.success(`Assigned ${vendorId}`);
        setVid("");
      })
      .catch((e: Error) => toast.error(e.message));
  const open = !["won", "lost", "closed"].includes(l.status);
  return (
    <KCard title="Vendor assignment">
      <div className="space-y-2 text-[13px]">
        {active.length ? (
          active.map((a) => {
            const v = l.vendors.find((x) => x.vendorId === a.vendorId);
            return (
              <div key={a.vendorId} className="flex items-center gap-2">
                <Pill tone="verified">Assigned</Pill>
                <span className="flex-1">
                  {v?.legalName ?? a.vendorId}{" "}
                  <span className="font-mono text-[11px] text-mute">{a.vendorId}</span>
                </span>
                {open && (
                  <button
                    className="text-[12px] text-mute hover:text-destructive"
                    onClick={() =>
                      act.unassign
                        .mutateAsync(a.vendorId)
                        .then(() => toast("Assignment removed"))
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-mute">No vendor assigned</p>
        )}
        {open &&
          suggestions.map((v) => (
            <Btn
              key={v.vendorId}
              variant={v.kycStatus === "approved" ? "dark" : "secondary"}
              className="h-8 px-3 text-[12px] w-full"
              onClick={() => void assign(v.vendorId)}
            >
              Assign {v.legalName}
              {v.kycStatus !== "approved" ? ` (KYC ${v.kycStatus})` : ""}
            </Btn>
          ))}
        {open && (
          <div className="flex gap-2 pt-1">
            <input
              value={vid}
              onChange={(e) => setVid(e.target.value.toUpperCase())}
              placeholder="Vendor ID"
              aria-label="Vendor ID"
              className="flex-1 h-8 rounded-md border border-line px-2 text-[12px]"
            />
            <Btn
              variant="secondary"
              className="h-8 px-3 text-[12px]"
              disabled={!vid}
              onClick={() => void assign(vid)}
            >
              Assign
            </Btn>
          </div>
        )}
        {l.assignments.some((a) => a.status === "removed") && (
          <p className="text-[11px] text-mute">
            History:{" "}
            {l.assignments
              .map((a) => `${a.vendorId} ${a.status} ${fmtDate(a.assignedAt)}`)
              .join(" · ")}
          </p>
        )}
      </div>
    </KCard>
  );
}

type Line = {
  inventoryId: string;
  title: string;
  pricingUnit: PricingUnit;
  attrs: Record<string, unknown>;
  from: string;
  to: string;
  qty: string;
  rate: string;
  billableUnits: string;
  production: string;
  installation: string;
  vendorCost: string;
};

function linesFrom(l: LeadDetail, q?: QuoteView): Line[] {
  if (q)
    return q.items.map((i) => ({
      inventoryId: i.inventoryId,
      title: i.title,
      pricingUnit: i.pricingUnit,
      attrs: l.items.find((x) => x.inventoryId === i.inventoryId)?.attributes ?? {},
      from: i.from,
      to: i.to,
      qty: String(i.qty),
      rate: String(i.rate),
      billableUnits: String(i.billableUnits),
      production: String(i.production),
      installation: String(i.installation),
      vendorCost: String(i.vendorCost ?? ""),
    }));
  return l.items.map((i) => {
    const bu = defaultBillableUnits(i.pricingUnit, l.from, l.to, i.attributes);
    return {
      inventoryId: i.inventoryId,
      title: i.title,
      pricingUnit: i.pricingUnit,
      attrs: i.attributes,
      from: l.from,
      to: l.to,
      qty: String(l.qty),
      rate: String(i.indicativePrice ?? ""),
      billableUnits: String(bu),
      production: "0",
      installation: "0",
      vendorCost: String(Math.round(i.vendorRate * l.qty * bu)),
    };
  });
}

function QuoteSection({ l, latest }: { l: LeadDetail; latest: QuoteView | undefined }) {
  const act = useLeadActions(l.leadId);
  const draft = latest?.status === "draft" ? latest : undefined;
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<string | undefined>(latest?.quoteId);
  useEffect(() => setView(latest?.quoteId), [latest?.quoteId]);
  const shown = l.quotes.find((q) => q.quoteId === view) ?? latest;
  const canStart =
    !latest && ["under_review", "assigned", "quoted"].includes(l.status) && l.items.length > 0;
  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((e: Error) => toast.error(errMsg(e)));

  if (editing) return <QuoteEditor l={l} draft={draft} onDone={() => setEditing(false)} />;
  return (
    <KCard title="Quotation" right={shown && <QuotePill status={shown.status} />}>
      {!latest ? (
        canStart ? (
          <div className="text-[13px] space-y-3">
            <Btn onClick={() => setEditing(true)}>Build quotation</Btn>
          </div>
        ) : (
          <Empty title={l.status === "new" ? "No quotation" : "No media to quote"} />
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {l.quotes
              .slice()
              .reverse()
              .map((q) => (
                <button
                  key={q.quoteId}
                  onClick={() => setView(q.quoteId)}
                  className={cn(
                    "h-8 px-3 rounded-md border font-mono",
                    q.quoteId === shown?.quoteId
                      ? "bg-navy text-navy-foreground border-navy"
                      : "border-line bg-card",
                  )}
                >
                  V{q.version} · {q.status.replace("_", " ")}
                </button>
              ))}
            <span className="ml-auto font-mono text-mute">{shown?.quoteId}</span>
          </div>
          {shown && <QuoteBreakdown q={shown} showCost />}
          {shown?.decisionComment && (
            <p className="text-[13px] rounded-lg bg-muted px-3 py-2">
              Client{" "}
              {shown.decision === "revise"
                ? "asked for a revision"
                : shown.decision === "reject"
                  ? "rejected"
                  : "approved"}
              {shown.decidedAt ? ` on ${fmtDate(shown.decidedAt)}` : ""}: “{shown.decisionComment}”
            </p>
          )}
          {shown?.quoteId === latest.quoteId && (
            <div className="flex flex-wrap gap-2">
              {latest.status === "draft" && (
                <>
                  <Btn variant="secondary" className="h-9" onClick={() => setEditing(true)}>
                    Edit draft
                  </Btn>
                  <Btn
                    className="h-9"
                    disabled={act.release.isPending}
                    onClick={() =>
                      void run(
                        act.release.mutateAsync(latest.quoteId),
                        "Released to client · dates held for 48 h",
                      )
                    }
                  >
                    Approve pricing & release to client
                  </Btn>
                </>
              )}
              {["released", "revision_requested", "rejected", "expired"].includes(
                latest.status,
              ) && (
                <Btn
                  variant="secondary"
                  className="h-9"
                  onClick={() =>
                    void run(act.revise.mutateAsync(latest.quoteId), "New version created")
                  }
                >
                  Create revision (V{latest.version + 1})
                </Btn>
              )}
              {latest.status === "expired" && (
                <Btn
                  variant="ghost"
                  className="h-9"
                  onClick={async () => {
                    const r = await ask({
                      title: `Extend ${latest.quoteId}`,
                      action: "Extend",
                      date: { label: "Valid until", min: todayIST() },
                      body: "Overrides are logged permanently.",
                    });
                    if (!r) return;
                    const { date: to, reason } = r;
                    void run(
                      act.override.mutateAsync({
                        entity: "quote",
                        entityId: latest.quoteId,
                        field: "validUntil",
                        newValue: to,
                        reason,
                      }),
                      "Validity extended (override logged)",
                    );
                  }}
                >
                  Extend validity (override)
                </Btn>
              )}
            </div>
          )}
        </div>
      )}
    </KCard>
  );
}

function QuoteEditor({
  l,
  draft,
  onDone,
}: {
  l: LeadDetail;
  draft: QuoteView | undefined;
  onDone: () => void;
}) {
  const act = useLeadActions(l.leadId);
  const [lines, setLines] = useState<Line[]>(() => linesFrom(l, draft));
  const [fee, setFee] = useState(String(draft?.serviceFeePct ?? DEFAULT_SERVICE_FEE_PCT));
  const [validUntil, setValidUntil] = useState(draft?.validUntil ?? "");
  const [terms, setTerms] = useState(draft?.terms ?? "");
  const [err, setErr] = useState<string>();
  const n = (s: string) => Number(s) || 0;
  const preview = useMemo(
    () =>
      computeQuoteTotals(
        lines.map((x) => ({
          rate: n(x.rate),
          qty: n(x.qty),
          billableUnits: n(x.billableUnits),
          production: n(x.production),
          installation: n(x.installation),
        })),
        n(fee),
      ),
    [lines, fee],
  );
  const set = (i: number, k: keyof Line, v: string) =>
    setLines(
      lines.map((x, j) => {
        if (j !== i) return x;
        const next = { ...x, [k]: v };
        if (k === "from" || k === "to")
          next.billableUnits = String(
            defaultBillableUnits(x.pricingUnit, next.from, next.to, x.attrs),
          );
        return next;
      }),
    );
  const items: QuoteItemInput[] = lines.map((x) => ({
    inventoryId: x.inventoryId,
    from: x.from,
    to: x.to,
    qty: n(x.qty),
    rate: n(x.rate),
    billableUnits: n(x.billableUnits),
    production: n(x.production),
    installation: n(x.installation),
    ...(x.vendorCost ? { vendorCost: n(x.vendorCost) } : {}),
  }));
  const body = {
    items,
    serviceFeePct: n(fee),
    ...(validUntil ? { validUntil } : {}),
    ...(terms.trim() ? { terms: terms.trim() } : {}),
  };
  const save = () => {
    setErr(undefined);
    const p = draft
      ? act.updateQuote.mutateAsync({ id: draft.quoteId, ...body })
      : act.createQuote.mutateAsync(body);
    p.then(() => {
      toast.success("Draft saved — totals computed by the server");
      onDone();
    }).catch((e: Error) => setErr(errMsg(e)));
  };
  const cell = "h-9 w-full rounded-md border border-line bg-card px-2 text-[12px]";
  return (
    <KCard
      title={draft ? `Edit ${draft.quoteId}` : "New quotation"}
      right={
        <Btn variant="ghost" className="h-8" onClick={onDone}>
          Cancel
        </Btn>
      }
    >
      <div className="space-y-4 text-[13px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="text-left text-[11px] text-mute">
                {[
                  "Media",
                  "From",
                  "To",
                  "Qty",
                  "Client rate",
                  "Billable units",
                  "Production ₹",
                  "Installation ₹",
                  "Vendor cost ₹",
                  "Line",
                ].map((h) => (
                  <th key={h} className="font-normal pb-1 pr-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((x, i) => (
                <tr key={x.inventoryId} className="align-top">
                  <td className="pr-2 py-1 w-56">
                    <div className="font-medium text-[12px]">{x.title}</div>
                    <div className="text-[11px] text-mute">{PRICING_UNIT_LABEL[x.pricingUnit]}</div>
                  </td>
                  {(["from", "to"] as const).map((k) => (
                    <td key={k} className="pr-2 py-1">
                      <input
                        type="date"
                        className={cell}
                        value={x[k]}
                        min={todayIST()}
                        onChange={(e) => set(i, k, e.target.value)}
                      />
                    </td>
                  ))}
                  {(
                    [
                      "qty",
                      "rate",
                      "billableUnits",
                      "production",
                      "installation",
                      "vendorCost",
                    ] as const
                  ).map((k) => (
                    <td key={k} className="pr-2 py-1">
                      <input
                        inputMode="decimal"
                        className={cell}
                        value={x[k]}
                        onChange={(e) => set(i, k, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="py-1 font-semibold whitespace-nowrap">
                    {inr(preview.items[i]?.lineTotal ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field
            id="fee"
            label="Platform / service fee %"
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
          <Field
            id="valid"
            label="Valid until (default 7 days)"
            type="date"
            min={todayIST()}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
          <div className="rounded-lg bg-muted p-3 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-mute">Subtotal</span>
              <span>{inr(preview.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mute">Fee</span>
              <span>{inr(preview.serviceFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mute">GST 18%</span>
              <span>{inr(preview.gst)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{inr(preview.total)}</span>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="terms" className="font-medium">
            Terms for the client
          </label>
          <Textarea id="terms" rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} />
        </div>
        {err && <p className="text-destructive text-[12px]">{err}</p>}
        <div className="flex gap-2">
          <Btn onClick={save} disabled={act.createQuote.isPending || act.updateQuote.isPending}>
            Save draft
          </Btn>
        </div>
      </div>
    </KCard>
  );
}

function BookingSection({ l }: { l: LeadDetail }) {
  const act = useLeadActions(l.leadId);
  const b = l.booking!;
  const [instructions, setInstructions] = useState("");
  const vendorsWithoutWO = [...new Set(b.items.map((i) => i.vendorId))].filter(
    (v) => !l.workOrders.some((w) => w.vendorId === v),
  );
  const fee = cancellationFor(b.total, b.start, todayIST());
  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((e: Error) => toast.error(errMsg(e)));
  return (
    <KCard
      title={
        <span className="flex items-center gap-2">
          Booking <span className="font-mono">{b.bookingId}</span>
        </span>
      }
      right={<Pill tone={b.status === "cancelled" ? "danger" : "verified"}>{b.status}</Pill>}
    >
      <div className="space-y-4 text-[13px]">
        <div className="grid sm:grid-cols-4 gap-3">
          <Row k="Campaign" v={`${b.start} → ${b.end}`} />
          <Row k="Total" v={inr(b.total)} />
          <Row k="From quote" v={<span className="font-mono">{b.quoteId}</span>} />
          <Row k="Created" v={fmtDate(b.createdAt)} />
        </div>
        <AdminPaymentStatus bookingId={b.bookingId} />
        {b.cancellation && (
          <p className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
            Cancelled {fmtDate(b.cancellation.at)}: {b.cancellation.reason}. {b.cancellation.rule} →
            fee {inr(b.cancellation.fee)}, refundable {inr(b.cancellation.refundable)}.
          </p>
        )}
        <div>
          <div className="font-semibold mb-2">Work orders</div>
          {l.workOrders.length ? (
            l.workOrders.map((w) => (
              <div
                key={w.workOrderId}
                className="flex flex-wrap gap-3 items-center border border-line rounded-lg px-3 py-2 mb-2"
              >
                <span className="font-mono text-[12px]">{w.workOrderId}</span>
                <span className="text-mute">{w.vendorId}</span>
                <Pill>{WO_STATUS_LABEL[w.status as WorkOrderStatus] ?? w.status}</Pill>
                <span className="text-[12px] text-mute">
                  {w.acknowledgedAt
                    ? `Acknowledged ${fmtDate(w.acknowledgedAt)}`
                    : "Not yet acknowledged by vendor"}
                </span>
              </div>
            ))
          ) : (
            <Empty title="No work orders" />
          )}
          {b.status === "confirmed" && vendorsWithoutWO.length > 0 && (
            <div className="space-y-2">
              <Textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Instructions"
                aria-label="Instructions"
              />
              <Btn
                variant="dark"
                className="h-9"
                disabled={instructions.trim().length < 5 || act.workOrder.isPending}
                onClick={() =>
                  void run(
                    act.workOrder
                      .mutateAsync({ bookingId: b.bookingId, instructions: instructions.trim() })
                      .then(() => setInstructions("")),
                    "Work order issued to vendor",
                  )
                }
              >
                Issue work order
                {vendorsWithoutWO.length > 1 ? `s (${vendorsWithoutWO.length} vendors)` : ""}
              </Btn>
            </div>
          )}
        </div>
        {b.status === "confirmed" && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Btn
              variant="secondary"
              className="h-9"
              onClick={async () => {
                const r = await ask({
                  title: `Reschedule ${b.bookingId}`,
                  action: "Reschedule",
                  date: { label: "New start", min: todayIST(), value: b.start },
                });
                if (!r) return;
                const { date: newFrom, reason } = r;
                void run(
                  act.reschedule.mutateAsync({ bookingId: b.bookingId, newFrom, reason }),
                  "Rescheduled",
                );
              }}
            >
              Reschedule
            </Btn>
            <Btn
              variant="ghost"
              className="h-9 text-destructive"
              onClick={async () => {
                const r = await ask({
                  title: `Cancel ${b.bookingId}`,
                  action: "Cancel booking",
                  danger: true,
                  body: (
                    <>
                      {fee.rule} · Fee {inr(fee.fee)} · Refundable {inr(fee.refundable)}
                    </>
                  ),
                });
                if (r)
                  void run(
                    act.cancel.mutateAsync({ bookingId: b.bookingId, reason: r.reason }),
                    "Booking cancelled",
                  );
              }}
            >
              Cancel booking
            </Btn>
          </div>
        )}
        {b.history && (
          <p className="text-[11px] text-mute">
            History: {b.history.map((h) => `${h.toStatus} ${fmtDate(h.at)}`).join(" · ")}
          </p>
        )}
      </div>
    </KCard>
  );
}
