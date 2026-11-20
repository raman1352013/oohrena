import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CATEGORY_DEFS, DataType, InventoryCreateInput, InventoryUpdateInput, KycDocType, KycStatus, ListingStatus, PricingUnit } from "@oohrena/shared";
import { api } from "./api";

/* ---------- Response shapes (mirror apps/api views) ---------- */
export type KycDoc = { docId: string; type: KycDocType; fileId: string; status: "uploaded" | "verified" | "rejected"; uploadedAt: string; verifiedAt: string | null };
export type MaskedBank = { accountName: string; accountNo: string; ifsc: string; bankName: string | null; verified: boolean; updatedAt: string } | null;
export type VendorMe = {
  vendorId: string; legalName: string; pan: string; gstin: string | null; city: string; kycStatus: KycStatus; kycReason: string | null;
  approvedAt: string | null; documents: KycDoc[]; missingDocuments: KycDocType[]; bank: MaskedBank;
};
export type Listing = {
  inventoryId: string; vendorId: string; category: string; categoryName: string; title: string; description: string | null;
  city: string; locality: string; landmark: string | null; address: string; pin: string; lat: number; lng: number;
  attributes: Record<string, string | number | boolean>; rate: number; pricingUnit: PricingUnit; quantity: number; indicativePrice: number | null;
  photos: { fileId: string; url: string; uploadedAt: string; capturedAt: string | null }[];
  status: ListingStatus; statusReason: string | null; dataType: DataType | null; version: number;
  submittedAt: string | null; approvedAt: string | null; createdAt: string; updatedAt: string;
};
export type AdminListing = Listing & {
  vendor: { vendorId: string; legalName: string; kycStatus: KycStatus } | null;
  suggestedPrice: number;
  openDuplicates: { flagId: string; other: string; score: number; reasons: string[] }[];
};
export type AdminVendorRow = {
  vendorId: string; legalName: string; city: string; pan: string; gstin: string | null; kycStatus: KycStatus; kycReason: string | null;
  contactName: string | null; documentCount: number; missingDocuments: KycDocType[]; listingCount: number; createdAt: string; approvedAt: string | null;
};
export type AdminVendorDetail = {
  vendorId: string; legalName: string; city: string; pan: string; gstin: string | null; kycStatus: KycStatus; kycReason: string | null;
  contact: { name: string; email: string; mobile: string } | null; documents: KycDoc[]; bank: MaskedBank; createdAt: string;
};
export type HistoryRow = { inventoryId: string; field: string; old: unknown; new: unknown; changedBy: string; changedAt: string; version: number };
export type Category = (typeof CATEGORY_DEFS)[number];
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

const K = {
  vendorMe: ["vendor", "me"] as const,
  myInventory: ["vendor", "inventory"] as const,
  history: (id: string) => ["inventory", id, "history"] as const,
  adminVendors: ["admin", "vendors"] as const,
  adminVendor: (id: string) => ["admin", "vendors", id] as const,
  adminInventory: ["admin", "inventory"] as const,
};

/* ---------- Vendor ---------- */
export const useVendorMe = () => useQuery({ queryKey: K.vendorMe, queryFn: () => api<VendorMe>("/vendors/me") });

export function useUploadKycDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, file }: { type: KycDocType; file: File }) => {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      return api<KycDoc>("/vendors/me/documents", { form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: K.vendorMe }),
  });
}

export function useSaveBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { accountName: string; accountNo: string; ifsc: string; bankName?: string | undefined }) => api<MaskedBank>("/vendors/me/bank", { method: "PUT", body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.vendorMe }),
  });
}

export function useResubmitKyc() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api<{ kycStatus: KycStatus }>("/vendors/me/kyc/resubmit", { body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: K.vendorMe }) });
}

export const useMyInventory = () => useQuery({ queryKey: K.myInventory, queryFn: () => api<Page<Listing>>("/vendors/me/inventory?pageSize=100") });

function useInventoryMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: K.myInventory }) });
}
export const useCreateListing = () => useInventoryMutation((v: InventoryCreateInput) => api<Listing>("/vendors/me/inventory", { body: v }));
export const useUpdateListing = () => useInventoryMutation(({ id, patch }: { id: string; patch: InventoryUpdateInput }) => api<Listing>(`/vendors/me/inventory/${id}`, { method: "PATCH", body: patch }));
export const useSubmitListing = () => useInventoryMutation((id: string) => api<Listing>(`/vendors/me/inventory/${id}/submit`, { body: {} }));
export const useRemovePhoto = () => useInventoryMutation(({ id, fileId }: { id: string; fileId: string }) => api<Listing>(`/vendors/me/inventory/${id}/photos/${fileId}`, { method: "DELETE" }));
export const useUploadPhotos = () =>
  useInventoryMutation(({ id, files }: { id: string; files: File[] }) => {
    const form = new FormData();
    files.forEach((f) => form.append("photos", f));
    // Device capture time is secondary evidence; the server records its own upload time.
    const lm = files[0]?.lastModified;
    if (lm) form.append("capturedAt", new Date(lm).toISOString());
    return api<Listing>(`/vendors/me/inventory/${id}/photos`, { form });
  });
export const useImportCsv = () => useInventoryMutation((v: { csv: string; dryRun?: boolean }) => api<{ created: string[]; validRows: number; dryRun: boolean }>("/vendors/me/inventory/import", { body: v }));

export const useListingHistory = (id: string | undefined, scope: "vendor" | "admin") =>
  useQuery({
    queryKey: K.history(id ?? ""),
    enabled: !!id,
    queryFn: () => api<HistoryRow[]>(scope === "vendor" ? `/vendors/me/inventory/${id}/history` : `/admin/inventory/${id}/history`),
  });

/* ---------- Admin ---------- */
export const useAdminVendors = (kycStatus?: KycStatus) =>
  useQuery({ queryKey: [...K.adminVendors, kycStatus ?? "all"], queryFn: () => api<Page<AdminVendorRow>>(`/admin/vendors?pageSize=100${kycStatus ? `&kycStatus=${kycStatus}` : ""}`) });
export const useAdminVendor = (id: string | undefined) => useQuery({ queryKey: K.adminVendor(id ?? ""), enabled: !!id, queryFn: () => api<AdminVendorDetail>(`/admin/vendors/${id}`) });

export function useKycDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: "approve" | "reject" | "suspend" | "reinstate"; reason?: string }) =>
      api<{ kycStatus: KycStatus }>(`/admin/vendors/${id}/kyc-decision`, { body: reason ? { decision, reason } : { decision } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: K.adminVendors }); void qc.invalidateQueries({ queryKey: K.adminInventory }); },
  });
}

export const useAdminInventory = (status?: ListingStatus) =>
  useQuery({ queryKey: [...K.adminInventory, status ?? "all"], queryFn: () => api<Page<AdminListing>>(`/admin/inventory?pageSize=100${status ? `&status=${status}` : ""}`) });

export function useListingDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; decision: "approve" | "reject" | "suspend" | "reinstate"; reason?: string; indicativePrice?: number }) =>
      api<Listing>(`/admin/inventory/${id}/decision`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.adminInventory }),
  });
}

export function useSetDataType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dataType, reason }: { id: string; dataType: DataType; reason: string }) => api<Listing>(`/admin/inventory/${id}/data-type`, { method: "PATCH", body: { dataType, reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.adminInventory }),
  });
}

export function useResolveDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flagId, resolution, note }: { flagId: string; resolution: "confirmed" | "dismissed"; note: string }) => api<unknown>(`/admin/duplicates/${flagId}/resolve`, { body: { resolution, note } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.adminInventory }),
  });
}
