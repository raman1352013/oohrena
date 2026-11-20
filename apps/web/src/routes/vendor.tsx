import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import { useVendorMe } from "@/lib/inventory-api";
import { KycPill } from "@/components/app/status";
import { BankPanel, KycPanel } from "@/components/app/vendor/KycPanel";
import { CsvImportCard, InventoryPanel } from "@/components/app/vendor/InventoryPanel";
import { RequestsCard } from "@/components/app/vendor/RequestsCard";
import { WorkOrdersCard } from "@/components/app/vendor/WorkOrdersCard";
import { Avatar, Btn, Eyebrow } from "@/components/app/kit";
import { VendorPayables } from "@/components/app/FinanceCards";

export const Route = createFileRoute("/vendor")({
  head: () => ({
    meta: [
      { title: "Vendor Space Hub — OOHRENA" },
      {
        name: "description",
        content: "Complete KYC, list verified media inventory and manage work orders.",
      },
      { property: "og:title", content: "Vendor Space Hub — OOHRENA" },
      {
        property: "og:description",
        content: "Media owners list sites and upload GPS-stamped proofs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VendorHub,
});

function VendorHub() {
  const me = useVendorMe();
  const { data: user } = useSession();
  if (me.isPending)
    return (
      <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-16 text-center text-mute text-[13px]">
        Loading your vendor account…
      </div>
    );
  if (me.isError)
    return (
      <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-16 text-center text-[13px]">
        <div className="text-destructive">{me.error.message}</div>
        <Btn variant="secondary" className="mt-3" onClick={() => void me.refetch()}>
          Try again
        </Btn>
      </div>
    );
  const v = me.data;
  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar dark>
          {v.legalName
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase()}
        </Avatar>
        <div>
          <Eyebrow>
            Vendor Space Hub · <span className="font-mono">{v.vendorId}</span>
          </Eyebrow>
          <h1 className="text-[22px] font-semibold">{v.legalName}</h1>
          <div className="text-[12px] text-mute">
            {user?.fullName} · {v.city} · PAN {v.pan}
            {v.gstin ? ` · GSTIN ${v.gstin}` : ""}
          </div>
        </div>
        <div className="ml-auto">
          <KycPill status={v.kycStatus} />
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <KycPanel me={v} />
        <BankPanel me={v} />
      </div>
      <WorkOrdersCard />
      <RequestsCard />
      <InventoryPanel canList={v.kycStatus === "approved"} />
      <CsvImportCard />
      <VendorPayables />
    </div>
  );
}
