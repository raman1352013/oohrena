import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { forgotPasswordInput } from "@oohrena/shared";
import { api } from "@/lib/api";
import { AuthShell, Field, FormError } from "@/components/app/AuthShell";
import { Btn } from "@/components/app/kit";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — OOHRENA" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const send = useMutation({
    mutationFn: (body: { email: string }) =>
      api<{ message: string }>("/auth/forgot-password", { method: "POST", body }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordInput.safeParse({ email });
    if (!parsed.success) {
      setError("Enter a valid email address");
      return;
    }
    setError(undefined);
    send.mutate(parsed.data);
  }

  const footer = (
    <Link to="/login" className="text-saffron-deep font-semibold hover:underline">
      Back to sign in
    </Link>
  );

  if (send.isSuccess) {
    return (
      <AuthShell title="Check your email" sub={send.data.message} footer={footer}>
        <p className="text-[13px] text-mute">
          The link is valid for 1 hour. If nothing arrives in a few minutes, check your spam
          folder or request a new link.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      sub="Enter the email you sign in with. We'll send you a link to choose a new password."
      footer={footer}
    >
      <FormError message={send.error?.message} />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          error={error}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Btn type="submit" className="w-full" disabled={send.isPending}>
          {send.isPending ? "Sending…" : "Send reset link"}
        </Btn>
      </form>
    </AuthShell>
  );
}
