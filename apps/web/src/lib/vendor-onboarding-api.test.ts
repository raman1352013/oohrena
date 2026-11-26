import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DECLARATION_ITEMS,
  WIZARD_STEPS,
  type OnboardingDeclarationInput,
  type OnboardingState,
} from "@oohrena/shared";
import { fetchOnboarding, saveOnboardingStep, submitOnboarding } from "./vendor-onboarding-api";

function mockApi(payload: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: payload }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

// api() unwraps the { data } envelope once. These calls used to unwrap it a second time, so the
// wizard got undefined and crashed right after vendor sign-up ("reading 'business'").
describe("vendor onboarding API calls", () => {
  it("fetchOnboarding returns the onboarding state itself", async () => {
    const state: OnboardingState = {
      steps: Object.fromEntries(
        WIZARD_STEPS.map((s) => [s, s === "business"]),
      ) as OnboardingState["steps"],
      submittedAt: null,
      data: {},
    };
    const fetchMock = mockApi(state);
    await expect(fetchOnboarding()).resolves.toEqual(state);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/vendors/me/onboarding");
  });

  it("saveOnboardingStep PATCHes the step and returns the saved step", async () => {
    const out = { step: "business", savedAt: "2026-11-26T10:00:00.000Z", data: {} };
    const fetchMock = mockApi(out);
    await expect(saveOnboardingStep("business", { legalName: "X" })).resolves.toEqual(out);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/vendors/me/onboarding/business");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
  });

  it("submitOnboarding returns submittedAt and the reward", async () => {
    const out = {
      submittedAt: "2026-11-26T10:00:00.000Z",
      reward: { welcomeBonus: 25, pendingReferralCoins: 0, status: "pending" },
    };
    const fetchMock = mockApi(out);
    const declaration: OnboardingDeclarationInput = {
      accepted: Object.fromEntries(
        DECLARATION_ITEMS.map((i) => [i.key, true]),
      ) as OnboardingDeclarationInput["accepted"],
      signatoryName: "A",
      designation: "Owner",
      place: "Shimla",
    };
    await expect(submitOnboarding(declaration)).resolves.toEqual(out);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });
});
