import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Eye, ShieldCheck } from "lucide-react";
import { MAX_DOC_BYTES, PAYMENT_MODES, todayIST, type PaymentStatus } from "@oohrena/shared";
import { assetUrl } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { fmtDate, inr, selectCls } from "@/lib/format";
import {
  fetchVendorBank,
  useFinanceActions,
  useFinanceBookings,
  useFinanceOverview,
  usePayables,
  usePaymentHistory,
  usePayments,
  useReconciliation,
  type FinanceBooking,
  type PayableRow,
} from "@/lib/finance-api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Btn, Empty, Eyebrow, KCard, Pill, Row } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finance & Reconciliation — OOHRENA" },
      {
        name: "description",
        content:
          "Invoices, maker-checker payment verification, vendor payables, refunds and booking-wise reconciliation.",
      },
    ],
  }),
  component: FinancePage,
});

type Tab = "queue" | "bookings" | "payables" | "all";
const PAY_TONE: Record<PaymentStatus, "hold" | "verified" | "danger"> = {
  unverified: "hold",
  verified: "verified",
  rejected: "danger",
};

function FinancePage() {
  const ov = useFinanceOverview();
  const [tab, setTab] = useState<Tab>("queue");
  const o = ov.data;
  const kpis = [
    ["Payments to verify", o?.toVerify],
    ["Bookings without invoice", o?.uninvoicedBookings],
    ["Open invoices", o?.invoicesOpen],
    ["Overdue invoices", o?.overdueInvoices],
    ["Vendor payables due", o?.payablesDue],
    ["Cancelled bookings to refund", o?.refundsPending],
  ] as const;
  return (
    <main className="max-w-[1280px] mx-auto p-4 md:p-6 space-y-5">
      <div>
        <Eyebrow>Finance / Audit</Eyebrow>
        <h1 className="text-[22px] font-semibold">Payments & reconciliation</h1>
        <p className="text-[13px] text-mute mt-1">
          Every payment needs evidence and a second person to verify it. Nothing is marked received
          automatically, and nothing is ever deleted.
        </p>
      </div>
      <div className="bg-card border border-line rounded-xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-line overflow-hidden">
        {kpis.map(([k, v]) => (
          <div key={k} className="p-4 border-b lg:border-b-0 border-line">
            <div className="text-[12px] text-mute">{k}</div>
            <div className="text-2xl font-bold mt-2">{v ?? "—"}</div>
          </div>
        ))}
      </div>
      <nav className="flex gap-6 border-b border-line text-[13px] overflow-x-auto">
        {(
          [
            ["queue", "Verification queue"],
            ["bookings", "Bookings"],
            ["payables", "Vendor payables"],
            ["all", "All payments"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "pt-1 pb-2.5 border-b-2 whitespace-nowrap",
              tab === id ? "border-navy text-ink font-semibold" : "border-transparent text-mute",
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "queue" && <PaymentList status="unverified" />}
      {tab === "bookings" && <Bookings />}
      {tab === "payables" && <Payables />}
      {tab === "all" && <PaymentList />}
    </main>
  );
}

function PaymentList({ status }: { status?: PaymentStatus }) {
  const list = usePayments(status);
  const act = useFinanceActions();
  const { data: me } = useSession();
  const [hist, setHist] = useState<string>();
  const decide = (id: string, decision: "verify" | "reject") => {
    const reason =
      decision === "reject"
        ? (prompt("Why is this entry wrong? (the maker sees this)") ?? "").trim()
        : undefined;
    if (decision === "reject" && (!reason || reason.length < 3))
      return toast.error("A reason is required to reject");
    act.decide.mutate(
      { id, decision, ...(reason ? { reason } : {}) },
      {
        onSuccess: () =>
          toast.success(decision === "verify" ? "Verified — counted as received/paid" : "Rejected"),
        onError: (e) => toast.error(e.message),
      },
    );
    return undefined;
  };
  return (
    <KCard
      title={status === "unverified" ? "Waiting for a checker" : "All payments"}
      bodyClass="divide-y divide-line"
    >
      {list.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Loading…</div>
      ) : !list.data?.length ? (
        <Empty
          title={status ? "Nothing to verify" : "No payments yet"}
          hint="Recorded payments wait here until a different Finance user checks the evidence."
        />
      ) : (
        list.data.map((p) => {
          const own = p.recordedBy === me?.userId;
          return (
            <div
              key={p.paymentId}
              className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]"
            >
              <span className="font-mono text-[12px] w-36">{p.paymentId}</span>
              <div className="flex-1 min-w-60">
                <div className="font-semibold">
                  {p.label} · {inr(p.amount)}{" "}
                  <span className="font-normal text-mute">
                    {p.mode?.toUpperCase()} {p.reference} · {p.paidOn}
                  </span>
                </div>
                <div className="text-[12px] text-mute">
                  {p.bookingId}
                  {p.vendorId ? ` · ${p.vendorId}` : ""}
                  {p.invoiceId ? ` · ${p.invoiceId}` : ""} · recorded by {p.recordedByRole}{" "}
                  {p.recordedBy}
                  {p.verifiedBy ? ` · checked by ${p.verifiedBy}` : ""}
                </div>
                {p.ruleApplied && (
                  <div className="text-[12px] text-mute">Rule: {p.ruleApplied}</div>
                )}
                {p.rejectReason && (
                  <div className="text-[12px] text-destructive">Rejected: {p.rejectReason}</div>
                )}
              </div>
              <a
                href={assetUrl(`/api/v1/finance/payments/${p.paymentId}/proof`)}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-saffron-deep font-semibold flex items-center gap-1"
              >
                <Eye size={13} />
                Evidence
              </a>
              <button
                className="text-[12px] text-mute hover:text-ink"
                onClick={() => setHist(p.paymentId)}
              >
                History
              </button>
              <Pill tone={PAY_TONE[p.status]}>{p.status}</Pill>
              {p.status === "unverified" &&
                (own ? (
                  <span className="text-[11px] text-mute w-40">
                    You recorded this — another Finance user must verify it.
                  </span>
                ) : (
                  <>
                    <Btn
                      variant="secondary"
                      className="h-8 px-3 text-[12px]"
                      onClick={() => decide(p.paymentId, "reject")}
                    >
                      Reject
                    </Btn>
                    <Btn
                      variant="dark"
                      className="h-8 px-3 text-[12px]"
                      onClick={() => decide(p.paymentId, "verify")}
                    >
                      <ShieldCheck size={13} />
                      Verify
                    </Btn>
                  </>
                ))}
            </div>
          );
        })
      )}
      <HistoryDialog id={hist} onClose={() => setHist(undefined)} />
    </KCard>
  );
}

function HistoryDialog({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const h = usePaymentHistory(id);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Payment history <span className="font-mono text-[13px]">{id}</span>
          </DialogTitle>
        </DialogHeader>
        {!h.data?.length ? (
          <Empty title="No changes recorded" />
        ) : (
          <table className="w-full text-[12px]">
            <tbody>
              {h.data.map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(r.at)}</td>
                  <td className="py-2 pr-2 font-mono">{r.field}</td>
                  <td className="py-2 pr-2 text-mute">{String(r.old ?? "—")}</td>
                  <td className="py-2 pr-2">{String(r.new ?? "—")}</td>
                  <td className="py-2 pr-2 font-mono text-mute">{r.changedBy}</td>
                  <td className="py-2">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Rec = {
  kind: "payments" | "vendor-payments" | "refunds";
  booking: FinanceBooking;
  vendorId?: string;
  suggested?: number;
};

function Bookings() {
  const list = useFinanceBookings();
  const act = useFinanceActions();
  const [rec, setRec] = useState<Rec>();
  const [view, setView] = useState<string>();
  return (
    <KCard title="Bookings — money position" bodyClass="divide-y divide-line">
      {list.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Loading…</div>
      ) : !list.data?.length ? (
        <Empty title="No bookings yet" />
      ) : (
        list.data.map((b) => (
          <div key={b.bookingId} className="px-5 py-3 space-y-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[12px] w-36">{b.bookingId}</span>
              <Pill>{b.status}</Pill>
              <span className="text-mute">
                {b.start} → {b.end}
              </span>
              <span className="font-semibold">{inr(b.total)}</span>
              {b.invoiceId ? (
                <Pill tone={b.invoiceStatus === "paid" ? "verified" : "hold"}>
                  {b.invoiceId} · {b.invoiceStatus?.replace("_", " ")}
                </Pill>
              ) : (
                <Pill tone="danger">No invoice</Pill>
              )}
              {!b.checksOk && <Pill tone="danger">Check reconciliation</Pill>}
              <span className="ml-auto flex flex-wrap gap-2">
                {!b.invoiceId && b.status !== "cancelled" && (
                  <Btn
                    variant="dark"
                    className="h-8 px-3 text-[12px]"
                    disabled={act.invoice.isPending}
                    onClick={() =>
                      act.invoice.mutate(
                        { bookingId: b.bookingId, advancePct: 50 },
                        {
                          onSuccess: (i) =>
                            toast.success(
                              `Invoice ${i.invoiceId} raised · advance ${inr(i.advanceAmount)}`,
                            ),
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                  >
                    Raise invoice
                  </Btn>
                )}
                {b.invoiceId && b.client.balanceDue > 0 && b.status !== "cancelled" && (
                  <Btn
                    variant="secondary"
                    className="h-8 px-3 text-[12px]"
                    onClick={() =>
                      setRec({
                        kind: "payments",
                        booking: b,
                        suggested:
                          b.client.received === 0 && b.client.advanceDue > 0
                            ? b.client.advanceDue
                            : b.client.balanceDue,
                      })
                    }
                  >
                    Record client payment
                  </Btn>
                )}
                {b.status === "cancelled" && b.client.received > b.client.refunded && (
                  <Btn
                    variant="secondary"
                    className="h-8 px-3 text-[12px]"
                    onClick={() => setRec({ kind: "refunds", booking: b })}
                  >
                    Record refund
                  </Btn>
                )}
                <Btn
                  variant="ghost"
                  className="h-8 px-3 text-[12px]"
                  onClick={() => setView(b.bookingId)}
                >
                  Reconciliation
                </Btn>
              </span>
            </div>
            <div className="text-[12px] text-mute flex flex-wrap gap-x-4">
              <span>Billed {inr(b.client.billed)}</span>
              <span>Received {inr(b.client.received)}</span>
              <span>Refunded {inr(b.client.refunded)}</span>
              <span className="text-ink">Balance due {inr(b.client.balanceDue)}</span>
              {b.client.advanceDue > 0 && (
                <span>
                  {b.client.advanceReceived
                    ? "Advance received"
                    : `Advance due ${inr(b.client.advanceDue)}`}
                </span>
              )}
              {b.vendors.map((v) => (
                <span key={v.vendorId}>
                  {v.vendorId}: payable {inr(v.payable)}, paid {inr(v.paid)} (
                  {v.status.replace("_", " ")})
                  {(v.status === "due" || v.status === "partially_paid") && (
                    <button
                      className="ml-1 text-saffron-deep font-semibold"
                      onClick={() =>
                        setRec({
                          kind: "vendor-payments",
                          booking: b,
                          vendorId: v.vendorId,
                          suggested: v.balance,
                        })
                      }
                    >
                      Pay
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))
      )}
      <RecordDialog rec={rec} onClose={() => setRec(undefined)} />
      <ReconciliationDialog bookingId={view} onClose={() => setView(undefined)} />
    </KCard>
  );
}

function RecordDialog({ rec, onClose }: { rec: Rec | undefined; onClose: () => void }) {
  const act = useFinanceActions();
  const [f, setF] = useState({
    amount: "",
    mode: "neft",
    reference: "",
    paidOn: todayIST(),
    note: "",
    reason: "",
  });
  const [file, setFile] = useState<File>();
  const [err, setErr] = useState<string>();
  if (!rec) return null;
  const title =
    rec.kind === "payments"
      ? "Record client payment"
      : rec.kind === "vendor-payments"
        ? `Record payout to ${rec.vendorId}`
        : "Record refund";
  const submit = () => {
    setErr(undefined);
    if (!file)
      return setErr("Attach the evidence: UTR screenshot, receipt or bank advice (PDF/JPG/PNG)");
    if (file.size > MAX_DOC_BYTES) return setErr("File is larger than 5 MB");
    act.record.mutate(
      {
        kind: rec.kind,
        file,
        fields: {
          bookingId: rec.booking.bookingId,
          ...(rec.vendorId ? { vendorId: rec.vendorId } : {}),
          amount: f.amount || String(rec.suggested ?? ""),
          mode: f.mode,
          reference: f.reference,
          paidOn: f.paidOn,
          note: f.note,
          ...(rec.kind === "refunds" ? { reason: f.reason } : {}),
        },
      },
      {
        onSuccess: (p) => {
          toast.success(`${p.paymentId} recorded — waiting for a second Finance user to verify`);
          setF({ ...f, amount: "", reference: "", note: "", reason: "" });
          setFile(undefined);
          onClose();
        },
        onError: (e) => setErr(e.message),
      },
    );
    return undefined;
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {title} · <span className="font-mono text-[13px]">{rec.booking.bookingId}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
          {err && (
            <div className="sm:col-span-2">
              <FormError message={err} />
            </div>
          )}
          <Field
            id="pa"
            label="Amount (₹)"
            inputMode="decimal"
            placeholder={rec.suggested ? String(rec.suggested) : ""}
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
          <div className="space-y-1.5">
            <label htmlFor="pm" className="font-medium">
              Mode
            </label>
            <select
              id="pm"
              className={selectCls}
              value={f.mode}
              onChange={(e) => setF({ ...f, mode: e.target.value })}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <Field
            id="pr"
            label="UTR / reference"
            value={f.reference}
            onChange={(e) => setF({ ...f, reference: e.target.value })}
          />
          <Field
            id="pd"
            label="Paid on"
            type="date"
            max={todayIST()}
            value={f.paidOn}
            onChange={(e) => setF({ ...f, paidOn: e.target.value })}
          />
          {rec.kind === "refunds" && (
            <Field
              id="prs"
              className="sm:col-span-2"
              label="Reason"
              value={f.reason}
              onChange={(e) => setF({ ...f, reason: e.target.value })}
            />
          )}
          <Field
            id="pn"
            className="sm:col-span-2"
            label="Note (optional)"
            value={f.note}
            onChange={(e) => setF({ ...f, note: e.target.value })}
          />
          <div className="sm:col-span-2 space-y-1.5">
            <label htmlFor="pf" className="font-medium">
              Evidence (required)
            </label>
            <input
              id="pf"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0])}
              className="block w-full text-[13px]"
            />
          </div>
          <p className="sm:col-span-2 text-[12px] text-mute">
            Saved as Unverified. It counts only after a different Finance user verifies the
            evidence.
          </p>
        </div>
        <DialogFooter>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn disabled={act.record.isPending} onClick={submit}>
            Record payment
          </Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconciliationDialog({
  bookingId,
  onClose,
}: {
  bookingId: string | undefined;
  onClose: () => void;
}) {
  const r = useReconciliation(bookingId);
  const link = (fmt: "csv" | "pdf") =>
    assetUrl(`/api/v1/finance/reconciliation/${bookingId}?format=${fmt}`);
  return (
    <Dialog open={!!bookingId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Reconciliation · <span className="font-mono">{bookingId}</span>
          </DialogTitle>
        </DialogHeader>
        {!r.data ? (
          <div className="h-40 bg-muted rounded-lg animate-pulse" />
        ) : (
          <div className="space-y-4 text-[13px]">
            <div className="grid sm:grid-cols-2 gap-x-8">
              <div>
                <div className="font-semibold mb-1">Client</div>
                <Row k="Billed" v={inr(r.data.client.billed)} />
                <Row k="GST on invoice" v={inr(r.data.client.billedGst)} />
                <Row k="Received (verified)" v={inr(r.data.client.received)} />
                <Row k="Refunded (verified)" v={inr(r.data.client.refunded)} />
                <Row k="Balance due" v={inr(r.data.client.balanceDue)} />
              </div>
              <div>
                <div className="font-semibold mb-1">Platform</div>
                <Row k="Commission" v={inr(r.data.platform.commission)} />
                <Row k="Service fee" v={inr(r.data.platform.serviceFee)} />
                <Row k="Output GST" v={inr(r.data.platform.outputGst)} />
                <Row k="Input GST" v={inr(r.data.platform.inputGst)} />
                <Row k="Gross margin" v={inr(r.data.platform.grossMargin)} />
              </div>
            </div>
            <div>
              <div className="font-semibold mb-1">Vendors</div>
              {r.data.vendors.map((v) => (
                <Row
                  key={v.vendorId}
                  k={`${v.vendorId} (${v.status.replace("_", " ")})`}
                  v={`${inr(v.paid)} of ${inr(v.payable)}`}
                />
              ))}
            </div>
            {r.data.cancellation && (
              <p className="text-mute">
                Cancellation: {r.data.cancellation.rule} · fee {inr(r.data.cancellation.fee)} ·
                refundable {inr(r.data.cancellation.refundable)}
              </p>
            )}
            <div>
              <div className="font-semibold mb-1">Checks</div>
              {r.data.checks.map((c) => (
                <div
                  key={c.name}
                  className={cn("flex gap-2", c.ok ? "text-verified" : "text-destructive")}
                >
                  <span>{c.ok ? "✓" : "✗"}</span>
                  <span>{c.name}</span>
                  <span className="text-mute ml-auto text-[12px]">{c.detail}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <a href={link("csv")}>
                <Btn variant="secondary" className="h-9">
                  <Download size={14} />
                  CSV
                </Btn>
              </a>
              <a href={link("pdf")}>
                <Btn variant="dark" className="h-9">
                  <Download size={14} />
                  PDF
                </Btn>
              </a>
            </div>
            <p className="text-[11px] text-mute">Exports are logged.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Payables() {
  const list = usePayables();
  const act = useFinanceActions();
  const [bank, setBank] = useState<Record<string, string>>({});
  const show = (p: PayableRow) =>
    fetchVendorBank(p.vendorId)
      .then((b) =>
        setBank({
          ...bank,
          [p.vendorId]: `${b.accountName} · ${b.accountNo} · ${b.ifsc}${b.verified ? " · verified" : " · not yet verified"}`,
        }),
      )
      .catch((e: Error) => toast.error(e.message));
  return (
    <KCard title="Vendor payables" bodyClass="divide-y divide-line">
      {!list.data?.length ? (
        <Empty
          title="No payables"
          hint="Payables appear when bookings are created; they become due once proof of display is verified."
        />
      ) : (
        list.data.map((p) => (
          <div
            key={`${p.bookingId}-${p.vendorId}`}
            className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]"
          >
            <span className="font-mono text-[12px] w-36">{p.bookingId}</span>
            <span className="flex-1 min-w-48">
              {p.vendorName ?? p.vendorId}{" "}
              <span className="font-mono text-[12px] text-mute">{p.vendorId}</span>
              {bank[p.vendorId] && (
                <span className="block text-[12px] font-mono">{bank[p.vendorId]}</span>
              )}
            </span>
            <span>
              {inr(p.paid)} / {inr(p.amount)}
              {p.gst ? (
                <span className="text-mute text-[12px]"> (incl. GST {inr(p.gst)})</span>
              ) : null}
            </span>
            <span className="text-[12px] text-mute">due {p.dueDate}</span>
            <Pill
              tone={
                p.status === "paid"
                  ? "verified"
                  : p.status === "due" || p.status === "partially_paid"
                    ? "saffron"
                    : "neutral"
              }
            >
              {p.status.replace("_", " ")}
            </Pill>
            <button
              className="text-[12px] text-saffron-deep font-semibold"
              onClick={() => void show(p)}
            >
              Bank details (logged)
            </button>
            {bank[p.vendorId]?.includes("not yet verified") && (
              <button
                className="text-[12px] text-ink font-semibold"
                onClick={() =>
                  act.verifyBank.mutate(p.vendorId, {
                    onSuccess: () => {
                      toast.success("Bank details verified");
                      void show(p);
                    },
                  })
                }
              >
                Mark bank verified
              </button>
            )}
          </div>
        ))
      )}
    </KCard>
  );
}
