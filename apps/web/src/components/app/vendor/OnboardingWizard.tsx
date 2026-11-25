import { useState, useId, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import {
  AVAILABILITY_UPDATE_FREQUENCIES,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABEL,
  COMMUNICATION_LANGUAGES,
  DECLARATION_ITEMS,
  EXECUTION_SERVICES,
  EXECUTION_SERVICE_LABEL,
  INDIAN_STATES,
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABEL,
  WIZARD_STEPS,
  WIZARD_STEP_LABEL,
  type OnboardingBusinessInput,
  type OnboardingCategoryInput,
  type OnboardingDeclarationInput,
  type OnboardingExecutionInput,
  type OnboardingSlaInput,
  type OnboardingStep,
  type OnboardingTerritoryInput,
  type WizardStep,
} from "@oohrena/shared";
import { ApiError } from "@/lib/api";
import { useVendorMe } from "@/lib/inventory-api";
import {
  useOnboarding,
  useSaveStep,
  useSubmitOnboarding,
} from "@/lib/vendor-onboarding-api";
import { Btn, KCard, Loading, Pill } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { BankPanel, KycPanel } from "./KycPanel";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { selectCls } from "@/lib/format";
import { cn } from "@/lib/utils";

interface OnboardingWizardProps {
  onSubmitted?: ((result: any) => void) | undefined;
}

export function OnboardingWizard({ onSubmitted }: OnboardingWizardProps) {
  const meQuery = useVendorMe();
  const onboardingQuery = useOnboarding();
  const [activeStep, setActiveStep] = useState<WizardStep>("business");

  if (meQuery.isPending || onboardingQuery.isPending) return <Loading />;
  if (meQuery.isError) return <div className="p-8 text-destructive">{meQuery.error.message}</div>;
  if (onboardingQuery.isError) return <div className="p-8 text-destructive">{onboardingQuery.error.message}</div>;

  const me = meQuery.data;
  const state = onboardingQuery.data;

  // Find prerequisite steps that are missing before declaration
  const prereqSteps: WizardStep[] = ["business", "category", "territory", "execution", "sla", "documents", "bank"];
  const missingPrereqs = prereqSteps.filter((s) => !state.steps[s]);

  const stepIndex = WIZARD_STEPS.indexOf(activeStep);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1;

  function goNext() {
    if (stepIndex < WIZARD_STEPS.length - 1) {
      setActiveStep(WIZARD_STEPS[stepIndex + 1]!);
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setActiveStep(WIZARD_STEPS[stepIndex - 1]!);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto py-6 px-4 md:px-8 space-y-6">
      {/* Wizard Header Banner */}
      <div className="bg-card border border-line rounded-xl p-5 md:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-[18px] text-ink">{me.legalName}</span>
            <Pill tone="saffron">Onboarding Setup</Pill>
          </div>
          <p className="text-mute text-[13px]">
            Complete all 8 steps to submit your verified profile for Central Admin review.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-mute font-medium mb-1">Progress</div>
          <div className="text-[15px] font-semibold text-ink tabular-nums">
            {Object.values(state.steps).filter(Boolean).length} / 8 Completed
          </div>
        </div>
      </div>

      {/* Main Stepper Layout */}
      <div className="md:grid md:grid-cols-[230px_minmax(0,1fr)] gap-6 items-start">
        {/* Left Step Navigator (Desktop) / Horizontal Bar (Mobile) */}
        <nav
          aria-label="Onboarding Steps"
          className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 [scrollbar-width:none] shrink-0"
        >
          {WIZARD_STEPS.map((s, idx) => {
            const isDone = state.steps[s];
            const isActive = activeStep === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActiveStep(s)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-[13px] transition whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-navy text-navy-foreground font-semibold shadow-sm"
                    : isDone
                      ? "bg-card text-ink hover:bg-canvas border border-line"
                      : "text-mute hover:text-ink hover:bg-card border border-transparent",
                )}
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                    isActive
                      ? "bg-white text-navy"
                      : isDone
                        ? "bg-verified/15 text-verified"
                        : "bg-muted text-mute",
                  )}
                >
                  {isDone ? <Check size={12} strokeWidth={3} /> : idx + 1}
                </span>
                <span className="truncate">{WIZARD_STEP_LABEL[s]}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Active Step Container */}
        <div className="min-w-0">
          {activeStep === "business" && (
            <BusinessStepForm
              defaultValues={state.data.business}
              legalNameFallback={me.legalName}
              cityFallback={me.city}
              panFallback={me.pan}
              onSaved={goNext}
            />
          )}

          {activeStep === "category" && (
            <CategoryStepForm
              defaultValues={state.data.category}
              categoriesFallback={me.categories}
              onSaved={goNext}
              onBack={goBack}
            />
          )}

          {activeStep === "territory" && (
            <TerritoryStepForm
              defaultValues={state.data.territory}
              cityFallback={me.city}
              onSaved={goNext}
              onBack={goBack}
            />
          )}

          {activeStep === "execution" && (
            <ExecutionStepForm
              defaultValues={state.data.execution}
              onSaved={goNext}
              onBack={goBack}
            />
          )}

          {activeStep === "sla" && (
            <SlaStepForm
              defaultValues={state.data.sla}
              onSaved={goNext}
              onBack={goBack}
            />
          )}

          {activeStep === "documents" && (
            <div className="space-y-5">
              <KycPanel me={me} />
              <div className="flex justify-between items-center pt-2">
                <Btn variant="secondary" onClick={goBack}>
                  <ArrowLeft size={15} /> Back
                </Btn>
                <Btn variant="primary" onClick={goNext}>
                  Next: Bank <ArrowRight size={15} />
                </Btn>
              </div>
            </div>
          )}

          {activeStep === "bank" && (
            <div className="space-y-5">
              <BankPanel me={me} />
              <div className="flex justify-between items-center pt-2">
                <Btn variant="secondary" onClick={goBack}>
                  <ArrowLeft size={15} /> Back
                </Btn>
                <Btn variant="primary" onClick={goNext}>
                  Next: Declaration <ArrowRight size={15} />
                </Btn>
              </div>
            </div>
          )}

          {activeStep === "declaration" && (
            <DeclarationStepForm
              missingPrereqs={missingPrereqs}
              onBack={goBack}
              onSubmitted={onSubmitted}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* 1. Step: Business Form                                                    */
/* ========================================================================= */
function BusinessStepForm({
  defaultValues,
  legalNameFallback,
  cityFallback,
  panFallback,
  onSaved,
}: {
  defaultValues?: OnboardingBusinessInput | undefined;
  legalNameFallback: string;
  cityFallback: string;
  panFallback?: string | null | undefined;
  onSaved: () => void;
}) {
  const saveMutation = useSaveStep("business");
  const [form, setForm] = useState<OnboardingBusinessInput>({
    legalName: defaultValues?.legalName ?? legalNameFallback,
    tradeName: defaultValues?.tradeName ?? "",
    designation: defaultValues?.designation ?? "Director",
    whatsapp: defaultValues?.whatsapp ?? "",
    website: defaultValues?.website ?? "",
    officeAddress: {
      line1: defaultValues?.officeAddress?.line1 ?? "",
      line2: defaultValues?.officeAddress?.line2 ?? "",
      city: defaultValues?.officeAddress?.city ?? cityFallback,
      district: defaultValues?.officeAddress?.district ?? cityFallback,
      stateCode: defaultValues?.officeAddress?.stateCode ?? "MP",
      pin: defaultValues?.officeAddress?.pin ?? "",
    },
    businessType: defaultValues?.businessType ?? "pvt_ltd",
    yearEstablished: defaultValues?.yearEstablished ?? 2018,
    pan: defaultValues?.pan ?? (panFallback || ""),
    gstin: defaultValues?.gstin ?? "",
    udyam: defaultValues?.udyam ?? "",
    language: defaultValues?.language ?? "english",
  });
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setFieldErrors({});

    const payload: OnboardingBusinessInput = {
      ...form,
      tradeName: form.tradeName ? form.tradeName : undefined,
      whatsapp: form.whatsapp ? form.whatsapp : undefined,
      website: form.website ? form.website : undefined,
      gstin: form.gstin ? form.gstin : undefined,
      udyam: form.udyam ? form.udyam : undefined,
      officeAddress: {
        ...form.officeAddress,
        line2: form.officeAddress.line2 ? form.officeAddress.line2 : undefined,
      },
    };

    saveMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("Business details saved");
        onSaved();
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          setError(err.message);
          setFieldErrors(err.fieldErrors);
        } else {
          setError(err.message);
        }
      },
    });
  }

  return (
    <KCard title="Step 1 — Business Details">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        <div className="grid md:grid-cols-2 gap-4">
          <Field
            id="legalName"
            label="Legal Company Name"
            value={form.legalName}
            error={fieldErrors["legalName"]?.[0]}
            onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            required
          />
          <Field
            id="tradeName"
            label="Trade / Brand Name"
            value={form.tradeName ?? ""}
            error={fieldErrors["tradeName"]?.[0]}
            onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="businessType" className="text-[13px] text-ink">
              Business Type
            </Label>
            <select
              id="businessType"
              value={form.businessType}
              onChange={(e) => setForm({ ...form, businessType: e.target.value as any })}
              className={selectCls}
            >
              {BUSINESS_TYPES.map((bt) => (
                <option key={bt} value={bt}>
                  {BUSINESS_TYPE_LABEL[bt]}
                </option>
              ))}
            </select>
          </div>

          <Field
            id="yearEstablished"
            label="Year Established"
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={form.yearEstablished}
            error={fieldErrors["yearEstablished"]?.[0]}
            onChange={(e) => setForm({ ...form, yearEstablished: parseInt(e.target.value, 10) || 2020 })}
            required
          />

          <Field
            id="designation"
            label="Your Designation"
            value={form.designation}
            error={fieldErrors["designation"]?.[0]}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            required
          />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Field
            id="pan"
            label="Company PAN"
            value={form.pan}
            error={fieldErrors["pan"]?.[0]}
            onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
            maxLength={10}
            required
          />
          <Field
            id="gstin"
            label="GSTIN (Optional)"
            value={form.gstin ?? ""}
            error={fieldErrors["gstin"]?.[0]}
            onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
            maxLength={15}
          />
          <Field
            id="udyam"
            label="Udyam Number (Optional)"
            placeholder="UDYAM-XX-00-0000000"
            value={form.udyam ?? ""}
            error={fieldErrors["udyam"]?.[0]}
            onChange={(e) => setForm({ ...form, udyam: e.target.value.toUpperCase() })}
          />
        </div>

        <div className="border-t border-line pt-3">
          <h3 className="font-semibold text-[14px] text-ink mb-3">Office Address</h3>
          <div className="space-y-3">
            <Field
              id="line1"
              label="Address Line 1"
              value={form.officeAddress.line1}
              error={fieldErrors["officeAddress.line1"]?.[0]}
              onChange={(e) =>
                setForm({
                  ...form,
                  officeAddress: { ...form.officeAddress, line1: e.target.value },
                })
              }
              required
            />
            <Field
              id="line2"
              label="Address Line 2 (Optional)"
              value={form.officeAddress.line2 ?? ""}
              error={fieldErrors["officeAddress.line2"]?.[0]}
              onChange={(e) =>
                setForm({
                  ...form,
                  officeAddress: { ...form.officeAddress, line2: e.target.value },
                })
              }
            />
            <div className="grid md:grid-cols-4 gap-3">
              <Field
                id="city"
                label="City"
                value={form.officeAddress.city}
                error={fieldErrors["officeAddress.city"]?.[0]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    officeAddress: { ...form.officeAddress, city: e.target.value },
                  })
                }
                required
              />
              <Field
                id="district"
                label="District"
                value={form.officeAddress.district}
                error={fieldErrors["officeAddress.district"]?.[0]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    officeAddress: { ...form.officeAddress, district: e.target.value },
                  })
                }
                required
              />
              <div className="space-y-1.5">
                <Label htmlFor="stateCode" className="text-[13px] text-ink">
                  State
                </Label>
                <select
                  id="stateCode"
                  value={form.officeAddress.stateCode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      officeAddress: { ...form.officeAddress, stateCode: e.target.value as any },
                    })
                  }
                  className={selectCls}
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <Field
                id="pin"
                label="PIN Code"
                value={form.officeAddress.pin}
                error={fieldErrors["officeAddress.pin"]?.[0]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    officeAddress: { ...form.officeAddress, pin: e.target.value },
                  })
                }
                maxLength={6}
                required
              />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 border-t border-line pt-3">
          <Field
            id="whatsapp"
            label="WhatsApp Contact (Optional)"
            placeholder="+919876543210"
            value={form.whatsapp ?? ""}
            error={fieldErrors["whatsapp"]?.[0]}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
          <Field
            id="website"
            label="Website (Optional)"
            placeholder="https://..."
            value={form.website ?? ""}
            error={fieldErrors["website"]?.[0]}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="language" className="text-[13px] text-ink">
              Preferred Language
            </Label>
            <select
              id="language"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value as any })}
              className={selectCls}
            >
              {COMMUNICATION_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-line">
          <Btn type="submit" variant="primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save & Next"} <ArrowRight size={15} />
          </Btn>
        </div>
      </form>
    </KCard>
  );
}

