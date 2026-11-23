import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueStatus, ProofStatus, ProofType, WorkOrderStatus } from "@oohrena/shared";
import { api } from "./api";

export type Slot = {
  scheduleId: string;
  workOrderId: string;
  inventoryId: string;
  type: ProofType;
  dueDate: string;
  status: "due" | "uploaded" | "verified" | "rejected" | "cancelled";
  latestProofId: string | null;
  receivedProofId: string | null;
};
export type ProofView = {
  proofId: string;
  campaignId: string;
  bookingId: string;
  workOrderId: string;
  inventoryId: string;
  type: ProofType;
  url: string;
  mime: string;
  uploadedAt: string;
  capturedAt: string | null;
  gpsSource: "device" | "none";
  gpsLabel: string;
  status: ProofStatus;
  decidedAt: string | null;
  lat?: number | null;
  lng?: number | null;
  distanceM?: number | null;
  rejectReason?: string | null;
  note?: string | null;
  vendorId?: string;
  scheduleId?: string | null;
};
export type IssueView = {
  issueId: string;
  campaignId: string;
  bookingId: string;
  workOrderId: string | null;
  raisedBy: string;
  raisedByRole: string;
  category: string;
  description: string;
  owner: string | null;
  dueDate: string | null;
  status: IssueStatus;
  resolutionNote: string | null;
  createdAt: string;
};
export type Execution = {
  workOrderId: string;
  campaignId: string | null;
  status: WorkOrderStatus;
  previousStatus: WorkOrderStatus | null;
  schedule: Slot[];
  proofs: ProofView[];
  updates: {
    fromStatus: string;
    status: string;
    note: string | null;
    byUser: string;
    at: string;
  }[];
  issues: IssueView[];
};

export const useExecution = (woId: string | undefined) =>
  useQuery({
    queryKey: ["execution", woId],
    enabled: !!woId,
    queryFn: () => api<Execution>(`/work-orders/${woId}/execution`),
  });

export function useExecutionActions(woId: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["execution", woId] });
    void qc.invalidateQueries({ queryKey: ["vendor"] });
    void qc.invalidateQueries({ queryKey: ["admin"] });
  };
  return {
    status: useMutation({
      mutationFn: (v: { status: "installed" | "inspection_due" | "completed"; note?: string }) =>
        api(`/work-orders/${woId}/status`, { body: v }),
      onSuccess: done,
    }),
    upload: useMutation({
      mutationFn: (v: {
        file: File;
        inventoryId: string;
        scheduleId?: string;
        lat?: number;
        lng?: number;
        accuracyM?: number;
        note?: string;
      }) => {
        const f = new FormData();
        f.append("file", v.file);
        f.append("inventoryId", v.inventoryId);
        if (v.scheduleId) f.append("scheduleId", v.scheduleId);
        // Device clock is secondary evidence; the server stamps its own upload time.
        f.append("capturedAt", new Date(v.file.lastModified || Date.now()).toISOString());
        if (v.lat !== undefined && v.lng !== undefined) {
          f.append("lat", String(v.lat));
          f.append("lng", String(v.lng));
          if (v.accuracyM !== undefined) f.append("accuracyM", String(Math.round(v.accuracyM)));
        }
        if (v.note) f.append("note", v.note);
        return api<ProofView>(`/work-orders/${woId}/proofs`, { form: f });
      },
      onSuccess: done,
    }),
  };
}

export function useRaiseIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      ...b
    }: {
      campaignId: string;
      workOrderId?: string | undefined;
      category: string;
      description: string;
    }) => api<IssueView>(`/campaigns/${campaignId}/issues`, { body: b }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["execution"] });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

/** Asks the browser for one position fix; resolves undefined if the user declines or the device can't. */
export function getPosition(): Promise<
  { lat: number; lng: number; accuracyM: number } | undefined
> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/* ---------- Admin ---------- */
export const useProofQueue = (status: ProofStatus = "uploaded") =>
  useQuery({
    queryKey: ["admin", "proofs", status],
    queryFn: () => api<ProofView[]>(`/admin/proofs?status=${status}`),
  });
export const useOverdue = () =>
  useQuery({ queryKey: ["admin", "overdue"], queryFn: () => api<Slot[]>("/admin/proofs/overdue") });
export const useIssues = (status?: IssueStatus) =>
  useQuery({
    queryKey: ["admin", "issues", status ?? "open"],
    queryFn: () => api<IssueView[]>(`/admin/issues${status ? `?status=${status}` : ""}`),
  });
export function useAdminExecution() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["execution"] });
  };
  return {
    decide: useMutation({
      mutationFn: ({
        id,
        decision,
        reason,
      }: {
        id: string;
        decision: "verify" | "reject";
        reason?: string;
      }) =>
        api(`/admin/proofs/${id}/decision`, { body: reason ? { decision, reason } : { decision } }),
      onSuccess: done,
    }),
    updateIssue: useMutation({
      mutationFn: ({
        id,
        ...b
      }: {
        id: string;
        owner?: string;
        dueDate?: string;
        status?: IssueStatus;
        resolutionNote?: string;
      }) => api<IssueView>(`/admin/issues/${id}`, { method: "PATCH", body: b }),
      onSuccess: done,
    }),
  };
}

/* ---------- Client ---------- */
export const useBookingProofs = (bookingId: string | undefined) =>
  useQuery({
    queryKey: ["client", "proofs", bookingId],
    enabled: !!bookingId,
    queryFn: () =>
      api<{
        bookingId: string;
        campaignId: string | null;
        campaignStatus: string | null;
        proofs: ProofView[];
      }>(`/bookings/${bookingId}/proofs`),
  });
export const vendorOverdueKey = ["vendor", "overdue"] as const;
export const useVendorOverdue = () =>
  useQuery({
    queryKey: vendorOverdueKey,
    queryFn: () => api<Slot[]>("/vendors/me/proofs/overdue"),
  });
