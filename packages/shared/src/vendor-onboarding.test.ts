import { describe, expect, it } from "vitest";
import {
  DECLARATION_ITEMS,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_SCHEMAS,
  vendorReviewInput,
  WIZARD_STEPS,
  isOnboardingStep,
  onboardingBusinessInput,
  onboardingCategoryInput,
  onboardingDeclarationInput,
  onboardingExecutionInput,
  onboardingSlaInput,
  onboardingTerritoryInput,
} from "./vendor-onboarding";
import { INDIAN_STATES, STATE_CODES, stateCode } from "./geo";
import { KYC_DOC_LABEL, KYC_DOC_TYPES, REQUIRED_KYC_DOCS } from "./vendor";

const business = {
  legalName: "Shree Outdoor Media Pvt Ltd",
  designation: "Director",
  officeAddress: { line1: "12 MI Road", city: "Jaipur", district: "Jaipur", stateCode: "RJ", pin: "302001" },
  businessType: "pvt_ltd",
  yearEstablished: 2012,
  pan: "aapfu0939f",
  gstin: "08AAPFU0939F1ZV",
  language: "hindi",
};
const category = { categories: ["media_owner", "execution_partner"] };
const territory = {
  primaryCity: "Jaipur",
  primaryDistrict: "Jaipur",
  stateCode: "RJ",
  statesServed: ["RJ", "GJ"],
  networkSize: 12,
  approxSites: 140,
  outsideCity: true,
  responseTimeH: 4,
};
const execution = {
  services: ["printing", "mounting", "gps_proof"],
  subcontractedServices: ["printing"],
  teamSize: 9,
  dailyCapacity: 15,
  emergencyResponseH: 6,
  usesSubcontractors: true,
  executionContact: { name: "Mohan", mobile: "+919876543210" },
};
const sla = { updateFrequency: "weekly", blackoutDates: ["2026-12-31"], canHold: true, maxHoldH: 48, proofWithinSla: true, proofTimeH: 24 };
const accepted = Object.fromEntries(DECLARATION_ITEMS.map((d) => [d.key, true]));
const declaration = { accepted, signatoryName: "Raman Kumar", designation: "Director", place: "Jaipur" };

const valid = { business, category, territory, execution, sla } as const;

