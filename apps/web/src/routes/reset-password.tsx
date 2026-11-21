import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { resetPasswordInput } from "@oohrena/shared";
import { api } from "@/lib/api";
import { AuthShell, Field, FormError } from "@/components/app/AuthShell";
import { Btn } from "@/components/app/kit";

/** Opened from the password-reset email and from staff invite emails (`?token=…`). */
export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>): { token?: string } =>
    typeof s["token"] === "string" && s["token"] ? { token: s["token"] } : {},
  head: () => ({ meta: [{ title: "Set a new password — OOHRENA" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reset = useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api<{ message: string }>("/auth/reset-password", { method: "POST", body }),
  });

  const signIn = (
    <Link to="/login" className="text-saffron-deep font-semibold hover:underline">
      Go to sign in
    </Link>
  );

  if (!token) {
    return (
      <AuthShell
        title="Link incomplete"
        sub="This password link is missing its code. Open the link from your email again, or request a new one."
        footer={signIn}
      >
        <Link to="/forgot-password">
          <Btn className="w-full">Request a new link</Btn>
        </Link>
      </AuthShell>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthShell title="Password updated" sub={reset.data.message} footer={signIn}>
        <p className="text-[13px] text-mute">
          For your security, every device that was signed in to this account has been signed out.
        </p>
      </AuthShell>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = resetPasswordInput.safeParse({ token, password: form.password });
    const next: Record<string, string> = {};
    if (!parsed.success) {
      next["password"] =
        parsed.error.flatten().fieldErrors.password?.[0] ?? "Choose a stronger password";
    }
    if (form.password !== form.confirm) next["confirm"] = "Passwords don't match";
    setErrors(next);
    if (parsed.success && !next["confirm"]) reset.mutate(parsed.data);
  }

  return (
    <AuthShell
      title="Set a new password"
      sub="Use at least 10 characters with upper and lower case letters, a number and a symbol."
      footer={signIn}
    >
      <FormError
        message={
          reset.error
            ? `${reset.error.message}. If the link has expired, request a new one from “Forgot password”.`
            : undefined
        }
      />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          error={errors["password"]}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Field
          id="confirm"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          error={errors["confirm"]}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
        />
        <Btn type="submit" className="w-full" disabled={reset.isPending}>
          {reset.isPending ? "Saving…" : "Save new password"}
        </Btn>
      </form>
    </AuthShell>
  );
}
