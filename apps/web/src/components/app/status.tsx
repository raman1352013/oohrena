import type { KycStatus, ListingStatus } from "@oohrena/shared";
import { Pill } from "@/components/app/kit";

export function KycPill({ status }: { status: KycStatus }) {
  const m = { pending: ["hold", "KYC under review"], approved: ["verified", "KYC approved"], rejected: ["danger", "KYC rejected"], suspended: ["danger", "Suspended"] } as const;
  const [tone, label] = m[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function ListingPill({ status }: { status: ListingStatus }) {
  const m = { draft: ["neutral", "Draft"], pending: ["hold", "In review"], approved: ["verified", "Approved"], rejected: ["danger", "Rejected"], suspended: ["danger", "Suspended"] } as const;
  const [tone, label] = m[status];
  return <Pill tone={tone}>{label}</Pill>;
}
