import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OnboardingDeclarationInput,
  OnboardingReward,
  OnboardingState,
  OnboardingStep,
} from "@oohrena/shared";
import { api } from "./api";

// `api()` already unwraps the `{ data }` envelope, so every type below is the payload itself.

export type SavedOnboardingStep = { step: OnboardingStep; savedAt: string; data: unknown };
export type OnboardingSubmitResult = { submittedAt: string; reward: OnboardingReward };

const K = {
  onboarding: ["vendor", "onboarding"] as const,
  vendorMe: ["vendor", "me"] as const,
};

export const fetchOnboarding = () => api<OnboardingState>("/vendors/me/onboarding");

export const saveOnboardingStep = (step: OnboardingStep, data: unknown) =>
  api<SavedOnboardingStep>(`/vendors/me/onboarding/${step}`, { method: "PATCH", body: data });

export const submitOnboarding = (declaration: OnboardingDeclarationInput) =>
  api<OnboardingSubmitResult>("/vendors/me/onboarding/submit", {
    method: "POST",
    body: declaration,
  });

export function useOnboarding() {
  return useQuery({ queryKey: K.onboarding, queryFn: fetchOnboarding });
}

export function useSaveStep(step: OnboardingStep) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => saveOnboardingStep(step, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.onboarding });
      void qc.invalidateQueries({ queryKey: K.vendorMe });
    },
  });
}

export function useSubmitOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitOnboarding,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.onboarding });
      void qc.invalidateQueries({ queryKey: K.vendorMe });
    },
  });
}
