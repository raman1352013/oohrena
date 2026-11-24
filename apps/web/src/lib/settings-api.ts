import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SystemSettingItem } from "@oohrena/shared";
import { api } from "./api";

export function useSystemSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api<SystemSettingItem[]>("/admin/settings"),
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value, reason }: { key: string; value: unknown; reason: string }) =>
      api<SystemSettingItem>(`/admin/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: { value, reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
  });
}

export function useApproveSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, reason }: { key: string; reason?: string | undefined }) =>
      api<SystemSettingItem>(`/admin/settings/${encodeURIComponent(key)}/approve`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
  });
}
