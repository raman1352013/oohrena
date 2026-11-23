import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  LoginInput,
  RegisterClientInput,
  RegisterVendorInput,
  Role,
  SessionUser,
} from "@oohrena/shared";
import { api, ApiError } from "./api";

export const SESSION_KEY = ["session"] as const;

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, "/admin" | "/client" | "/vendor" | "/finance" | "/partner"> = {
  admin: "/admin",
  client: "/client",
  vendor: "/vendor",
  finance: "/finance",
  growth_partner: "/partner",
};

/**
 * Which signed-in roles may open each workspace. The API enforces access on every endpoint;
 * this only decides what the browser shows.
 */
export const ROUTE_ROLES: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/client", roles: ["client"] },
  { prefix: "/vendor", roles: ["vendor"] },
  { prefix: "/finance", roles: ["finance"] },
  { prefix: "/partner", roles: ["growth_partner"] },
  { prefix: "/reports", roles: ["admin", "finance", "client", "vendor", "growth_partner"] },
  { prefix: "/print", roles: ["admin", "finance", "client"] },
  { prefix: "/account", roles: ["admin", "finance", "client", "vendor", "growth_partner"] },
];
/** Only same-app paths are accepted as a post-login destination. */
export const safeRedirect = (v: unknown) =>
  typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : undefined;

export const PUBLIC_PATHS = [
  "/",
  "/marketplace",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/confidentiality",
];

/** Pages anyone may open. Every other page needs a signed-in user (deny by default). */
export const isPublicPath = (path: string) => {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return PUBLIC_PATHS.includes(p);
};

export function rolesFor(path: string) {
  return (
    ROUTE_ROLES.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`))?.roles ?? null
  );
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Central Admin",
  client: "Client",
  vendor: "Vendor",
  finance: "Finance / Audit",
  growth_partner: "Growth Partner",
};

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return (await api<{ user: SessionUser }>("/auth/me")).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });
}

export const useCurrentUser = useSession;

type AuthResult = {
  user?: SessionUser;
  status?: "2FA_REQUIRED" | "2FA_SETUP_REQUIRED";
  challengeToken?: string;
  email?: string;
};

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api<AuthResult>("/auth/login", { body: input }),
    onSuccess: (r) => {
      if (r.user) qc.setQueryData(SESSION_KEY, r.user);
    },
  });
}

export function useLogin2FA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { challengeToken: string; code: string }) =>
      api<{ user: SessionUser }>("/auth/2fa/login", { body: input }),
    onSuccess: (r) => {
      if (r.user) qc.setQueryData(SESSION_KEY, r.user);
    },
  });
}

export function useRegisterClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterClientInput) =>
      api<{ user: SessionUser }>("/auth/register", { body: input }),
    onSuccess: (r) => qc.setQueryData(SESSION_KEY, r.user),
  });
}

export function useRegisterVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterVendorInput) =>
      api<{ user: SessionUser; vendorId: string }>("/vendors/register", { body: input }),
    onSuccess: (r) => qc.setQueryData(SESSION_KEY, r.user),
  });
}

function clearSession(qc: ReturnType<typeof useQueryClient>) {
  qc.setQueryData(SESSION_KEY, null);
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/auth/logout", { method: "POST", body: {} }),
    // Clear local state once the server has ended the session (or it had already expired). If the server
    // refused (e.g. a blocked origin), keep it: pretending to be signed out while the cookie lives on
    // made the login page sign the user straight back in.
    onSuccess: () => clearSession(qc),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) clearSession(qc);
    },
  });
}

/* ---------- Two-factor authentication (Module 10) ---------- */

export type TwoFactorSetupData = { uri: string; qrDataUrl: string; recoveryCodes: string[] };

/** First sign-in of a role that must use 2FA: enrol with the login challenge, then a session starts. */
export function useEnroll2FA() {
  const qc = useQueryClient();
  return {
    start: useMutation({
      mutationFn: (challengeToken: string) =>
        api<TwoFactorSetupData>("/auth/2fa/enroll/start", { body: { challengeToken } }),
    }),
    verify: useMutation({
      mutationFn: (input: { challengeToken: string; code: string }) =>
        api<{ user: SessionUser }>("/auth/2fa/enroll/verify", { body: input }),
      onSuccess: (r) => qc.setQueryData(SESSION_KEY, r.user),
    }),
  };
}

/** Signed-in user turns 2FA on or off from the Account page. */
export function useTwoFactor() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: SESSION_KEY });
  return {
    setup: useMutation({
      mutationFn: () => api<TwoFactorSetupData>("/auth/2fa/setup", { body: {} }),
    }),
    verify: useMutation({
      mutationFn: (token: string) => api<{ ok: boolean }>("/auth/2fa/verify", { body: { token } }),
      onSuccess: refresh,
    }),
    disable: useMutation({
      mutationFn: (input: { password: string; code: string }) =>
        api<{ ok: boolean }>("/auth/2fa/disable", { body: input }),
      onSuccess: refresh,
    }),
  };
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api<{ message: string }>("/auth/change-password", { body: input }),
  });
}
