import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, FileText } from "lucide-react";
import {
  KYC_DOC_LABEL,
  PRICING_UNIT_LABEL,
  type KycStatus,
  type ListingStatus,
} from "@oohrena/shared";
import { assetUrl } from "@/lib/api";
import { inr } from "@/lib/format";
import {
  useAdminInventory,
  useAdminVendor,
  useAdminVendors,
  useKycDecision,
  useListingDecision,
  useListingHistory,
  useResolveDuplicate,
  useSetDataType,
  type AdminListing,
} from "@/lib/inventory-api";
import { Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { KycPill, ListingPill } from "@/components/app/status";
import { fmtDate } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/AuthShell";
import { OwnerAvailabilityDialog } from "@/components/app/OwnerAvailabilityDialog";
import { cn } from "@/lib/utils";

type Decision = "approve" | "reject" | "suspend" | "reinstate";
const VERB: Record<Decision, string> = {
  approve: "Approve",
  reject: "Reject",
  suspend: "Suspend",
  reinstate: "Reinstate",
};

/** Every decision except approve/reinstate needs a written reason; the API enforces the same rule. */
function DecisionDialog({
  open,
  title,
  decision,
  price,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  decision: Decision;
  price?: number | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: (v: { reason?: string; indicativePrice?: number }) => void;
}) {
  const [reason, setReason] = useState("");
  const [p, setP] = useState(price ? String(price) : "");
  const [err, setErr] = useState<string>();
  const needsReason = decision === "reject" || decision === "suspend";
  function go() {
    if (needsReason && reason.trim().length < 3)
      return setErr("Give a reason (at least 3 characters). The vendor will see it.");
    const n = Number(p);
    if (price !== undefined && !(n > 0)) return setErr("Enter the client-facing indicative price");
    onConfirm({
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(price !== undefined ? { indicativePrice: n } : {}),
    });
    return undefined;
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setErr(undefined);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {VERB[decision]} {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-[13px]">
          {price !== undefined && (
            <Field
              id="price"
              label="Client price (₹)"
              inputMode="decimal"
              value={p}
              onChange={(e) => setP(e.target.value)}
            />
          )}
          <div className="space-y-1.5">
            <label htmlFor="reason" className="font-medium">
              {needsReason ? "Reason (required)" : "Note (optional)"}
            </label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {err && <p className="text-destructive text-[12px]">{err}</p>}
        </div>
        <DialogFooter>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant={decision === "approve" || decision === "reinstate" ? "primary" : "dark"}
            disabled={busy}
            onClick={go}
          >
            {busy ? "Saving…" : VERB[decision]}
          </Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const KYC_FILTERS: { id: KycStatus | undefined; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "suspended", label: "Suspended" },
  { id: undefined, label: "All" },
];

export function VendorKycQueue() {
  const [filter, setFilter] = useState<KycStatus | undefined>("pending");
  const list = useAdminVendors(filter);
  const decide = useKycDecision();
  const [open, setOpen] = useState<string>();
  const [dlg, setDlg] = useState<{ id: string; name: string; decision: Decision }>();

  return (
    <KCard
      title="Vendor KYC review"
      bodyClass=""
      right={
        <div className="flex gap-1 text-[12px]">
          {KYC_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.id)}
              className={cn(
                "px-2.5 h-7 rounded-md",
                filter === f.id
                  ? "bg-navy text-navy-foreground font-semibold"
                  : "text-mute hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {list.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Loading vendors…</div>
      ) : list.isError ? (
        <div className="p-8 text-center text-destructive text-[13px]">{list.error.message}</div>
      ) : !list.data.items.length ? (
        <Empty
          title={
            filter === "pending" ? "No vendors waiting for KYC review" : "No vendors in this view"
          }
        />
      ) : (
        <div className="divide-y divide-line">
          {list.data.items.map((v) => (
            <div key={v.vendorId}>
              <div className="px-5 py-3 flex flex-wrap items-center gap-4 text-[13px]">
                <button
                  aria-label="Show details"
                  onClick={() => setOpen(open === v.vendorId ? undefined : v.vendorId)}
                  className="text-mute"
                >
                  {open === v.vendorId ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="flex-1 min-w-48">
                  <div className="font-semibold">
                    {v.legalName}{" "}
                    <span className="font-mono text-[12px] text-mute">{v.vendorId}</span>
                  </div>
                  <div className="text-mute text-[12px]">
                    {v.contactName} · {v.city} · PAN {v.pan} · {v.documentCount} doc
                    {v.documentCount === 1 ? "" : "s"} · {v.listingCount} listing
                    {v.listingCount === 1 ? "" : "s"}
                  </div>
                  {v.missingDocuments.length > 0 && (
                    <div className="text-hold text-[12px]">
                      Missing: {v.missingDocuments.map((t) => KYC_DOC_LABEL[t]).join(", ")}
                    </div>
                  )}
                  {v.kycReason && (
                    <div className="text-[12px] text-destructive">Reason: {v.kycReason}</div>
                  )}
                </div>
                <KycPill status={v.kycStatus} />
                <div className="flex gap-2">
                  {v.kycStatus === "pending" && (
                    <>
                      <Btn
                        variant="secondary"
                        className="h-8 px-3 text-[12px]"
                        onClick={() =>
                          setDlg({ id: v.vendorId, name: v.legalName, decision: "reject" })
                        }
                      >
                        Reject
                      </Btn>
                      <Btn
                        variant="dark"
                        className="h-8 px-3 text-[12px]"
                        disabled={v.missingDocuments.length > 0}
                        title={v.missingDocuments.length ? "Required documents missing" : undefined}
                        onClick={() =>
                          setDlg({ id: v.vendorId, name: v.legalName, decision: "approve" })
                        }
                      >
                        Approve KYC
                      </Btn>
                    </>
                  )}
                  {v.kycStatus === "approved" && (
                    <Btn
                      variant="secondary"
                      className="h-8 px-3 text-[12px]"
                      onClick={() =>
                        setDlg({ id: v.vendorId, name: v.legalName, decision: "suspend" })
                      }
                    >
                      Suspend
                    </Btn>
                  )}
                  {v.kycStatus === "suspended" && (
                    <Btn
                      variant="secondary"
                      className="h-8 px-3 text-[12px]"
                      onClick={() =>
                        setDlg({ id: v.vendorId, name: v.legalName, decision: "reinstate" })
                      }
                    >
                      Reinstate
                    </Btn>
                  )}
                </div>
              </div>
              {open === v.vendorId && <VendorDetail id={v.vendorId} />}
            </div>
          ))}
        </div>
      )}
      {dlg && (
        <DecisionDialog
          open
          title={dlg.name}
          decision={dlg.decision}
          busy={decide.isPending}
          onClose={() => setDlg(undefined)}
          onConfirm={(x) =>
            decide.mutate(
              { id: dlg.id, decision: dlg.decision, ...(x.reason ? { reason: x.reason } : {}) },
              {
                onSuccess: (r) => {
                  toast.success(`${dlg.name}: KYC ${r.kycStatus}`);
                  setDlg(undefined);
                },
                onError: (e) => toast.error(e.message),
              },
            )
          }
        />
      )}
    </KCard>
  );
}

function VendorDetail({ id }: { id: string }) {
  const d = useAdminVendor(id);
  if (d.isPending) return <div className="px-12 pb-4 text-mute text-[12px]">Loading…</div>;
  if (d.isError)
    return <div className="px-12 pb-4 text-destructive text-[12px]">{d.error.message}</div>;
  const v = d.data;
  return (
    <div className="px-12 pb-4 grid md:grid-cols-2 gap-4 text-[12px]">
      <div className="space-y-1">
        <div className="text-mute uppercase tracking-wider font-semibold text-[11px]">Contact</div>
        <div>
          {v.contact?.name} · {v.contact?.email} · {v.contact?.mobile}
        </div>
        <div>
          PAN <span className="font-mono">{v.pan}</span>
          {v.gstin && (
            <>
              {" "}
              · GSTIN <span className="font-mono">{v.gstin}</span>
            </>
          )}
        </div>
        <div>Registered {fmtDate(v.createdAt)}</div>
        <div className="text-mute uppercase tracking-wider font-semibold text-[11px] pt-2">
          Bank (masked)
        </div>
        <div>
          {v.bank ? (
            <>
              {v.bank.accountName} · <span className="font-mono">{v.bank.accountNo}</span> ·{" "}
              {v.bank.ifsc}
            </>
          ) : (
            <span className="text-mute">Not added yet</span>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-mute uppercase tracking-wider font-semibold text-[11px]">
          Documents (opening one is logged)
        </div>
        {v.documents.length ? (
          v.documents.map((doc) => (
            <a
              key={doc.docId}
              href={assetUrl(`/api/v1/files/${doc.fileId}`)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-saffron-deep hover:underline"
            >
              <FileText size={13} />
              {KYC_DOC_LABEL[doc.type]}
              <span className="text-mute">
                · {fmtDate(doc.uploadedAt)} · {doc.status}
              </span>
            </a>
          ))
        ) : (
          <div className="text-mute">No documents uploaded</div>
        )}
      </div>
    </div>
  );
}

const LISTING_FILTERS: { id: ListingStatus | undefined; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "suspended", label: "Suspended" },
  { id: undefined, label: "All" },
];

export function ListingReviewQueue() {
  const [filter, setFilter] = useState<ListingStatus | undefined>("pending");
  const list = useAdminInventory(filter);
  const decide = useListingDecision();
  const setType = useSetDataType();
  const [dlg, setDlg] = useState<{ l: AdminListing; decision: Decision }>();

  return (
    <KCard
      title="Listing verification"
      bodyClass=""
      right={
        <div className="flex gap-1 text-[12px]">
          {LISTING_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.id)}
              className={cn(
                "px-2.5 h-7 rounded-md",
                filter === f.id
                  ? "bg-navy text-navy-foreground font-semibold"
                  : "text-mute hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {list.isPending ? (
        <div className="p-8 text-center text-mute text-[13px]">Loading listings…</div>
      ) : list.isError ? (
        <div className="p-8 text-center text-destructive text-[13px]">{list.error.message}</div>
      ) : !list.data.items.length ? (
        <Empty
          title={
            filter === "pending" ? "No listings waiting for review" : "No listings in this view"
          }
        />
      ) : (
        <div className="divide-y divide-line">
          {list.data.items.map((l) => (
            <ListingRow
              key={l.inventoryId}
              l={l}
              onDecide={(decision) => setDlg({ l, decision })}
              onDemo={(dataType) => {
                const reason = prompt(
                  dataType === "DEMO"
                    ? "Why mark this listing as DEMO (never bookable)?"
                    : "Why mark this listing as VERIFIED?",
                );
                if (!reason || reason.trim().length < 3) return;
                setType.mutate(
                  { id: l.inventoryId, dataType, reason: reason.trim() },
                  {
                    onSuccess: () => toast.success(`${l.inventoryId} marked ${dataType}`),
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
            />
          ))}
        </div>
      )}
      {dlg && (
        <DecisionDialog
          open
          title={`${dlg.l.inventoryId}`}
          decision={dlg.decision}
          busy={decide.isPending}
          price={
            dlg.decision === "approve" ? (dlg.l.indicativePrice ?? dlg.l.suggestedPrice) : undefined
          }
          onClose={() => setDlg(undefined)}
          onConfirm={(x) =>
            decide.mutate(
              { id: dlg.l.inventoryId, decision: dlg.decision, ...x },
              {
                onSuccess: (r) => {
                  toast.success(`${r.inventoryId} is now ${r.status}`);
                  setDlg(undefined);
                },
                onError: (e) => toast.error(e.message),
              },
            )
          }
        />
      )}
    </KCard>
  );
}

function ListingRow({
  l,
  onDecide,
  onDemo,
}: {
  l: AdminListing;
  onDecide: (d: Decision) => void;
  onDemo: (t: "DEMO" | "VERIFIED") => void;
}) {
  const [showHist, setShowHist] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const resolve = useResolveDuplicate();
  const hist = useListingHistory(showHist ? l.inventoryId : undefined, "admin");
  const vendorBlocked = l.vendor?.kycStatus !== "approved";
  return (
    <div className="px-5 py-4 text-[13px] space-y-3">
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2 shrink-0">
          {l.photos.slice(0, 2).map((p) => (
            <a key={p.fileId} href={assetUrl(p.url)} target="_blank" rel="noreferrer">
              <img
                src={assetUrl(p.url)}
                alt="Site"
                className="h-20 w-28 object-cover rounded-md border border-line"
              />
            </a>
          ))}
          {!l.photos.length && (
            <div className="h-20 w-28 rounded-md border border-dashed border-line grid place-items-center text-[11px] text-mute">
              No photo
            </div>
          )}
        </div>
        <div className="flex-1 min-w-60 space-y-0.5">
          <div className="font-semibold">
            {l.title} <span className="font-mono text-[12px] text-mute">{l.inventoryId}</span>
          </div>
          <div className="text-mute text-[12px]">
            {l.categoryName} · {l.address}, {l.locality}, {l.city} {l.pin} · {l.lat.toFixed(5)},{" "}
            {l.lng.toFixed(5)}
          </div>
          <div className="text-[12px]">
            Vendor: <b>{l.vendor?.legalName}</b>{" "}
            <span className="font-mono text-mute">{l.vendor?.vendorId}</span>{" "}
            {vendorBlocked && (
              <Pill tone="hold" className="ml-1">
                KYC {l.vendor?.kycStatus}
              </Pill>
            )}
          </div>
          <div className="text-[12px]">
            Vendor rate {inr(l.rate)} {PRICING_UNIT_LABEL[l.pricingUnit]} · qty {l.quantity}
            {l.indicativePrice ? (
              <> · client price {inr(l.indicativePrice)}</>
            ) : (
              <> · suggested {inr(l.suggestedPrice)}</>
            )}
          </div>
          <div className="text-[12px] text-mute">
            {Object.entries(l.attributes)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(" · ")}
          </div>
          {l.statusReason && <div className="text-[12px] text-hold">{l.statusReason}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1.5">
            <ListingPill status={l.status} />
            {l.dataType && (
              <Pill tone={l.dataType === "DEMO" ? "hold" : "verified"}>{l.dataType}</Pill>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {l.status === "pending" && (
              <>
                <Btn
                  variant="secondary"
                  className="h-8 px-3 text-[12px]"
                  onClick={() => onDecide("reject")}
                >
                  Reject
                </Btn>
                <Btn
                  variant="dark"
                  className="h-8 px-3 text-[12px]"
                  disabled={vendorBlocked}
                  title={vendorBlocked ? "Approve the vendor's KYC first" : undefined}
                  onClick={() => onDecide("approve")}
                >
                  Approve & list
                </Btn>
              </>
            )}
            {l.status === "approved" && (
              <>
                <Btn
                  variant="secondary"
                  className="h-8 px-3 text-[12px]"
                  onClick={() => setCalOpen(true)}
                >
                  Dates & holds
                </Btn>
                <Btn
                  variant="secondary"
                  className="h-8 px-3 text-[12px]"
                  onClick={() => onDecide("suspend")}
                >
                  Suspend
                </Btn>
                <Btn
                  variant="secondary"
                  className="h-8 px-3 text-[12px]"
                  onClick={() => onDemo(l.dataType === "DEMO" ? "VERIFIED" : "DEMO")}
                >
                  {l.dataType === "DEMO" ? "Mark VERIFIED" : "Mark DEMO"}
                </Btn>
              </>
            )}
            {l.status === "suspended" && (
              <Btn
                variant="secondary"
                className="h-8 px-3 text-[12px]"
                disabled={vendorBlocked}
                onClick={() => onDecide("reinstate")}
              >
                Reinstate
              </Btn>
            )}
          </div>
          <button
            className="text-[12px] text-saffron-deep hover:underline"
            onClick={() => setShowHist(!showHist)}
          >
            {showHist ? "Hide history" : "Change history"}
          </button>
        </div>
      </div>
      <OwnerAvailabilityDialog
        scope="admin"
        listing={calOpen ? { inventoryId: l.inventoryId, title: l.title } : undefined}
        onClose={() => setCalOpen(false)}
      />
      {l.openDuplicates.map((d) => (
        <div
          key={d.flagId}
          className="rounded-lg border border-hold/40 bg-hold-soft px-3 py-2 text-[12px] flex flex-wrap items-center gap-3"
        >
          <AlertTriangle size={14} className="text-hold" />
          <span className="flex-1">
            Possible duplicate of <b className="font-mono">{d.other}</b> — {d.reasons.join(", ")}{" "}
            (score {d.score})
          </span>
          <button
            className="font-semibold text-ink hover:underline"
            onClick={() => {
              const note = prompt("Why is this not a duplicate?");
              if (note && note.trim().length >= 3)
                resolve.mutate(
                  { flagId: d.flagId, resolution: "dismissed", note: note.trim() },
                  { onSuccess: () => toast.success("Flag dismissed") },
                );
            }}
          >
            Not a duplicate
          </button>
          <button
            className="font-semibold text-destructive hover:underline"
            onClick={() => {
              const note = prompt("Note for confirming the duplicate:");
              if (note && note.trim().length >= 3)
                resolve.mutate(
                  { flagId: d.flagId, resolution: "confirmed", note: note.trim() },
                  {
                    onSuccess: () =>
                      toast.success(
                        "Marked as duplicate — reject the listing to keep it off the marketplace",
                      ),
                  },
                );
            }}
          >
            Confirm duplicate
          </button>
        </div>
      ))}
      {showHist && (
        <div className="border border-line rounded-lg max-h-48 overflow-y-auto">
          {hist.isPending ? (
            <div className="p-3 text-mute text-[12px]">Loading…</div>
          ) : (
            <table className="w-full text-[12px]">
              <tbody>
                {(hist.data ?? []).map((h, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap text-mute">
                      {fmtDate(h.changedAt)}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{h.field}</td>
                    <td className="px-3 py-1.5 text-mute">{String(h.old ?? "—")}</td>
                    <td className="px-3 py-1.5">{String(h.new ?? "—")}</td>
                    <td className="px-3 py-1.5 font-mono text-mute">{h.changedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
