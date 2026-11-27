import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  registerClientInput,
  registerVendorInput,
  SELECTABLE_VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABEL,
  type SelectableVendorCategory,
} from "@oohrena/shared";
import type { ZodError } from "zod";
import { ApiError } from "@/lib/api";
import { ROLE_HOME, useRegisterClient, useRegisterVendor } from "@/lib/auth";
import { AuthShell, Field, FormError } from "@/components/app/AuthShell";
import { Btn, Pill } from "@/components/app/kit";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getSavedReferralCode } from "@/lib/referral-capture";

type Kind = "client" | "vendor";

export const Route = createFileRoute("/register")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { as?: Kind | undefined; ref?: string | undefined } => ({
    as: s["as"] === "vendor" ? "vendor" : undefined,
    ref: typeof s["ref"] === "string" ? s["ref"].trim().toUpperCase() : undefined,
  }),
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
  const { as, ref: searchRef } = Route.useSearch();
  const kind: Kind = as ?? "client";
  const nav = useNavigate();
  const regClient = useRegisterClient();
  const regVendor = useRegisterVendor();
  const [f, setF] = useState(EMPTY);
  const [categories, setCategories] = useState<SelectableVendorCategory[]>([]);
  const [refCode, setRefCode] = useState(searchRef || "");
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const pending = regClient.isPending || regVendor.isPending;

  useEffect(() => {
    if (!refCode) {
      const saved = getSavedReferralCode();
      if (saved) setRefCode(saved);
    }
  }, [refCode]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  function toggleCategory(cat: SelectableVendorCategory) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  function onApiError(err: Error) {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
      setErrors(firstErrors(err.fieldErrors));
    else if (err instanceof ApiError && err.code === "CONFLICT") {
      const field = (err.details as { field?: string } | undefined)?.field;
      if (field === "email" || field === "mobile") setErrors({ [field]: err.message });
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
      ref: refCode.trim() ? refCode.trim().toUpperCase() : undefined,
    };

    if (kind === "client") {
      const p = registerClientInput.safeParse({
        ...common,
        ...(f.companyName.trim() ? { companyName: f.companyName } : {}),
        ...(f.gstin.trim() ? { gstin: f.gstin } : {}),
      });
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
        city: f.city,
        categories,
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
            label="Company name (optional)"
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
          <Field
            id="city"
            label="City"
            autoComplete="address-level2"
            value={f.city}
            error={errors["city"]}
            onChange={set("city")}
          />
        )}

        {kind === "client" && (
          <Field
            id="gstin"
            label="GSTIN (optional)"
            autoCapitalize="characters"
            value={f.gstin}
            error={errors["gstin"]}
            onChange={set("gstin")}
          />
        )}

        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={f.password}
          error={errors["password"]}
          onChange={set("password")}
        />

        {/* Partner categories (Vendor only, PDF §B) */}
        {kind === "vendor" && (
          <div className="sm:col-span-2 rounded-lg border border-line p-3.5 bg-canvas">
            <p className="text-[13px] font-semibold text-ink mb-2">
              What you do (choose at least one)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SELECTABLE_VENDOR_CATEGORIES.map((cat) => {
                const checked = categories.includes(cat);
                return (
                  <label
                    key={cat}
                    className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleCategory(cat)} />
                    <span>{VENDOR_CATEGORY_LABEL[cat]}</span>
                  </label>
                );
              })}
            </div>
            {errors["categories"] && (
              <p className="text-[12px] text-destructive mt-1.5">{errors["categories"]}</p>
            )}
          </div>
        )}

        {/* Referral code */}
        <div className="sm:col-span-2">
          {refCode && /^OOH-[A-Z0-9]{6}$/.test(refCode) ? (
            <div className="flex items-center justify-between rounded-md border border-line bg-muted/30 px-3 py-2 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="text-mute">Referral code:</span>
                <Pill tone="verified">{refCode}</Pill>
              </div>
              <button
                type="button"
                onClick={() => setRefCode("")}
                className="text-[12px] text-mute hover:text-ink hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <Field
              id="ref"
              label="Referral code (optional)"
              autoCapitalize="characters"
              placeholder="OOH-XXXXXX"
              value={refCode}
              error={errors["ref"]}
              onChange={(e) => setRefCode(e.target.value.toUpperCase())}
            />
          )}
        </div>

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
