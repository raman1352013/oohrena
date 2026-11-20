import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AvailabilityMode, AvailabilityState, AvailabilitySummary, DayAvailability, LeadCreateInput, LeadStatus, PublicListing } from "@oohrena/shared";
import { api } from "./api";

export type SearchItem = PublicListing & { distanceKm?: number; availability?: AvailabilitySummary };
export type SearchParams = {
  q?: string | undefined; city?: string | undefined; pin?: string | undefined; category?: string | undefined; maxPrice?: number | undefined;
  from?: string | undefined; to?: string | undefined; lat?: number | undefined; lng?: number | undefined; radiusKm?: number | undefined; onlyAvailable?: boolean | undefined;
};
export type Calendar = {
  inventoryId: string; from: string; to: string; mode: AvailabilityMode; capacityModel: string; unitLabel: string; minDays: number;
  summary: AvailabilitySummary; note: string | null; days: DayAvailability[];
};
export type Entry = { holdId: string; inventoryId: string; kind: "hold" | "booking" | "block"; from: string; to: string; qty: number; status: AvailabilityState | "held" | "released" | "declined"; expiresAt: string | null; leadId: string | null; reason: string | null };
export type OwnerCalendar = { inventoryId: string; mode: AvailabilityMode; days: DayAvailability[]; entries: Entry[] };
export type VendorRequest = { requestId: string; holdId: string; inventoryId: string; from: string; to: string; qty: number; requestedAt: string; respondBy: string; status: "pending" | "confirmed" | "declined" | "expired" | "cancelled"; note: string | null };
export type MyLead = { leadId: string; source: string; status: LeadStatus; inventoryIds: string[]; city: string | null; from: string; to: string; qty: number; budget: number | null; requirement: string; createdAt: string };
export type ShortlistItem = { inventoryId: string; addedAt: string; listing: PublicListing | null };

const qs = (p: Record<string, unknown>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "" && v !== false) u.set(k, String(v));
  return u.toString();
};

export const useSearch = (p: SearchParams) =>
  useQuery({
    queryKey: ["search", p],
    queryFn: ({ signal }) => api<{ items: SearchItem[]; total: number; truncated: boolean }>(`/inventory/search?${qs({ ...p, pageSize: 60 })}`, { signal }),
    placeholderData: keepPreviousData,
  });

export const useCalendar = (id: string | undefined, from: string, to: string) =>
  useQuery({ queryKey: ["calendar", id, from, to], enabled: !!id, queryFn: () => api<Calendar>(`/inventory/${id}/availability?from=${from}&to=${to}`) });

export const useCompare = (ids: string[]) =>
  useQuery({ queryKey: ["compare", ids], enabled: ids.length > 0, queryFn: () => api<PublicListing[]>(`/inventory/compare?ids=${ids.join(",")}`) });

/* ---------- Client ---------- */
export const useShortlist = (enabled: boolean) => useQuery({ queryKey: ["shortlist"], enabled, queryFn: () => api<ShortlistItem[]>("/shortlists") });
export function useToggleShortlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? api<ShortlistItem[]>("/shortlists", { body: { inventoryId: id } }) : api<ShortlistItem[]>(`/shortlists/${id}`, { method: "DELETE" })),
    onSuccess: (d) => qc.setQueryData(["shortlist"], d),
  });
}
export const useMyLeads = (enabled = true) => useQuery({ queryKey: ["leads", "mine"], enabled, queryFn: () => api<MyLead[]>("/leads") });
export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: LeadCreateInput) => api<MyLead & { possibleDuplicateOf: string | null }>("/leads", { body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

/* ---------- Vendor ---------- */
export const useVendorRequests = () => useQuery({ queryKey: ["vendor", "requests"], queryFn: () => api<VendorRequest[]>("/availability-requests"), refetchInterval: 60_000 });
export function useRespond() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, response, note }: { id: string; response: "confirm" | "decline"; note?: string }) => api<unknown>(`/availability-requests/${id}/vendor-response`, { body: note ? { response, note } : { response } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["vendor", "requests"] }); void qc.invalidateQueries({ queryKey: ["owner-calendar"] }); },
  });
}

/** Owner calendar: vendor (own listing) or admin (any listing). */
export const useOwnerCalendar = (scope: "vendor" | "admin", id: string | undefined, from: string, to: string) =>
  useQuery({
    queryKey: ["owner-calendar", scope, id, from, to],
    enabled: !!id,
    queryFn: () => api<OwnerCalendar>(scope === "vendor" ? `/vendors/me/inventory/${id}/availability?from=${from}&to=${to}` : `/admin/inventory/${id}/availability?from=${from}&to=${to}`),
  });

export function useAvailabilityActions(scope: "vendor" | "admin") {
  const qc = useQueryClient();
  const done = () => { void qc.invalidateQueries({ queryKey: ["owner-calendar"] }); void qc.invalidateQueries({ queryKey: ["calendar"] }); void qc.invalidateQueries({ queryKey: ["vendor", "inventory"] }); };
  return {
    block: useMutation({
      mutationFn: ({ id, ...b }: { id: string; from: string; to: string; qty?: number; reason: string }) =>
        api<Entry>(scope === "vendor" ? `/vendors/me/inventory/${id}/availability` : `/admin/inventory/${id}/block`, { body: b }),
      onSuccess: done,
    }),
    unblock: useMutation({
      mutationFn: ({ id, blockId }: { id: string; blockId: string }) =>
        api<Entry>(scope === "vendor" ? `/vendors/me/inventory/${id}/availability/${blockId}` : `/admin/inventory/${id}/block/${blockId}`, { method: "DELETE" }),
      onSuccess: done,
    }),
    setMode: useMutation({
      mutationFn: ({ id, mode }: { id: string; mode: AvailabilityMode }) => api<unknown>(`/vendors/me/inventory/${id}/availability-mode`, { method: "PATCH", body: { mode } }),
      onSuccess: done,
    }),
    hold: useMutation({
      mutationFn: (b: { inventoryId: string; from: string; to: string; qty: number; note?: string }) => api<Entry>("/holds", { body: b }),
      onSuccess: done,
    }),
    release: useMutation({
      mutationFn: ({ holdId, reason }: { holdId: string; reason: string }) => api<Entry>(`/holds/${holdId}`, { method: "DELETE", body: { reason } }),
      onSuccess: done,
    }),
  };
}
