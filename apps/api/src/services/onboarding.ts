import type { Request } from "express";
import type mongoose from "mongoose";
import {
  DECLARATION_VERSION,
  isOnboardingStep,
  ONBOARDING_STEP_SCHEMAS,
  onboardingDeclarationInput,
  type OnboardingStep,
  type OnboardingState,
  type OnboardingBusinessInput,
} from "@oohrena/shared";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { withTransaction } from "../lib/tx.js";
import { User, Vendor } from "../models/foundation.js";
import { VendorBank, VendorDocument } from "../models/vendor-kyc.js";
import { notify } from "./notifications.js";

/** Mask PAN for audit records as ******1234 */
export function maskPanForAudit(val: unknown): unknown {
  if (!val || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(maskPanForAudit);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (k.toLowerCase() === "pan" && typeof v === "string" && v.length >= 4) {
      out[k] = `******${v.slice(-4)}`;
    } else if (typeof v === "object" && v !== null) {
      out[k] = maskPanForAudit(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Hook called when a vendor submits onboarding.
 * T5 will award welcome bonus coins here.
 */
export async function onOnboardingSubmitted(userId: string, session?: mongoose.ClientSession): Promise<void> {
  // T5 will fill referral/welcome bonus coins here
}

/** Returns the 8 wizard steps done state, submittedAt, and saved form data. */
export async function getOnboardingState(vendorId: string): Promise<OnboardingState> {
  const v = await Vendor.findById(vendorId).lean();
  if (!v) throw notFound("Vendor not found");

  const [docs, bankExists] = await Promise.all([
    VendorDocument.find({ vendorId }).select("type").lean(),
    VendorBank.exists({ vendorId }),
  ]);

  const hasPanDoc = docs.some((d) => d.type === "pan");

  const steps = {
    business: !!v.business,
    category: !!v.category,
    territory: !!v.territory,
    execution: !!v.execution,
    sla: !!v.sla,
    documents: hasPanDoc,
    bank: !!bankExists,
    declaration: !!v.declaration,
  };

  return {
    steps,
    submittedAt: v.onboarding?.submittedAt ? v.onboarding.submittedAt.toISOString() : null,
    data: {
      business: (v.business as any) ?? undefined,
      category: (v.category as any) ?? undefined,
      territory: (v.territory as any) ?? undefined,
      execution: (v.execution as any) ?? undefined,
      sla: (v.sla as any) ?? undefined,
    },
  };
}

/** Saves one wizard step (business, category, territory, execution, sla). */
export async function saveOnboardingStep(
  vendorId: string,
  step: string,
  rawData: unknown,
  req: Request,
) {
  if (!isOnboardingStep(step)) {
    throw notFound(`Unknown onboarding step: ${step}`);
  }

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw notFound("Vendor not found");

  // Saving is allowed until submitted; after submit, only while kycStatus is rejected
  if (vendor.onboarding?.submittedAt && vendor.kycStatus !== "rejected") {
    throw new AppError(409, "INVALID_TRANSITION", "Onboarding is already submitted and under review");
  }

  const schema = ONBOARDING_STEP_SCHEMAS[step as OnboardingStep];
  const parseResult = schema.safeParse(rawData);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    throw badRequest("Validation failed for onboarding step", { fieldErrors });
  }

  const data = parseResult.data;
  const beforeData = vendor.get(step);

  if (step === "business") {
    const bData = data as OnboardingBusinessInput;
    const pan = bData.pan.toUpperCase();
    const existingPan = await Vendor.findOne({ _id: { $ne: vendor._id }, pan }).lean();
    if (existingPan) {
      throw new AppError(409, "DUPLICATE_PAN", "This PAN is already registered with another vendor");
    }
    vendor.pan = pan;
    vendor.legalName = bData.legalName;
    if (bData.gstin) {
      vendor.gstin = bData.gstin.toUpperCase();
    }
  } else if (step === "category") {
    vendor.categories = (data as { categories: any[] }).categories;
  }

  vendor.set(step, data);
  if (!vendor.onboarding) {
    vendor.onboarding = { savedSteps: new Map(), submittedAt: null };
  }
  vendor.set(`onboarding.savedSteps.${step}`, new Date());

  await vendor.save();

  await audit(req, {
    action: "vendor.onboarding.save",
    entity: "vendor",
    entityId: vendor._id,
    before: beforeData ? (maskPanForAudit(beforeData) as Record<string, unknown>) : null,
    after: maskPanForAudit(data) as Record<string, unknown>,
  });

  return { step, savedAt: new Date().toISOString(), data };
}

/** Final submission of onboarding wizard with legal declaration. Owner only. */
export async function submitOnboarding(
  vendorId: string,
  rawDeclaration: unknown,
  ip: string,
  req: Request,
) {
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw notFound("Vendor not found");

  if (vendor.onboarding?.submittedAt && vendor.kycStatus !== "rejected") {
    throw new AppError(409, "INVALID_TRANSITION", "Onboarding is already submitted and under review");
  }

  // Verify all prerequisite steps are completed
  const [docs, bankExists] = await Promise.all([
    VendorDocument.find({ vendorId }).select("type").lean(),
    VendorBank.exists({ vendorId }),
  ]);

  const hasPanDoc = docs.some((d) => d.type === "pan");
  const missingSteps: string[] = [];

  if (!vendor.business) missingSteps.push("business");
  if (!vendor.category) missingSteps.push("category");
  if (!vendor.territory) missingSteps.push("territory");
  if (!vendor.execution) missingSteps.push("execution");
  if (!vendor.sla) missingSteps.push("sla");
  if (!hasPanDoc) missingSteps.push("documents");
  if (!bankExists) missingSteps.push("bank");

  if (missingSteps.length > 0) {
    throw badRequest(`Complete all steps before submitting: ${missingSteps.join(", ")}`, {
      missingSteps,
    });
  }

  const decResult = onboardingDeclarationInput.safeParse(rawDeclaration);
  if (!decResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of decResult.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    throw badRequest("Invalid declaration input", { fieldErrors });
  }

  const decData = decResult.data;

  return await withTransaction(async (session) => {
    const now = new Date();
    const declaration = {
      ...decData,
      version: DECLARATION_VERSION,
      signedAt: now,
      ip,
    };

    vendor.declaration = declaration;
    if (!vendor.onboarding) {
      vendor.onboarding = { savedSteps: new Map(), submittedAt: now };
    } else {
      vendor.onboarding.submittedAt = now;
    }
    vendor.set("onboarding.savedSteps.declaration", now);
    vendor.kycStatus = "pending";

    await vendor.save({ session });

    // Hook for T5 referral reward/welcome bonus
    await onOnboardingSubmitted(vendor.userId, session);

    await audit(
      req,
      {
        action: "vendor.onboarding.submit",
        entity: "vendor",
        entityId: vendor._id,
        after: {
          submittedAt: now,
          signatoryName: decData.signatoryName,
          designation: decData.designation,
          place: decData.place,
        },
      },
      session,
    );

    const admins = await User.find({ role: "admin", status: "active" })
      .session(session)
      .select("_id email mobile")
      .lean();

    if (admins.length) {
      await notify(
        "vendor.onboarding.submitted",
        admins.map((a) => ({ userId: a._id, email: a.email, mobile: a.mobile })),
        { vendorId: vendor._id, legalName: vendor.legalName },
      );
    }

    return { submittedAt: now.toISOString(), reward: null };
  });
}
