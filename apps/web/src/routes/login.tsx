import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loginInput } from "@oohrena/shared";
import { ApiError } from "@/lib/api";
import { ROLE_HOME, rolesFor, safeRedirect, useLogin, useSession } from "@/lib/auth";
import { AuthShell, Field, FormError } from "@/components/app/AuthShell";
import { Btn } from "@/components/app/kit";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const r = safeRedirect(s["redirect"]);
    return r ? { redirect: r } : {};
  },
  head: () => ({ meta: [{ title: "Sign in — OOHRENA" }, { name: "description", content: "Sign in to your OOHRENA workspace." }] }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const nav = useNavigate();
  const session = useSession();
  const login = useLogin();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  // Already signed in → go straight to the right workspace.
  useEffect(() => {
    const u = session.data;
    if (!u) return;
    const allowed = redirect ? rolesFor(redirect) : null;
    void nav({ to: redirect && (!allowed || allowed.includes(u.role)) ? redirect : ROLE_HOME[u.role], replace: true });
  }, [session.data, redirect, nav]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = loginInput.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      setErrors({ ...(fe.email ? { email: "Enter a valid email address" } : {}), ...(fe.password ? { password: "Enter your password" } : {}) });
      return;
    }
    setErrors({});
    login.mutate(parsed.data, {
      onError: (err) => {
        if (err instanceof ApiError && err.code === "ACCOUNT_LOCKED") {
          const mins = Math.ceil(((err.details as { retryAfterSec?: number })?.retryAfterSec ?? 900) / 60);
          setFormError(`Too many failed attempts. This account is locked for about ${mins} minute${mins === 1 ? "" : "s"}.`);
        } else setFormError(err.message);
      },
    });
  }

  return (
    <AuthShell
      title="Sign in"
      sub="Clients, vendors, partners and OOHRENA staff all sign in here."
      footer={<>New to OOHRENA? <Link to="/register" className="text-saffron-deep font-semibold hover:underline">Create an account</Link></>}
    >
      <FormError message={formError} />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field id="email" label="Email" type="email" autoComplete="email" value={form.email} error={errors["email"]} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" value={form.password} error={errors["password"]} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Btn type="submit" className="w-full" disabled={login.isPending}>{login.isPending ? "Signing in…" : "Sign in"}</Btn>
      </form>
    </AuthShell>
  );
}
