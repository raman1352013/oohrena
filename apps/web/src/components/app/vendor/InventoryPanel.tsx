import { useState } from "react";
import { toast } from "sonner";
import { History, Plus, Upload } from "lucide-react";
import { CATEGORY_DEFS, IMPORT_COLUMNS, PRICING_UNIT_LABEL } from "@oohrena/shared";
import { ApiError } from "@/lib/api";
import { inr } from "@/lib/format";
import {
  useImportCsv,
  useListingHistory,
  useMyInventory,
  useSubmitListing,
  type Listing,
} from "@/lib/inventory-api";
import { Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { ListingPill } from "@/components/app/status";
import { fmtDate } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListingEditor } from "./ListingEditor";
import { OwnerAvailabilityDialog } from "@/components/app/OwnerAvailabilityDialog";

export function InventoryPanel({ canList }: { canList: boolean }) {
  const inv = useMyInventory();
  const submit = useSubmitListing();
  const [editing, setEditing] = useState<{ open: boolean; listing?: Listing | undefined }>({
    open: false,
  });
  const [historyFor, setHistoryFor] = useState<string>();
  const [calFor, setCalFor] = useState<Listing>();
  const items = inv.data?.items ?? [];
  const counts = {
    live: items.filter((i) => i.status === "approved").length,
    review: items.filter((i) => i.status === "pending").length,
    draft: items.filter((i) => i.status === "draft" || i.status === "rejected").length,
  };

  return (
    <>
      <KCard
        title="My media inventory"
        bodyClass=""
        right={
          <>
            <span className="text-[12px] text-mute">
              {counts.live} live · {counts.review} in review · {counts.draft} draft
            </span>
            <Btn className="h-8 px-3 text-[12px]" onClick={() => setEditing({ open: true })}>
              <Plus size={14} />
              Add listing
            </Btn>
          </>
        }
      >
        {!canList && (
          <p className="px-5 pt-4 text-[12px] text-hold">
            Listings go live after KYC approval.
          </p>
        )}
        {inv.isPending ? (
          <div className="p-8 text-center text-mute text-[13px]">Loading your listings…</div>
        ) : inv.isError ? (
          <div className="p-8 text-center text-[13px]">
            <div className="text-destructive">{inv.error.message}</div>
            <Btn variant="secondary" className="mt-3 h-8" onClick={() => void inv.refetch()}>
              Try again
            </Btn>
          </div>
        ) : !items.length ? (
          <Empty
            title="No listings yet"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[760px]">
              <thead>
                <tr className="text-left text-[12px] text-mute border-b border-line">
                  {["Inventory ID", "Listing", "Your rate", "Photos", "Status", "Updated", ""].map(
                    (h) => (
                      <th key={h} className="font-normal px-4 py-2.5">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.inventoryId} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                      {l.inventoryId}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{l.title}</div>
                      <div className="text-mute text-[12px]">
                        {l.categoryName} · {l.locality}, {l.city}
                      </div>
                      {l.statusReason && (
                        <div
                          className={`text-[12px] mt-1 ${l.status === "rejected" ? "text-destructive" : "text-hold"}`}
                        >
                          {l.statusReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inr(l.rate)}{" "}
                      <span className="text-mute text-[12px]">
                        {PRICING_UNIT_LABEL[l.pricingUnit]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {l.photos.length || <span className="text-destructive">0</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <ListingPill status={l.status} />
                        {l.dataType === "DEMO" && <Pill tone="hold">DEMO</Pill>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-mute text-[12px] whitespace-nowrap">
                      {fmtDate(l.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      <button
                        className="text-mute hover:text-ink align-middle"
                        aria-label={`History of ${l.inventoryId}`}
                        onClick={() => setHistoryFor(l.inventoryId)}
                      >
                        <History size={15} />
                      </button>
                      {l.status === "approved" && (
                        <Btn
                          variant="secondary"
                          className="h-8 px-3 text-[12px]"
                          onClick={() => setCalFor(l)}
                        >
                          Availability
                        </Btn>
                      )}
                      <Btn
                        variant="secondary"
                        className="h-8 px-3 text-[12px]"
                        onClick={() => setEditing({ open: true, listing: l })}
                      >
                        {l.status === "pending" || l.status === "suspended" ? "View" : "Edit"}
                      </Btn>
                      {l.status === "draft" && (
                        <Btn
                          variant="dark"
                          className="h-8 px-3 text-[12px]"
                          disabled={submit.isPending || !l.photos.length}
                          title={!l.photos.length ? "Add a photo first" : undefined}
                          onClick={() =>
                            submit.mutate(l.inventoryId, {
                              onSuccess: () =>
                                toast.success(`${l.inventoryId} submitted for review`),
                              onError: (e) =>
                                toast.error(
                                  e instanceof ApiError &&
                                    (e.details as { problems?: string[] })?.problems
                                    ? (e.details as { problems: string[] }).problems.join("; ")
                                    : e.message,
                                ),
                            })
                          }
                        >
                          Submit
                        </Btn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </KCard>
      <ListingEditor
        open={editing.open}
        listing={editing.listing}
        onClose={() => setEditing({ open: false })}
      />
      <HistoryDialog id={historyFor} onClose={() => setHistoryFor(undefined)} />
      <OwnerAvailabilityDialog
        scope="vendor"
        listing={calFor}
        onClose={() => setCalFor(undefined)}
      />
    </>
  );
}

function HistoryDialog({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const h = useListingHistory(id, "vendor");
  const show = (v: unknown) =>
    v === null || v === undefined || v === ""
      ? "—"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Change history <span className="font-mono text-[13px] text-mute">{id}</span>
          </DialogTitle>
        </DialogHeader>
        {h.isPending ? (
          <p className="text-mute text-[13px]">Loading…</p>
        ) : !h.data?.length ? (
          <Empty title="No changes recorded yet" />
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-mute border-b border-line">
                {["When", "Field", "Old", "New", "v"].map((x) => (
                  <th key={x} className="font-normal py-2 pr-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.data.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.changedAt)}</td>
                  <td className="py-2 pr-3 font-mono">{r.field}</td>
                  <td className="py-2 pr-3 text-mute break-all">{show(r.old)}</td>
                  <td className="py-2 pr-3 break-all">{show(r.new)}</td>
                  <td className="py-2">{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Example rows so vendors see the expected format, including category attribute columns. */
function templateCsv() {
  const attrKeys = [...new Set(CATEGORY_DEFS.flatMap((c) => c.attributes.map((a) => a.key)))];
  const head = [...IMPORT_COLUMNS, ...attrKeys.map((k) => `attr_${k}`)];
  const row = (o: Record<string, string>) =>
    head
      .map((h) => {
        const v = o[h] ?? "";
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      })
      .join(",");
  return [
    head.join(","),
    row({
      title: "Phoolbagh Chowk Unipole",
      category: "unipole",
      city: "Gwalior",
      locality: "Phoolbagh",
      landmark: "Opp. Phoolbagh Gate",
      address: "Phoolbagh Rd, Lashkar",
      pin: "474001",
      lat: "26.2124",
      lng: "78.1772",
      rate: "45000",
      pricing_unit: "per_month",
      quantity: "1",
      attr_widthFt: "40",
      attr_heightFt: "20",
      attr_illuminated: "yes",
    }),
    row({
      title: "City E-rickshaw fleet",
      category: "erickshaw_auto",
      city: "Gwalior",
      locality: "City-wide",
      address: "Depot, Thatipur",
      pin: "474011",
      lat: "26.2183",
      lng: "78.1828",
      rate: "900",
      pricing_unit: "per_vehicle_month",
      quantity: "50",
      attr_fleetSize: "50",
      attr_panelSize: "Back panel 3x2 ft",
    }),
  ].join("\n");
}

export function CsvImportCard() {
  const imp = useImportCsv();
  const [text, setText] = useState<string>();
  const [name, setName] = useState<string>();
  const [rows, setRows] = useState<{ row: number; field: string; message: string }[]>();
  const [msg, setMsg] = useState<string>();

  async function pick(file?: File) {
    setRows(undefined);
    setMsg(undefined);
    if (!file) return;
    if (file.size > 2_000_000) {
      setMsg("File is too large (max 2 MB)");
      return;
    }
    setText(await file.text());
    setName(file.name);
  }
  function run(dryRun: boolean) {
    if (!text) return;
    imp.mutate(
      { csv: text, dryRun },
      {
        onSuccess: (r) => {
          setRows(undefined);
          if (r.dryRun) setMsg(`All ${r.validRows} rows look good. Import them as drafts?`);
          else {
            toast.success(`Imported ${r.created.length} listings as drafts`);
            setMsg(undefined);
            setText(undefined);
            setName(undefined);
          }
        },
        onError: (e) => {
          const d =
            e instanceof ApiError
              ? (e.details as
                  { rows?: { row: number; field: string; message: string }[] } | undefined)
              : undefined;
          setRows(d?.rows);
          setMsg(e.message);
        },
      },
    );
  }
  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv" }));
    a.download = "oohrena-inventory-template.csv";
    a.click();
  }

  return (
    <KCard
      title="Bulk import (CSV)"
      right={
        <button
          onClick={download}
          className="text-[12px] text-saffron-deep font-semibold hover:underline"
        >
          Download template
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="h-9 px-3 rounded-lg border border-line bg-card text-[12px] font-semibold flex items-center gap-2 cursor-pointer">
            <Upload size={14} />
            {name ?? "Choose CSV file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          <Btn
            variant="secondary"
            className="h-9 px-3 text-[12px]"
            disabled={!text || imp.isPending}
            onClick={() => run(true)}
          >
            Check file
          </Btn>
          <Btn
            variant="dark"
            className="h-9 px-3 text-[12px]"
            disabled={!text || imp.isPending}
            onClick={() => run(false)}
          >
            {imp.isPending ? "Working…" : "Import"}
          </Btn>
        </div>
        {msg && (
          <p className={rows?.length || imp.isError ? "text-destructive" : "text-verified"}>
            {msg}
          </p>
        )}
        {!!rows?.length && (
          <div className="max-h-56 overflow-y-auto border border-line rounded-lg">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-mute border-b border-line">
                  <th className="font-normal px-3 py-2">Row</th>
                  <th className="font-normal px-3 py-2">Field</th>
                  <th className="font-normal px-3 py-2">Problem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.row}</td>
                    <td className="px-3 py-1.5 font-mono">{r.field}</td>
                    <td className="px-3 py-1.5">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </KCard>
  );
}
