import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loginInput } from "@oohrena/shared";
import { ApiError } from "@/lib/api";
import { ROLE_HOME, rolesFor, safeRedirect, useLogin, useLogin2FA, useSession } from "@/lib/auth";
import { AuthShell, Field, FormError } from "@/components/app/AuthShell";
import { Btn } from "@/components/app/kit";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const r = safeRedirect(s["redirect"]);
    return r ? { redirect: r } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — OOHRENA" },
      { name: "description", content: "Sign in to your OOHRENA workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const nav = useNavigate();
  const session = useSession();
  const login = useLogin();
  const login2FA = useLogin2FA();
  const [form, setForm] = useState({ email: "", password: "" });
  const [challenge, setChallenge] = useState<{ token: string; email: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  // Already signed in → go straight to the right workspace.
  useEffect(() => {
    const u = session.data;
    if (!u) return;
    const allowed = redirect ? rolesFor(redirect) : null;
    void nav({
      to: redirect && (!allowed || allowed.includes(u.role)) ? redirect : ROLE_HOME[u.role],
      replace: true,
    });
  }, [session.data, redirect, nav]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = loginInput.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      setErrors({
        ...(fe.email ? { email: "Enter a valid email address" } : {}),
        ...(fe.password ? { password: "Enter your password" } : {}),
      });
      return;
    }
    setErrors({});
    login.mutate(parsed.data, {
      onSuccess: (r) => {
        if (r.status === "2FA_REQUIRED" && r.challengeToken) {
          setChallenge({ token: r.challengeToken, email: r.email || form.email });
        }
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "ACCOUNT_LOCKED") {
          const mins = Math.ceil(
            ((err.details as { retryAfterSec?: number })?.retryAfterSec ?? 900) / 60,
          );
          setFormError(
            `Too many failed attempts. This account is locked for about ${mins} minute${mins === 1 ? "" : "s"}.`,
          );
        } else setFormError(err.message);
      },
    });
  }

  function submit2FA(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (!totpCode.trim()) {
      setErrors({ code: "Enter your 2FA verification or recovery code" });
      return;
    }
    setErrors({});
    login2FA.mutate(
      { challengeToken: challenge!.token, code: totpCode.trim() },
      {
        onError: (err) => setFormError(err.message),
      },
    );
  }

  if (challenge) {
    return (
      <AuthShell
        title="Two-Factor Authentication"
        sub={`Enter the code from your authenticator app for ${challenge.email}.`}
        footer={
          <button
            type="button"
            onClick={() => {
              setChallenge(null);
              setTotpCode("");
            }}
            className="text-saffron-deep font-semibold hover:underline"
          >
            Back to password sign in
          </button>
        }
      >
        <FormError message={formError} />
        <form onSubmit={submit2FA} noValidate className="space-y-4">
          <Field
            id="totp"
            label="Verification Code / Recovery Code"
            type="text"
            placeholder="6-digit code or XXXX-XXXX"
            autoComplete="one-time-code"
            value={totpCode}
            error={errors["code"]}
            onChange={(e) => setTotpCode(e.target.value)}
          />
          <Btn type="submit" className="w-full" disabled={login2FA.isPending}>
            {login2FA.isPending ? "Verifying…" : "Verify & Sign in"}
          </Btn>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      sub="Clients, vendors, partners and OOHRENA staff all sign in here."
      footer={
        <>
          New to OOHRENA?{" "}
          <Link to="/register" className="text-saffron-deep font-semibold hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <FormError message={formError} />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          error={errors["email"]}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          error={errors["password"]}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <div className="text-right -mt-2">
          <Link
            to="/forgot-password"
            className="text-[12px] text-saffron-deep font-semibold hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Btn type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Btn>
      </form>
    </AuthShell>
  );
}
