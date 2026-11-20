import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type PartnerLead = {
  leadId: string;
  status: string;
  requirement: string;
  city: string | null;
  budget: number | null;
  clientName: string | null;
  clientMobile: string | null;
  from: string;
  to: string;
  createdAt: string;
  quotesCount: number;
  booking: {
    bookingId: string;
    status: string;
    total: number | null;
    subtotal: number | null;
  } | null;
};

export type PartnerEarnings = {
  partnerId: string;
  commissionRatePct: number;
  totalLeads: number;
  convertedBookings: number;
  totalBookingValue: number;
  earnedCommission: number;
  pendingCommission: number;
  breakdown: Array<{
    bookingId: string;
    leadId: string;
    clientName: string;
    status: string;
    bookingValue: number;
    commissionPct: number;
    commissionAmount: number;
    earned: boolean;
  }>;
};

export function usePartnerLeads() {
  return useQuery({
    queryKey: ["partner", "leads"],
    queryFn: () => api<PartnerLead[]>("/partner/leads"),
  });
}

export function usePartnerEarnings() {
  return useQuery({
    queryKey: ["partner", "earnings"],
    queryFn: () => api<PartnerEarnings>("/partner/earnings"),
  });
}

export function useCreatePartnerLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      clientName: string;
      clientMobile: string;
      clientEmail?: string;
      requirement: string;
      city: string;
      budget?: number;
      startDate?: string;
      endDate?: string;
    }) => api<{ leadId: string }>("/partner/leads", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner"] });
    },
  });
}
