import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import { useVendorMe } from "@/lib/inventory-api";
import { KycPill } from "@/components/app/status";
import { BankPanel, KycPanel } from "@/components/app/vendor/KycPanel";
import { CsvImportCard, InventoryPanel } from "@/components/app/vendor/InventoryPanel";
import { RequestsCard } from "@/components/app/vendor/RequestsCard";
import { WorkOrdersCard } from "@/components/app/vendor/WorkOrdersCard";
import { TeamPanel } from "@/components/app/vendor/TeamPanel";
import { Btn, Loading, Pill } from "@/components/app/kit";
import { VendorPayables } from "@/components/app/FinanceCards";
import { VENDOR_ROLE_LABELS, type VendorRole } from "@oohrena/shared";

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
  if (me.isPending) return <Loading />;
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
  const vRole = (user?.vendorRole ?? "owner") as VendorRole;
  const isOwner = vRole === "owner";
  const isManager = vRole === "manager";
  const isField = vRole === "field";
  const isAccounts = vRole === "accounts";

  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold">{v.legalName}</h1>
        <Pill tone={isOwner ? "navy" : isManager ? "saffron" : isField ? "verified" : "neutral"}>
          {VENDOR_ROLE_LABELS[vRole] ?? vRole}
        </Pill>
        <div className="ml-auto">
          <KycPill status={v.kycStatus} />
        </div>
      </div>

      {/* KYC & Bank: KYC visible to owner/manager; Bank visible to owner only */}
      {(isOwner || isManager) && (
        <div className="grid lg:grid-cols-2 gap-5">
          <KycPanel me={v} />
          {isOwner && <BankPanel me={v} />}
        </div>
      )}

      {/* Team management: owner + manager */}
      {(isOwner || isManager) && <TeamPanel isOwner={isOwner} />}

      {/* Work Orders: owner, manager, and field staff */}
      {!isAccounts && <WorkOrdersCard />}

      {/* Requests & Quotes: owner and manager */}
      {(isOwner || isManager) && <RequestsCard />}

      {/* Inventory & Import: owner and manager */}
      {(isOwner || isManager) && (
        <>
          <InventoryPanel canList={v.kycStatus === "approved"} />
          <CsvImportCard />
        </>
      )}

      {/* Financials & Payables: owner and accounts */}
      {(isOwner || isAccounts) && <VendorPayables />}
    </div>
  );
}