describe("onboarding step schemas", () => {
  it("accept a complete, valid vendor form", () => {
    for (const step of ONBOARDING_STEPS) {
      const r = ONBOARDING_STEP_SCHEMAS[step].safeParse(valid[step]);
      expect(r.success, `${step}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
    }
    expect(onboardingDeclarationInput.safeParse(declaration).success).toBe(true);
  });

  it("reject unknown fields on every step, including nested objects", () => {
    for (const step of ONBOARDING_STEPS) expect(ONBOARDING_STEP_SCHEMAS[step].safeParse({ ...valid[step], hacker: 1 }).success, step).toBe(false);
    expect(onboardingBusinessInput.safeParse({ ...business, officeAddress: { ...business.officeAddress, x: 1 } }).success).toBe(false);
    expect(onboardingDeclarationInput.safeParse({ ...declaration, extra: true }).success).toBe(false);
    expect(onboardingDeclarationInput.safeParse({ ...declaration, accepted: { ...accepted, extra: true } }).success).toBe(false);
  });

  it("normalise PAN and require it on the business step", () => {
    const r = onboardingBusinessInput.parse(business);
    expect(r.pan).toBe("AAPFU0939F");
    const { pan: _pan, ...noPan } = business;
    expect(onboardingBusinessInput.safeParse(noPan).success).toBe(false);
  });

  it("reject a GSTIN that belongs to another PAN", () => {
    const r = onboardingBusinessInput.safeParse({ ...business, gstin: "08AAACB1234C1Z5" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["gstin"]);
    const { gstin: _g, ...noGst } = business;
    expect(onboardingBusinessInput.safeParse(noGst).success).toBe(true);
  });

  it("reject a future year, a bad PIN and a free-text state", () => {
    expect(onboardingBusinessInput.safeParse({ ...business, yearEstablished: new Date().getUTCFullYear() + 1 }).success).toBe(false);
    expect(onboardingBusinessInput.safeParse({ ...business, officeAddress: { ...business.officeAddress, pin: "02001" } }).success).toBe(false);
    expect(onboardingBusinessInput.safeParse({ ...business, officeAddress: { ...business.officeAddress, stateCode: "Rajasthan" } }).success).toBe(false);
  });

  it("need at least one category, and a description for other", () => {
    expect(onboardingCategoryInput.safeParse({ categories: [] }).success).toBe(false);
    expect(onboardingCategoryInput.safeParse({ categories: ["other"] }).success).toBe(false);
    expect(onboardingCategoryInput.safeParse({ categories: ["other"], otherCategory: "Printing press" }).success).toBe(true);
    expect(onboardingCategoryInput.safeParse({ categories: ["agency", "agency"] }).success).toBe(false);
  });

  it("check territory numbers and states", () => {
    expect(onboardingTerritoryInput.safeParse({ ...territory, statesServed: ["RJ", "XX"] }).success).toBe(false);
    expect(onboardingTerritoryInput.safeParse({ ...territory, approxSites: -1 }).success).toBe(false);
    expect(onboardingTerritoryInput.safeParse({ ...territory, responseTimeH: 0 }).success).toBe(false);
    expect(onboardingTerritoryInput.parse({ ...territory, statesServed: undefined }).otherCities).toEqual([]);
  });

  it("only allow subcontracting services the vendor offers", () => {
    expect(onboardingExecutionInput.safeParse({ ...execution, subcontractedServices: ["fabrication"] }).success).toBe(false);
    expect(onboardingExecutionInput.safeParse({ ...execution, usesSubcontractors: false }).success).toBe(false);
    expect(onboardingExecutionInput.safeParse({ ...execution, usesSubcontractors: false, subcontractedServices: [] }).success).toBe(true);
    expect(onboardingExecutionInput.safeParse({ ...execution, executionContact: { name: "Mohan", mobile: "12" } }).success).toBe(false);
  });

  it("need a hold period when the vendor can hold sites", () => {
    const { maxHoldH: _m, ...noHold } = sla;
    expect(onboardingSlaInput.safeParse(noHold).success).toBe(false);
    expect(onboardingSlaInput.safeParse({ ...noHold, canHold: false }).success).toBe(true);
    expect(onboardingSlaInput.safeParse({ ...sla, blackoutDates: ["31-12-2026"] }).success).toBe(false);
  });

  it("reject the declaration if any item is not accepted", () => {
    for (const d of DECLARATION_ITEMS) {
      expect(onboardingDeclarationInput.safeParse({ ...declaration, accepted: { ...accepted, [d.key]: false } }).success, d.key).toBe(false);
      const { [d.key]: _omit, ...missing } = accepted;
      expect(onboardingDeclarationInput.safeParse({ ...declaration, accepted: missing }).success, d.key).toBe(false);
    }
    expect(onboardingDeclarationInput.safeParse({ ...declaration, signatoryName: " " }).success).toBe(false);
    expect(DECLARATION_ITEMS).toHaveLength(9);
  });
});

describe("steps", () => {
  it("know which steps are saved through the API", () => {
    expect(isOnboardingStep("business")).toBe(true);
    expect(isOnboardingStep("declaration")).toBe(false);
    expect(isOnboardingStep("__proto__")).toBe(false);
    expect(WIZARD_STEPS).toEqual(["business", "category", "territory", "execution", "sla", "documents", "bank", "declaration"]);
  });
});

describe("states and documents", () => {
  it("lists all 36 states and union territories with unique codes", () => {
    expect(INDIAN_STATES).toHaveLength(36);
    expect(new Set(STATE_CODES).size).toBe(36);
    expect(stateCode.safeParse("RJ").success).toBe(true);
    expect(stateCode.safeParse("rj").success).toBe(false);
  });
  it("labels every KYC document type and still requires PAN", () => {
    for (const t of KYC_DOC_TYPES) expect(KYC_DOC_LABEL[t]).toBeTruthy();
    expect(REQUIRED_KYC_DOCS).toContain("pan");
  });
});

describe("vendor review (§L office use)", () => {
  const ok = {
    identity: "verified",
    ownership: "verified",
    assets: "partial",
    permission: "pending",
    rateCard: "clarification",
    siteVisitRequired: false,
  } as const;

  it("accepts a checklist with no rejection and fills defaults", () => {
    const r = vendorReviewInput.parse(ok);
    expect(r).toMatchObject({ territoryNote: "", remarks: "", nextReviewDate: null });
  });

  it("needs a reason when any item is rejected", () => {
    expect(vendorReviewInput.safeParse({ ...ok, ownership: "rejected" }).success).toBe(false);
    expect(vendorReviewInput.safeParse({ ...ok, assets: "rejected", reason: "No lease" }).success).toBe(true);
  });

  it("rejects unknown fields and bad values", () => {
    expect(vendorReviewInput.safeParse({ ...ok, kycStatus: "approved" }).success).toBe(false);
    expect(vendorReviewInput.safeParse({ ...ok, rateCard: "rejected" }).success).toBe(false);
    expect(vendorReviewInput.safeParse({ ...ok, nextReviewDate: "next week" }).success).toBe(false);
  });
});
