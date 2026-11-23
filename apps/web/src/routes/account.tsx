import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { changePasswordInput } from "@oohrena/shared";
import { Btn, KCard, Loading, Pill, Row } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { TwoFactorSetup } from "@/components/app/TwoFactorSetup";
import { ROLE_LABEL, useChangePassword, useSession, useTwoFactor } from "@/lib/auth";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — OOHRENA" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { data: user } = useSession();
  if (!user) return <Loading />;
  return (
    <main className="max-w-[720px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <h1 className="text-[22px] font-semibold">Account</h1>
      <KCard title="Profile" bodyClass="px-5 divide-y divide-line">
        <Row k="Name" v={user.fullName} />
        <Row k="Email" v={user.email} />
        <Row k="Role" v={ROLE_LABEL[user.role]} />
        <Row k="User ID" v={<span className="font-mono">{user.userId}</span>} />
      </KCard>
      <TwoFactorCard enabled={!!user.twoFactorEnabled} />
      <PasswordCard />
    </main>
  );
}

function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const tf = useTwoFactor();
  const [mode, setMode] = useState<"idle" | "setup" | "disable">("idle");
  const [f, setF] = useState({ password: "", code: "" });
  const [error, setError] = useState<string>();

  return (
    <KCard
      title="Two-factor"
      right={<Pill tone={enabled ? "verified" : "neutral"}>{enabled ? "On" : "Off"}</Pill>}
    >
      {mode === "setup" ? (
        <TwoFactorSetup
          start={() => tf.setup.mutateAsync()}
          verify={(code) =>
            tf.verify.mutateAsync(code).then(() => {
              toast.success("Two-factor is on");
              setMode("idle");
            })
          }
          busy={tf.verify.isPending}
        />
      ) : mode === "disable" ? (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            tf.disable.mutate(f, {
              onSuccess: () => {
                toast.success("Two-factor is off");
                setF({ password: "", code: "" });
                setMode("idle");
              },
              onError: (err) => setError(err.message),
            });
          }}
        >
          <FormError message={error} />
          <Field
            id="tf-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
          <Field
            id="tf-code"
            label="Code or recovery code"
            autoComplete="one-time-code"
            value={f.code}
            onChange={(e) => setF({ ...f, code: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="secondary" onClick={() => setMode("idle")}>
              Back
            </Btn>
            <Btn type="submit" variant="danger" disabled={tf.disable.isPending}>
              Turn off
            </Btn>
          </div>
        </form>
      ) : enabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px]">Sign-in asks for a code from your app.</span>
          <Btn size="sm" variant="secondary" onClick={() => setMode("disable")}>
            Turn off
          </Btn>
        </div>
      ) : (
        <div className="flex justify-end">
          <Btn size="sm" onClick={() => setMode("setup")}>
            Turn on
          </Btn>
        </div>
      )}
    </KCard>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const [f, setF] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  return (
    <KCard title="Password">
      <form
        noValidate
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(undefined);
          const p = changePasswordInput.safeParse(f);
          if (!p.success) {
            const fe = p.error.flatten().fieldErrors;
            return setErrors(
              Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? ""])),
            );
          }
          setErrors({});
          change.mutate(p.data, {
            onSuccess: () => {
              toast.success("Password changed. Other devices are signed out.");
              setF({ currentPassword: "", newPassword: "" });
            },
            onError: (err) => setFormError(err.message),
          });
          return undefined;
        }}
      >
        <FormError message={formError} />
        <Field
          id="pw-current"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={f.currentPassword}
          error={errors["currentPassword"]}
          onChange={(e) => setF({ ...f, currentPassword: e.target.value })}
        />
        <Field
          id="pw-new"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={f.newPassword}
          error={errors["newPassword"]}
          onChange={(e) => setF({ ...f, newPassword: e.target.value })}
        />
        <div className="flex justify-end">
          <Btn type="submit" disabled={change.isPending}>
            {change.isPending ? "Saving…" : "Change password"}
          </Btn>
        </div>
      </form>
    </KCard>
  );
}
