import { inr } from "@/lib/format";
import { useBookingPaymentStatus, useMyPayables, useMyPayments } from "@/lib/finance-api";
import { Empty, KCard, Pill } from "@/components/app/kit";

/** Client: own invoices and payments (verified = received). */
export function ClientPayments() {
  const d = useMyPayments();
  return (
    <KCard title="Invoices & payments" bodyClass="divide-y divide-line">
      {d.isPending ? <div className="p-6 text-center text-mute text-[13px]">Loading…</div>
        : !d.data?.invoices.length && !d.data?.payments.length ? <Empty title="No invoices yet" hint="OOHRENA raises a tax invoice once your booking is confirmed." />
        : <>
          {d.data!.invoices.map((i) => (
            <div key={i.invoiceId} className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]">
              <span className="font-mono text-[12px] w-36">{i.invoiceId}</span>
              <span className="flex-1 min-w-48">Booking {i.bookingId}<span className="block text-[12px] text-mute">Subtotal {inr(i.subtotal)} · fee {inr(i.serviceFee)} · CGST {inr(i.cgst)} · SGST {inr(i.sgst)} · advance {i.advancePct}% = {inr(i.advanceAmount)} · due {i.dueDate}</span></span>
              <span className="font-semibold">{inr(i.total)}</span>
              <Pill tone={i.status === "paid" ? "verified" : "hold"}>{i.status.replace("_", " ")}</Pill>
            </div>
          ))}
          {d.data!.payments.map((p) => (
            <div key={p.paymentId} className="px-5 py-2.5 flex flex-wrap items-center gap-3 text-[12px]">
              <span className="font-mono w-36">{p.paymentId}</span><span className="flex-1">{p.label} · {p.mode?.toUpperCase()} {p.reference} · {p.paidOn}</span>
              <span className="font-semibold">{inr(p.amount)}</span>
              <Pill tone={p.status === "verified" ? "verified" : "hold"}>{p.status === "verified" ? (p.direction === "refund" ? "refunded" : "received") : "being verified"}</Pill>
            </div>
          ))}
        </>}
    </KCard>
  );
}

/** Vendor: own payables and payouts. */
export function VendorPayables() {
  const d = useMyPayables();
  return (
    <KCard title="Payables & payouts" bodyClass="divide-y divide-line">
      {d.isPending ? <div className="p-6 text-center text-mute text-[13px]">Loading…</div>
        : !d.data?.payables.length ? <Empty title="No payables yet" hint="Each booking of your media creates a payable. It becomes due once your proof of display is verified." />
        : <>
          {d.data.payables.map((p) => (
            <div key={p.bookingId} className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px]">
              <span className="font-mono text-[12px] w-36">{p.bookingId}</span>
              <span className="flex-1 min-w-48">{inr(p.amount)}{p.gst ? ` (incl. GST ${inr(p.gst)})` : ""} · paid {inr(p.paid)} · balance {inr(p.balance)}<span className="block text-[12px] text-mute">{p.status === "pending" ? "Becomes due when proof is verified" : `Due by ${p.dueDate}`}</span></span>
              <Pill tone={p.status === "paid" ? "verified" : p.status === "due" || p.status === "partially_paid" ? "saffron" : "neutral"}>{p.status.replace("_", " ")}</Pill>
            </div>
          ))}
          {d.data.payouts.map((p) => (
            <div key={p.paymentId} className="px-5 py-2.5 flex flex-wrap items-center gap-3 text-[12px]">
              <span className="font-mono w-36">{p.paymentId}</span><span className="flex-1">Payout for {p.bookingId} · {p.mode?.toUpperCase()} {p.reference} · {p.paidOn}</span>
              <span className="font-semibold">{inr(p.amount)}</span><Pill tone={p.status === "verified" ? "verified" : "hold"}>{p.status === "verified" ? "paid" : "processing"}</Pill>
            </div>
          ))}
        </>}
    </KCard>
  );
}

/** Admin: payment status only — no amounts, evidence or bank data. */
export function AdminPaymentStatus({ bookingId }: { bookingId: string }) {
  const s = useBookingPaymentStatus(bookingId);
  if (!s.data) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-mute">Payment status:</span>
      <Pill tone={s.data.invoice?.status === "paid" ? "verified" : "hold"}>{s.data.invoice ? `${s.data.invoice.invoiceId} ${s.data.invoice.status.replace("_", " ")}` : "Not invoiced yet"}</Pill>
      {s.data.payables.map((p) => <Pill key={p.vendorId}>{p.vendorId} payable {p.status.replace("_", " ")}</Pill>)}
    </div>
  );
}
