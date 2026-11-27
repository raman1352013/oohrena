import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useMyInventory, useVendorMe } from "@/lib/inventory-api";
import { KycPill } from "@/components/app/status";
import { BankPanel, KycPanel } from "@/components/app/vendor/KycPanel";
import { CsvImportCard, InventoryPanel } from "@/components/app/vendor/InventoryPanel";
import { RequestsCard } from "@/components/app/vendor/RequestsCard";
import { WorkOrdersCard } from "@/components/app/vendor/WorkOrdersCard";
import { TeamPanel } from "@/components/app/vendor/TeamPanel";
import { VendorShell, VENDOR_TABS, type VendorTab } from "@/components/app/vendor/VendorShell";
import { Btn, KCard, Loading, Pill, Stats } from "@/components/app/kit";
import { useVendorRequests } from "@/lib/marketplace-api";
import { useMyWorkOrders } from "@/lib/deals-api";
import { useVendorOverdue } from "@/lib/execution-api";
import { VendorPayables } from "@/components/app/FinanceCards";
import { VENDOR_ROLE_LABELS, type VendorRole } from "@oohrena/shared";
import { OnboardingWizard } from "@/components/app/vendor/OnboardingWizard";

export const Route = createFileRoute("/vendor")({
  validateSearch: (search: Record<string, unknown>): { tab?: VendorTab | undefined } => {
    const t = search["tab"] as string | undefined;
    return {
      tab: t && (VENDOR_TABS as readonly string[]).includes(t) ? (t as VendorTab) : undefined,
    };
  },
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
  const nav = useNavigate();
  const search = Route.useSearch();
  const currentTab: VendorTab = search.tab ?? "overview";

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
  const isSubmitted = !!v.onboarding?.submittedAt;

  if (!isSubmitted) {
    // Next step after the profile is the vendor's sites, so open Inventory straight away.
    return (
      <OnboardingWizard
        onSubmitted={() => void nav({ to: "/vendor", search: { tab: "inventory" } })}
      />
    );
  }

  const vRole = (user?.vendorRole ?? "owner") as VendorRole;
  const isOwner = vRole === "owner";
  const isManager = vRole === "manager";
  const isField = vRole === "field";
  const isAccounts = vRole === "accounts";

  return (
    <VendorShell tab={currentTab} vendorRole={vRole}>
      <div className="space-y-6">
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-semibold">{v.legalName}</h1>
            <Pill
              tone={isOwner ? "navy" : isManager ? "saffron" : isField ? "verified" : "neutral"}
            >
              {VENDOR_ROLE_LABELS[vRole] ?? vRole}
            </Pill>
          </div>
          <div className="flex items-center gap-2">
            {v.kycStatus === "pending" && <Pill tone="saffron">Under review</Pill>}
            <KycPill status={v.kycStatus} />
          </div>
        </div>

        {/* Tab content */}
        {currentTab === "overview" && (
          <div className="space-y-6">
            {/* Quick KYC alert if incomplete */}
            {v.kycStatus !== "approved" && (
              <KCard className="border-saffron/40 bg-saffron/5 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-ink text-[14px]">KYC Verification Pending</div>
                  <div className="text-[12px] text-mute">
                    {v.missingDocuments.length > 0
                      ? `${v.missingDocuments.length} mandatory document(s) required to verify your profile.`
                      : "Your documents are submitted and under review by OOHRENA admin."}
                  </div>
                </div>
                <Link to="/vendor" search={{ tab: "kyc" }}>
                  <Btn size="sm" variant="secondary" type="button">
                    Complete KYC
                  </Btn>
                </Link>
              </KCard>
            )}

            {(isOwner || isManager) && <VendorSummary />}

            {(isOwner || isManager) && <FirstSiteCard />}

            {/* Overview dashboard grid */}
            <div className="grid lg:grid-cols-2 gap-5 items-start">
              {!isAccounts && <WorkOrdersCard />}
              {(isOwner || isManager) && <RequestsCard />}
            </div>

            {(isOwner || isAccounts) && <VendorPayables />}
          </div>
        )}

        {currentTab === "inventory" && (isOwner || isManager) && (
          <div className="space-y-6">
            <InventoryPanel canList={v.kycStatus === "approved"} />
            <CsvImportCard />
          </div>
        )}

        {currentTab === "requests" && (isOwner || isManager) && <RequestsCard />}

        {currentTab === "work-orders" && !isAccounts && <WorkOrdersCard />}

        {currentTab === "finance" && (isOwner || isAccounts) && (
          <div className="space-y-6">
            <VendorPayables />
            {isOwner && <BankPanel me={v} />}
          </div>
        )}

        {currentTab === "kyc" && (isOwner || isManager) && (
          <div className="grid lg:grid-cols-2 gap-5">
            <KycPanel me={v} />
            {isOwner && <BankPanel me={v} />}
          </div>
        )}

        {currentTab === "team" && (isOwner || isManager) && <TeamPanel isOwner={isOwner} />}
      </div>
    </VendorShell>
  );
}

/** Shown on Overview until the vendor has at least one site, so the next step is never hidden. */
function FirstSiteCard() {
  const inv = useMyInventory();
  if (inv.isPending || inv.isError || (inv.data?.items.length ?? 0) > 0) return null;
  return (
    <KCard className="p-5 flex flex-wrap items-center justify-between gap-3">
      <div className="font-semibold text-ink text-[15px]">Add your first site</div>
      <Link to="/vendor" search={{ tab: "inventory" }}>
        <Btn type="button" tabIndex={-1}>
          <Plus size={16} />
          Add site
        </Btn>
      </Link>
    </KCard>
  );
}

const OPEN_WO = ["scheduled", "installed", "inspection_due", "issue_raised"];

/** The four numbers an owner checks first. Counts only, straight from the vendor's own lists. */
function VendorSummary() {
  const inv = useMyInventory();
  const reqs = useVendorRequests();
  const wos = useMyWorkOrders();
  const overdue = useVendorOverdue();
  const n = (ready: boolean, v: number) => (ready ? v : "–");
  const holds = (reqs.data ?? []).filter((r) => r.status === "pending").length;
  const late = overdue.data?.length ?? 0;
  return (
    <Stats
      items={[
        {
          label: "Live sites",
          value: n(
            !!inv.data,
            (inv.data?.items ?? []).filter((l) => l.status === "approved").length,
          ),
        },
        {
          label: "Holds to confirm",
          value: n(!!reqs.data, holds),
          tone: holds ? "hold" : undefined,
        },
        {
          label: "Open work orders",
          value: n(!!wos.data, (wos.data ?? []).filter((w) => OPEN_WO.includes(w.status)).length),
        },
        {
          label: "Proofs overdue",
          value: n(!!overdue.data, late),
          tone: late ? "danger" : undefined,
        },
      ]}
    />
  );
}
