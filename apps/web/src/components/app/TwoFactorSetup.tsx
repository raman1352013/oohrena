import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Btn, Loading } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import type { TwoFactorSetupData } from "@/lib/auth";

/**
 * Scan the QR (or type the key), keep the recovery codes, then prove it with a 6-digit code.
 * Used for first sign-in enrolment and for turning 2FA on from the Account page.
 */
export function TwoFactorSetup({
  start,
  verify,
  busy,
}: {
  start: () => Promise<TwoFactorSetupData>;
  verify: (code: string) => Promise<unknown>;
  busy: boolean;
}) {
  const [data, setData] = useState<TwoFactorSetupData>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    start()
      .then(setData)
      .catch((e: Error) => setError(e.message));
    // Start once per mount: a new start would issue a new secret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return error ? <FormError message={error} /> : <Loading />;
  const secret = new URL(data.uri).searchParams.get("secret") ?? "";

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(data!.recoveryCodes.join("\n"));
      toast.success("Recovery codes copied");
    } catch {
      toast.error("Copy failed; select the codes instead");
    }
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your app");
        verify(code.trim()).catch((err: Error) => setError(err.message));
        return undefined;
      }}
    >
      <FormError message={error} />
      <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
        <img
          src={data.qrDataUrl}
          alt="QR code for your authenticator app"
          width={168}
          height={168}
          className="rounded-lg border border-line bg-white p-2 shrink-0"
        />
        <div className="space-y-2 min-w-0 text-[13px] w-full">
          <div className="text-mute">Key</div>
          <code className="block break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[12px]">
            {secret}
          </code>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium">Recovery codes (shown once)</span>
          <button
            type="button"
            onClick={() => void copyCodes()}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-saffron-deep hover:underline"
          >
            <Copy size={12} /> Copy
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-3 font-mono text-[12px] select-all">
          {data.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      <Field
        id="totp-setup"
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <Btn type="submit" className="w-full" disabled={busy}>
        {busy ? "Checking…" : "Turn on two-factor"}
      </Btn>
    </form>
  );
}