/* ========================================================================= */
/* 2. Step: Category Form                                                    */
/* ========================================================================= */
function CategoryStepForm({
  defaultValues,
  categoriesFallback,
  onSaved,
  onBack,
}: {
  defaultValues?: OnboardingCategoryInput | undefined;
  categoriesFallback?: string[] | undefined;
  onSaved: () => void;
  onBack: () => void;
}) {
  const saveMutation = useSaveStep("category");
  const [selected, setSelected] = useState<string[]>(
    defaultValues?.categories ?? categoriesFallback ?? ["media_owner"],
  );
  const [otherCategory, setOtherCategory] = useState(defaultValues?.otherCategory ?? "");
  const [error, setError] = useState<string>();

  function toggle(cat: string) {
    if (selected.includes(cat)) {
      setSelected(selected.filter((c) => c !== cat));
    } else {
      setSelected([...selected, cat]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (selected.length === 0) {
      return setError("Select at least one category");
    }
    if (selected.includes("other") && !otherCategory.trim()) {
      return setError("Please describe the other category");
    }

    const payload: OnboardingCategoryInput = {
      categories: selected as any,
      otherCategory: selected.includes("other") ? otherCategory : undefined,
    };

    saveMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("Category details saved");
        onSaved();
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <KCard title="Step 2 — Business Category">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />
        <p className="text-[13px] text-mute mb-2">
          Select all categories that apply to your outdoor media operations:
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {VENDOR_CATEGORIES.map((cat) => {
            const checked = selected.includes(cat);
            return (
              <label
                key={cat}
                className={cn(
                  "flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition select-none",
                  checked
                    ? "bg-navy/5 border-navy text-ink"
                    : "bg-card border-line text-mute hover:text-ink hover:bg-canvas",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(cat)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-[13px] text-ink leading-tight">
                    {VENDOR_CATEGORY_LABEL[cat]}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {selected.includes("other") && (
          <div className="pt-2">
            <Field
              id="otherCategory"
              label="Describe Other Category"
              value={otherCategory}
              onChange={(e) => setOtherCategory(e.target.value)}
              placeholder="e.g. Specialized 3D Anamorphic Display Manufacturer"
              required
            />
          </div>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-line">
          <Btn type="button" variant="secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </Btn>
          <Btn type="submit" variant="primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save & Next"} <ArrowRight size={15} />
          </Btn>
        </div>
      </form>
    </KCard>
  );
}

/* ========================================================================= */
/* 3. Step: Territory Form                                                   */
/* ========================================================================= */
function TerritoryStepForm({
  defaultValues,
  cityFallback,
  onSaved,
  onBack,
}: {
  defaultValues?: OnboardingTerritoryInput | undefined;
  cityFallback: string;
  onSaved: () => void;
  onBack: () => void;
}) {
  const saveMutation = useSaveStep("territory");
  const [form, setForm] = useState<OnboardingTerritoryInput>({
    primaryCity: defaultValues?.primaryCity ?? cityFallback,
    primaryDistrict: defaultValues?.primaryDistrict ?? cityFallback,
    stateCode: defaultValues?.stateCode ?? "MP",
    otherCities: defaultValues?.otherCities ?? [],
    statesServed: defaultValues?.statesServed ?? ["MP"],
    networkSize: defaultValues?.networkSize ?? 10,
    approxSites: defaultValues?.approxSites ?? 15,
    outsideCity: defaultValues?.outsideCity ?? true,
    responseTimeH: defaultValues?.responseTimeH ?? 24,
  });
  const [otherCitiesInput, setOtherCitiesInput] = useState(
    (defaultValues?.otherCities ?? []).join(", "),
  );
  const [error, setError] = useState<string>();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    const parsedOtherCities = otherCitiesInput
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const payload: OnboardingTerritoryInput = {
      ...form,
      otherCities: parsedOtherCities,
    };

    saveMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("Territory details saved");
        onSaved();
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <KCard title="Step 3 — Operational Territory">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        <div className="grid md:grid-cols-3 gap-4">
          <Field
            id="primaryCity"
            label="Primary City"
            value={form.primaryCity}
            onChange={(e) => setForm({ ...form, primaryCity: e.target.value })}
            required
          />
          <Field
            id="primaryDistrict"
            label="Primary District"
            value={form.primaryDistrict}
            onChange={(e) => setForm({ ...form, primaryDistrict: e.target.value })}
            required
          />
          <div className="space-y-1.5">
            <Label htmlFor="tStateCode" className="text-[13px] text-ink">
              State
            </Label>
            <select
              id="tStateCode"
              value={form.stateCode}
              onChange={(e) => setForm({ ...form, stateCode: e.target.value as any })}
              className={selectCls}
            >
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <Field
          id="otherCities"
          label="Other Operational Cities (Comma-separated)"
          placeholder="e.g. Bhopal, Indore, Jabalpur"
          value={otherCitiesInput}
          onChange={(e) => setOtherCitiesInput(e.target.value)}
        />

        <div className="grid md:grid-cols-3 gap-4">
          <Field
            id="networkSize"
            label="Total Network Media Count"
            type="number"
            min={0}
            value={form.networkSize}
            onChange={(e) => setForm({ ...form, networkSize: parseInt(e.target.value, 10) || 0 })}
            required
          />
          <Field
            id="approxSites"
            label="Approx Geographic Sites"
            type="number"
            min={0}
            value={form.approxSites}
            onChange={(e) => setForm({ ...form, approxSites: parseInt(e.target.value, 10) || 0 })}
            required
          />
          <Field
            id="responseTimeH"
            label="Response Time (Hours)"
            type="number"
            min={1}
            max={720}
            value={form.responseTimeH}
            onChange={(e) => setForm({ ...form, responseTimeH: parseInt(e.target.value, 10) || 24 })}
            required
          />
        </div>

        <label className="flex items-center gap-2.5 pt-2 cursor-pointer select-none">
          <Checkbox
            checked={form.outsideCity}
            onCheckedChange={(checked) => setForm({ ...form, outsideCity: !!checked })}
          />
          <span className="text-[13px] text-ink">
            Available for execution outside primary city limits (highways & district boundaries)
          </span>
        </label>

        <div className="flex justify-between items-center pt-3 border-t border-line">
          <Btn type="button" variant="secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </Btn>
          <Btn type="submit" variant="primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save & Next"} <ArrowRight size={15} />
          </Btn>
        </div>
      </form>
    </KCard>
  );
}

/* ========================================================================= */
/* 4. Step: Execution Form                                                   */
/* ========================================================================= */
function ExecutionStepForm({
  defaultValues,
  onSaved,
  onBack,
}: {
  defaultValues?: OnboardingExecutionInput | undefined;
  onSaved: () => void;
  onBack: () => void;
}) {
  const saveMutation = useSaveStep("execution");
  const [services, setServices] = useState<string[]>(
    defaultValues?.services ?? ["printing", "mounting", "gps_proof"],
  );
  const [teamSize, setTeamSize] = useState(defaultValues?.teamSize ?? 10);
  const [dailyCapacity, setDailyCapacity] = useState(defaultValues?.dailyCapacity ?? 15);
  const [emergencyResponseH, setEmergencyResponseH] = useState(defaultValues?.emergencyResponseH ?? 12);
  const [equipment, setEquipment] = useState(defaultValues?.equipment ?? "");
  const [usesSubcontractors, setUsesSubcontractors] = useState(defaultValues?.usesSubcontractors ?? false);
  const [execContact, setExecContact] = useState(
    defaultValues?.executionContact ?? { name: "", mobile: "" },
  );
  const [error, setError] = useState<string>();

  function toggleService(srv: string) {
    if (services.includes(srv)) {
      setServices(services.filter((s) => s !== srv));
    } else {
      setServices([...services, srv]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (services.length === 0) return setError("Select at least one execution service");
    if (!execContact.name.trim() || !execContact.mobile.trim()) {
      return setError("Execution contact name and 10-digit mobile are required");
    }

    const payload: OnboardingExecutionInput = {
      services: services as any,
      subcontractedServices: [],
      teamSize,
      citiesCovered: [],
      dailyCapacity,
      emergencyResponseH,
      equipment: equipment.trim() ? equipment.trim() : undefined,
      usesSubcontractors,
      executionContact: {
        name: execContact.name.trim(),
        mobile: execContact.mobile.trim(),
      },
    };

    saveMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("Execution capabilities saved");
        onSaved();
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <KCard title="Step 4 — Execution & Field Operations">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        <div>
          <Label className="text-[13px] text-ink mb-2 block font-semibold">Services Offered</Label>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {EXECUTION_SERVICES.map((srv) => {
              const checked = services.includes(srv);
              return (
                <label
                  key={srv}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none transition text-[13px]",
                    checked ? "bg-navy/5 border-navy text-ink font-medium" : "border-line text-mute hover:text-ink",
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleService(srv)} />
                  <span>{EXECUTION_SERVICE_LABEL[srv]}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 border-t border-line pt-3">
          <Field
            id="teamSize"
            label="Field Staff / Team Size"
            type="number"
            min={1}
            value={teamSize}
            onChange={(e) => setTeamSize(parseInt(e.target.value, 10) || 1)}
            required
          />
          <Field
            id="dailyCapacity"
            label="Daily Mounting Capacity (Sites/Day)"
            type="number"
            min={1}
            value={dailyCapacity}
            onChange={(e) => setDailyCapacity(parseInt(e.target.value, 10) || 1)}
            required
          />
          <Field
            id="emergencyResponseH"
            label="Emergency Response (Hours)"
            type="number"
            min={1}
            max={720}
            value={emergencyResponseH}
            onChange={(e) => setEmergencyResponseH(parseInt(e.target.value, 10) || 12)}
            required
          />
        </div>

        <div className="border-t border-line pt-3">
          <Label className="text-[13px] text-ink mb-1 block">Plant & Machinery / Equipment Notes</Label>
          <textarea
            rows={2}
            className="w-full rounded-md border border-input bg-card p-2 text-sm text-ink placeholder:text-mute focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. 2 Solvent Printers 10ft, 1 UV Flatbed, 3 Hydraulic Scaffolding Vehicles"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
          />
        </div>

        <div className="border-t border-line pt-3">
          <h4 className="font-semibold text-[13px] text-ink mb-2">Primary Field Operations Contact</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <Field
              id="execContactName"
              label="Contact Person Name"
              value={execContact.name}
              onChange={(e) => setExecContact({ ...execContact, name: e.target.value })}
              required
            />
            <Field
              id="execContactMobile"
              label="Mobile Number"
              placeholder="+919876543210"
              value={execContact.mobile}
              onChange={(e) => setExecContact({ ...execContact, mobile: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-line">
          <Btn type="button" variant="secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </Btn>
          <Btn type="submit" variant="primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save & Next"} <ArrowRight size={15} />
          </Btn>
        </div>
      </form>
    </KCard>
  );
}

/* ========================================================================= */
/* 5. Step: SLA Form                                                         */
/* ========================================================================= */
function SlaStepForm({
  defaultValues,
  onSaved,
  onBack,
}: {
  defaultValues?: OnboardingSlaInput | undefined;
  onSaved: () => void;
  onBack: () => void;
}) {
  const saveMutation = useSaveStep("sla");
  const [updateFrequency, setUpdateFrequency] = useState(defaultValues?.updateFrequency ?? "daily");
  const [canHold, setCanHold] = useState(defaultValues?.canHold ?? true);
  const [maxHoldH, setMaxHoldH] = useState(defaultValues?.maxHoldH ?? 48);
  const [proofWithinSla, setProofWithinSla] = useState(defaultValues?.proofWithinSla ?? true);
  const [proofTimeH, setProofTimeH] = useState(defaultValues?.proofTimeH ?? 24);
  const [error, setError] = useState<string>();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    const payload: OnboardingSlaInput = {
      updateFrequency: updateFrequency as any,
      blackoutDates: [],
      canHold,
      maxHoldH: canHold ? maxHoldH : undefined,
      proofWithinSla,
      proofTimeH,
    };

    saveMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("SLA parameters saved");
        onSaved();
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <KCard title="Step 5 — Availability & Proof SLA">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="updateFreq" className="text-[13px] text-ink">
              Inventory Availability Frequency
            </Label>
            <select
              id="updateFreq"
              value={updateFrequency}
              onChange={(e) => setUpdateFrequency(e.target.value as any)}
              className={selectCls}
            >
              {AVAILABILITY_UPDATE_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f === "daily" ? "Daily sync" : f === "weekly" ? "Weekly sync" : "On request / Inquiry"}
                </option>
              ))}
            </select>
          </div>

          <Field
            id="proofTimeH"
            label="Proof Upload SLA After Execution (Hours)"
            type="number"
            min={1}
            max={720}
            value={proofTimeH}
            onChange={(e) => setProofTimeH(parseInt(e.target.value, 10) || 24)}
            required
          />
        </div>

        <div className="border-t border-line pt-3 space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <Checkbox
              checked={canHold}
              onCheckedChange={(c) => setCanHold(!!c)}
            />
            <span className="text-[13px] text-ink font-medium">
              Accept holding requests on prospective client inquiries
            </span>
          </label>

          {canHold && (
            <div className="pl-6 w-full max-w-xs">
              <Field
                id="maxHoldH"
                label="Maximum Hold Duration (Hours)"
                type="number"
                min={1}
                max={720}
                value={maxHoldH}
                onChange={(e) => setMaxHoldH(parseInt(e.target.value, 10) || 48)}
                required
              />
            </div>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
            <Checkbox
              checked={proofWithinSla}
              onCheckedChange={(c) => setProofWithinSla(!!c)}
            />
            <span className="text-[13px] text-ink">
              Commit to GPS-stamped photo proof within agreed turnaround hours
            </span>
          </label>
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-line">
          <Btn type="button" variant="secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </Btn>
          <Btn type="submit" variant="primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save & Next"} <ArrowRight size={15} />
          </Btn>
        </div>
      </form>
    </KCard>
  );
}

/* ========================================================================= */
/* 8. Step: Declaration Form & Final Submit                                  */
/* ========================================================================= */
function DeclarationStepForm({
  missingPrereqs,
  onBack,
  onSubmitted,
}: {
  missingPrereqs: WizardStep[];
  onBack: () => void;
  onSubmitted?: ((result: any) => void) | undefined;
}) {
  const submitMutation = useSubmitOnboarding();
  const [accepted, setAccepted] = useState<Record<string, boolean>>({
    infoTrue: true,
    ownershipDisclosed: true,
    permissions: true,
    promptUpdates: true,
    noFalseAvailability: true,
    assetReviewSeparate: true,
    contactConsent: true,
    noBookingUntilConfirmed: true,
    policies: true,
  });
  const [signatoryName, setSignatoryName] = useState("");
  const [designation, setDesignation] = useState("Authorized Signatory");
  const [place, setPlace] = useState("");
  const [error, setError] = useState<string>();

  const allAccepted = DECLARATION_ITEMS.every((item) => accepted[item.key]);
  const hasPrereqsMissing = missingPrereqs.length > 0;
  const canSubmit = allAccepted && !hasPrereqsMissing && signatoryName.trim().length > 0 && place.trim().length > 0;

  function toggleAccept(key: string) {
    setAccepted({ ...accepted, [key]: !accepted[key] });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (hasPrereqsMissing) {
      return setError(`Complete prerequisite steps first: ${missingPrereqs.join(", ")}`);
    }
    if (!allAccepted) {
      return setError("All 9 declaration affirmations must be accepted.");
    }

    const payload: OnboardingDeclarationInput = {
      accepted: accepted as any,
      signatoryName: signatoryName.trim(),
      designation: designation.trim(),
      place: place.trim(),
    };

    submitMutation.mutate(payload, {
      onSuccess: (res) => {
        toast.success("Onboarding submitted successfully for Admin review!");
        onSubmitted?.(res);
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <KCard title="Step 8 — Legal Declaration & Submission">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />

        {hasPrereqsMissing && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-destructive font-semibold text-[13px]">
              <AlertCircle size={16} /> Prerequisite Steps Incomplete
            </div>
            <div className="text-[12px] text-mute">
              The following steps must be completed and saved before submitting:
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {missingPrereqs.map((s) => (
                <Pill key={s} tone="danger">
                  Missing: {WIZARD_STEP_LABEL[s]}
                </Pill>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-[13px] text-mute">
            Review and accept all legal terms and compliance conditions (Form Section §K):
          </p>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {DECLARATION_ITEMS.map((item) => {
              const checked = !!accepted[item.key];
              return (
                <label
                  key={item.key}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer select-none text-[13px] transition leading-relaxed",
                    checked ? "bg-card border-line text-ink" : "bg-destructive/5 border-destructive/30 text-destructive",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleAccept(item.key)}
                    className="mt-0.5"
                  />
                  <span>{item.text}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 border-t border-line pt-3">
          <Field
            id="signatoryName"
            label="Signatory Full Name"
            placeholder="e.g. Ramesh Chandra"
            value={signatoryName}
            onChange={(e) => setSignatoryName(e.target.value)}
            required
          />
          <Field
            id="signatoryDesignation"
            label="Designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            required
          />
          <Field
            id="signatoryPlace"
            label="Place of Signing"
            placeholder="e.g. Gwalior, MP"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            required
          />
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-line">
          <Btn type="button" variant="secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </Btn>
          <Btn
            type="submit"
            variant="primary"
            disabled={!canSubmit || submitMutation.isPending}
            className="px-6"
          >
            <ShieldCheck size={16} />
            {submitMutation.isPending ? "Submitting..." : "Submit Onboarding Application"}
          </Btn>
        </div>
      </form>
    </KCard>
  );
}
