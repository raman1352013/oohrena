import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { registerClientInput, registerVendorInput } from "@oohrena/shared";
import type { ZodError } from "zod";
import { ApiError } from "@/lib/api";
import { ROLE_HOME, useRegisterClient, useRegisterVendor } from "@/lib/auth";
import { AuthShell, Field, FormError } from "@/components/app/AuthShell";
import { Btn } from "@/components/app/kit";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Kind = "client" | "vendor";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>): { as?: Kind } =>
    s["as"] === "vendor" ? { as: "vendor" } : {},
  head: () => ({
    meta: [
      { title: "Create account — OOHRENA" },
      { name: "description", content: "Register as an advertiser or a media owner on OOHRENA." },
    ],
  }),
  component: RegisterPage,
});

const EMPTY = {
  fullName: "",
  email: "",
  mobile: "",
  password: "",
  companyName: "",
  legalName: "",
  pan: "",
  gstin: "",
  city: "",
};

function firstErrors(fe: Record<string, string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(fe)
      .filter(([, v]) => v?.length)
      .map(([k, v]) => [k, v![0]!]),
  );
}

function RegisterPage() {
  const { as } = Route.useSearch();
  const kind: Kind = as ?? "client";
  const nav = useNavigate();
  const regClient = useRegisterClient();
  const regVendor = useRegisterVendor();
  const [f, setF] = useState(EMPTY);
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const pending = regClient.isPending || regVendor.isPending;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  function onApiError(err: Error) {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
      setErrors(firstErrors(err.fieldErrors));
    else if (err instanceof ApiError && err.code === "CONFLICT") {
      const field = (err.details as { field?: string } | undefined)?.field;
      if (field === "email" || field === "mobile" || field === "pan")
        setErrors({ [field]: err.message });
      else setFormError(err.message);
    } else setFormError(err.message);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const common = {
      fullName: f.fullName,
      email: f.email,
      mobile: f.mobile,
      password: f.password,
      acceptTerms: accept,
      ...(f.gstin.trim() ? { gstin: f.gstin } : {}),
    };
    if (kind === "client") {
      const p = registerClientInput.safeParse({ ...common, companyName: f.companyName });
      if (!p.success) return setErrors(firstErrors((p.error as ZodError).flatten().fieldErrors));
      setErrors({});
      regClient.mutate(p.data, {
        onSuccess: (r) => {
          toast.success("Account created");
          void nav({ to: ROLE_HOME[r.user.role], replace: true });
        },
        onError: onApiError,
      });
    } else {
      const p = registerVendorInput.safeParse({
        ...common,
        legalName: f.legalName,
        pan: f.pan,
        city: f.city,
      });
      if (!p.success) return setErrors(firstErrors((p.error as ZodError).flatten().fieldErrors));
      setErrors({});
      regVendor.mutate(p.data, {
        onSuccess: (r) => {
          toast.success(`Registered as ${r.vendorId}. Your KYC is pending admin review.`);
          void nav({ to: ROLE_HOME[r.user.role], replace: true });
        },
        onError: onApiError,
      });
    }
    return undefined;
  }

  return (
    <AuthShell
      wide
      title="Create your account"
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="text-saffron-deep font-semibold hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div
        className="grid grid-cols-2 rounded-lg bg-muted p-1 mb-6 text-[13px]"
        role="tablist"
        aria-label="Account type"
      >
        {(["client", "vendor"] as const).map((k) => (
          <Link
            key={k}
            to="/register"
            search={k === "vendor" ? { as: "vendor" as const } : {}}
            replace
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setErrors({});
              setFormError(undefined);
            }}
            className={cn(
              "h-9 rounded-md grid place-items-center font-semibold",
              kind === k ? "bg-card text-ink shadow-sm" : "text-mute",
            )}
          >
            {k === "client" ? "Advertiser / Agency" : "Media owner / Vendor"}
          </Link>
        ))}
      </div>

      <FormError message={formError} />
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field
          id="fullName"
          label="Your full name"
          autoComplete="name"
          value={f.fullName}
          error={errors["fullName"]}
          onChange={set("fullName")}
        />
        {kind === "client" ? (
          <Field
            id="companyName"
            label="Company name"
            autoComplete="organization"
            value={f.companyName}
            error={errors["companyName"]}
            onChange={set("companyName")}
          />
        ) : (
          <Field
            id="legalName"
            label="Registered business name"
            autoComplete="organization"
            value={f.legalName}
            error={errors["legalName"]}
            onChange={set("legalName")}
          />
        )}
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          value={f.email}
          error={errors["email"]}
          onChange={set("email")}
        />
        <Field
          id="mobile"
          label="Mobile"
          type="tel"
          autoComplete="tel"
          value={f.mobile}
          error={errors["mobile"]}
          onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/[\s-]/g, "") })}
        />
        {kind === "vendor" && (
          <>
            <Field
              id="pan"
              label="PAN"
              autoCapitalize="characters"
              value={f.pan}
              error={errors["pan"]}
              onChange={set("pan")}
            />
            <Field
              id="city"
              label="City"
              autoComplete="address-level2"
              value={f.city}
              error={errors["city"]}
              onChange={set("city")}
            />
          </>
        )}
        <Field
          id="gstin"
          label="GSTIN"
          autoCapitalize="characters"
          value={f.gstin}
          error={errors["gstin"]}
          onChange={set("gstin")}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={f.password}
          error={errors["password"]}
          onChange={set("password")}
        />

        <div className="sm:col-span-2">
          <label className="flex items-start gap-3 text-[13px] text-ink cursor-pointer">
            <Checkbox
              checked={accept}
              onCheckedChange={(v) => setAccept(v === true)}
              className="mt-0.5"
              aria-invalid={!!errors["acceptTerms"]}
            />
            <span>
              I accept the Privacy Policy, Terms of Use and the Confidentiality &amp;
              Anti-circumvention Agreement (v1.0).
            </span>
          </label>
          {errors["acceptTerms"] && (
            <p className="text-[12px] text-destructive mt-1.5">{errors["acceptTerms"]}</p>
          )}
        </div>

        <Btn type="submit" className="sm:col-span-2 w-full" disabled={pending}>
          {pending
            ? "Creating account…"
            : kind === "client"
              ? "Create advertiser account"
              : "Register as vendor"}
        </Btn>
      </form>
    </AuthShell>
  );
}
