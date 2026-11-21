import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@oohrena/shared";
import { api } from "./api";

export type AdminUserItem = {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  status: "active" | "pending" | "suspended";
  orgId: string | null;
  twoFactorEnabled?: boolean;
  emailVerified?: boolean;
  mobileVerified?: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type UserSessionItem = {
  sessionId: string;
  issuedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  device: string | null;
  current: boolean;
};

export type SystemOverviewData = {
  deployments: Array<{ _id: string; type: "deploy"; detail: Record<string, unknown>; at: string }>;
  backups: Array<{
    _id: string;
    type: "backup" | "restore";
    detail: Record<string, unknown>;
    at: string;
  }>;
  errorCount: number;
  recentErrors: Array<{ _id: string; type: "error"; detail: Record<string, unknown>; at: string }>;
};

export function useAdminUsers(
  params: { role?: Role | undefined; q?: string | undefined; page?: number | undefined } = {},
) {
  const sp = new URLSearchParams();
  if (params.role) sp.set("role", params.role);
  if (params.q) sp.set("q", params.q);
  if (params.page) sp.set("page", String(params.page));
  const query = sp.toString() ? `?${sp.toString()}` : "";

  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () =>
      api<{ items: AdminUserItem[]; total: number; page: number; pageSize: number }>(
        `/admin/users${query}`,
      ),
  });
}

export function useCreateStaffUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      fullName: string;
      email: string;
      mobile: string;
      role: "admin" | "finance" | "growth_partner";
    }) =>
      api<{ user: AdminUserItem; inviteSent: boolean; devInviteLink?: string }>("/admin/users", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<{ ok: boolean; status: string }>(`/admin/users/${userId}/suspend`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<{ ok: boolean; status: string }>(`/admin/users/${userId}/reactivate`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useUserSessions(userId: string | null) {
  return useQuery({
    queryKey: ["admin", "users", userId, "sessions"],
    queryFn: () => (userId ? api<UserSessionItem[]>(`/admin/users/${userId}/sessions`) : null),
    enabled: !!userId,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, sessionId }: { userId: string; sessionId: string }) =>
      api<{ ok: boolean }>(`/admin/users/${userId}/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAssignUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role, reason }: { userId: string; role: Role; reason: string }) =>
      api<AdminUserItem>(`/admin/users/${userId}/role`, { method: "POST", body: { role, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useSystemOverview() {
  return useQuery({
    queryKey: ["admin", "system", "overview"],
    queryFn: () => api<SystemOverviewData>("/admin/system/overview"),
  });
}
