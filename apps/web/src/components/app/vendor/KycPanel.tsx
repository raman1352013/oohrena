import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Upload } from "lucide-react";
import {
  KYC_DOC_LABEL,
  KYC_DOC_TYPES,
  MAX_DOC_BYTES,
  vendorBankInput,
  type KycDocType,
} from "@oohrena/shared";
import { ApiError, assetUrl } from "@/lib/api";
import { useResubmitKyc, useSaveBank, useUploadKycDoc, type VendorMe } from "@/lib/inventory-api";
import { Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { KycPill } from "@/components/app/status";
import { fmtDate, selectCls } from "@/lib/format";
import { Label } from "@/components/ui/label";

export function KycPanel({ me }: { me: VendorMe }) {
  const upload = useUploadKycDoc();
  const resubmit = useResubmitKyc();
  const [type, setType] = useState<KycDocType>(me.missingDocuments[0] ?? "pan");
  const [file, setFile] = useState<File>();
  const [err, setErr] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = me.kycStatus === "approved" || me.kycStatus === "suspended";

  function send(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!file) return setErr("Choose a file to upload");
    if (file.size > MAX_DOC_BYTES) return setErr("File is too large (max 5 MB)");
    upload.mutate(
      { type, file },
      {
        onSuccess: () => {
          toast.success(`${KYC_DOC_LABEL[type]} uploaded`);
          setFile(undefined);
          if (fileRef.current) fileRef.current.value = "";
        },
        onError: (e) => setErr(e.message),
      },
    );
    return undefined;
  }

  return (
    <KCard title="KYC" right={<KycPill status={me.kycStatus} />}>
      <div className="space-y-4">
        {me.kycStatus === "pending" && (
          <p className="text-mute">
            {me.missingDocuments.length ? (
              <>
                Missing:{" "}
                <b className="text-ink">
                  {me.missingDocuments.map((t) => KYC_DOC_LABEL[t]).join(", ")}
                </b>
              </>
            ) : (
              "In review"
            )}
          </p>
        )}
        {me.kycStatus === "rejected" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
            <div className="font-semibold">KYC was rejected</div>
            <div className="mt-0.5">Reason: {me.kycReason}</div>
            <div className="mt-1 text-[12px]">Upload corrected documents below, then resubmit.</div>
          </div>
        )}
        {me.kycStatus === "suspended" && (
          <p className="text-destructive">
            Your account is suspended{me.kycReason ? `: ${me.kycReason}` : ""}. Your listings are
            hidden from clients.
          </p>
        )}

        <div className="divide-y divide-line border border-line rounded-lg">
          {me.documents.length ? (
            me.documents.map((d) => (
              <div key={d.docId} className="px-3 py-2.5 flex items-center gap-3">
                <FileText size={16} className="text-mute shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{KYC_DOC_LABEL[d.type]}</div>
                  <div className="text-[12px] text-mute">Uploaded {fmtDate(d.uploadedAt)}</div>
                </div>
                <Pill
                  tone={
                    d.status === "verified"
                      ? "verified"
                      : d.status === "rejected"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {d.status === "verified"
                    ? "Verified"
                    : d.status === "rejected"
                      ? "Rejected"
                      : "Uploaded"}
                </Pill>
                <a
                  href={assetUrl(`/api/v1/files/${d.fileId}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-saffron-deep font-semibold hover:underline"
                >
                  View
                </a>
              </div>
            ))
          ) : (
            <Empty title="No documents" />
          )}
        </div>

        {!locked && (
          <form onSubmit={send} className="grid sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="docType" className="text-[13px]">
                Document
              </Label>
              <select
                id="docType"
                className={selectCls}
                value={type}
                onChange={(e) => setType(e.target.value as KycDocType)}
              >
                {KYC_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {KYC_DOC_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docFile" className="text-[13px]">
                File (PDF, JPG or PNG, max 5 MB)
              </Label>
              <input
                id="docFile"
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setFile(e.target.files?.[0])}
                className="block w-full text-[13px] file:mr-3 file:h-11 file:px-4 file:rounded-lg file:border file:border-line file:bg-card file:text-ink file:font-semibold"
              />
            </div>
            <Btn type="submit" variant="dark" disabled={upload.isPending}>
              <Upload size={15} />
              {upload.isPending ? "Uploading…" : "Upload"}
            </Btn>
            {err && <p className="sm:col-span-3 text-[12px] text-destructive">{err}</p>}
          </form>
        )}
        {me.kycStatus === "rejected" && (
          <Btn
            onClick={() =>
              resubmit.mutate(undefined, {
                onSuccess: () => toast.success("KYC resubmitted for review"),
                onError: (e) => toast.error(e.message),
              })
            }
            disabled={resubmit.isPending}
          >
            Resubmit for review
          </Btn>
        )}
      </div>
    </KCard>
  );
}

export function BankPanel({ me }: { me: VendorMe }) {
  const save = useSaveBank();
  const [edit, setEdit] = useState(!me.bank);
  const [f, setF] = useState({
    accountName: me.bank?.accountName ?? "",
    accountNo: "",
    ifsc: me.bank?.ifsc ?? "",
    bankName: me.bank?.bankName ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const p = vendorBankInput.safeParse({ ...f, bankName: f.bankName || undefined });
    if (!p.success)
      return setErrors(
        Object.fromEntries(
          Object.entries(p.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""]),
        ),
      );
    setErrors({});
    save.mutate(p.data, {
      onSuccess: () => {
        toast.success("Bank details saved");
        setEdit(false);
        setF((x) => ({ ...x, accountNo: "" }));
      },
      onError: (err) =>
        err instanceof ApiError && Object.keys(err.fieldErrors).length
          ? setErrors(
              Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? ""])),
            )
          : setFormError(err.message),
    });
    return undefined;
  }

  return (
    <KCard
      title="Payout bank account"
      right={
        me.bank && !edit ? (
          <Btn variant="secondary" className="h-8 px-3 text-[12px]" onClick={() => setEdit(true)}>
            Change
          </Btn>
        ) : undefined
      }
    >
      {me.bank && !edit ? (
        <div className="grid grid-cols-2 gap-y-2 gap-x-6">
          <div className="text-mute">Account holder</div>
          <div className="font-medium">{me.bank.accountName}</div>
          <div className="text-mute">Account number</div>
          <div className="font-mono">{me.bank.accountNo}</div>
          <div className="text-mute">IFSC</div>
          <div className="font-mono">{me.bank.ifsc}</div>
          <div className="text-mute">Status</div>
          <div>
            {me.bank.verified ? (
              <Pill tone="verified">Verified by finance</Pill>
            ) : (
              <Pill tone="hold">Awaiting finance verification</Pill>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid sm:grid-cols-2 gap-3">
          {formError && (
            <div className="sm:col-span-2">
              <FormError message={formError} />
            </div>
          )}
          <Field
            id="accountName"
            label="Account holder name"
            value={f.accountName}
            error={errors["accountName"]}
            onChange={(e) => setF({ ...f, accountName: e.target.value })}
          />
          <Field
            id="bankName"
            label="Bank name"
            value={f.bankName}
            onChange={(e) => setF({ ...f, bankName: e.target.value })}
          />
          <Field
            id="accountNo"
            label="Account number"
            inputMode="numeric"
            autoComplete="off"
            value={f.accountNo}
            error={errors["accountNo"]}
            onChange={(e) => setF({ ...f, accountNo: e.target.value.replace(/\s/g, "") })}
          />
          <Field
            id="ifsc"
            label="IFSC"
            autoCapitalize="characters"
            value={f.ifsc}
            error={errors["ifsc"]}
            onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })}
          />
          <div className="sm:col-span-2 flex gap-2">
            <Btn type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save bank details"}
            </Btn>
            {me.bank && (
              <Btn type="button" variant="secondary" onClick={() => setEdit(false)}>
                Cancel
              </Btn>
            )}
          </div>
        </form>
      )}
    </KCard>
  );
}
