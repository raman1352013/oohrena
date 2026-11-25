import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OnboardingDeclarationInput,
  OnboardingState,
  OnboardingStep,
} from "@oohrena/shared";
import { api } from "./api";

export function useOnboarding() {
  return useQuery({
    queryKey: ["vendor", "onboarding"],
    queryFn: async () => {
      const res = await api<{ data: OnboardingState }>("/vendors/me/onboarding");
      return res.data;
    },
  });
}

export function useSaveStep(step: OnboardingStep) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: unknown) => {
      const res = await api<{ data: { step: string; savedAt: string; data: unknown } }>(
        `/vendors/me/onboarding/${step}`,
        { method: "PATCH", body: data },
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor", "onboarding"] });
      void qc.invalidateQueries({ queryKey: ["vendor", "me"] });
    },
  });
}

export function useSubmitOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (declaration: OnboardingDeclarationInput) => {
      const res = await api<{ data: { submittedAt: string; reward: unknown } }>(
        "/vendors/me/onboarding/submit",
        { method: "POST", body: declaration },
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor", "onboarding"] });
      void qc.invalidateQueries({ queryKey: ["vendor", "me"] });
    },
  });
}
