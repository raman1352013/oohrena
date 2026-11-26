import { type ReactNode } from "react";
import {
  CalendarCheck,
  CreditCard,
  FileCheck,
  Inbox,
  Layers,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { VendorRole } from "@oohrena/shared";
import { WorkspaceShell, type NavItem } from "@/components/app/WorkspaceShell";

export const VENDOR_TABS = [
  "overview",
  "inventory",
  "requests",
  "work-orders",
  "finance",
  "kyc",
  "team",
] as const;
export type VendorTab = (typeof VENDOR_TABS)[number];

interface VendorShellProps {
  tab: VendorTab;
  vendorRole: VendorRole;
  counts?:
    | {
        inventory?: number | undefined;
        requests?: number | undefined;
        workOrders?: number | undefined;
        payables?: number | undefined;
      }
    | undefined;
  children: ReactNode;
}

/**
 * Vendor layout on the shared WorkspaceShell. Menu items follow the vendor team role (UX only: the
 * API enforces the same rules with requireVendorRole).
 */
export function VendorShell({ tab, vendorRole, counts, children }: VendorShellProps) {
  const can = (...roles: VendorRole[]) => roles.includes(vendorRole);

  const to = (t: VendorTab, label: string, icon: LucideIcon, n?: number): NavItem => ({
    id: t,
    label,
    icon,
    n,
    to: "/vendor",
    search: t === "overview" ? {} : { tab: t },
    active: tab === t,
  });

  return (
    <WorkspaceShell
      label="Vendor"
      padded
      groups={[
        {
          label: "Workspace",
          items: [
            to("overview", "Overview", Store),
            ...(can("owner", "manager")
              ? [
                  to("inventory", "Inventory", Layers, counts?.inventory),
                  to("requests", "Requests", Inbox, counts?.requests),
                ]
              : []),
            ...(can("owner", "manager", "field")
              ? [to("work-orders", "Work Orders", CalendarCheck, counts?.workOrders)]
              : []),
          ],
        },
        {
          label: "Management",
          items: [
            ...(can("owner", "accounts")
              ? [to("finance", "Finances", CreditCard, counts?.payables)]
              : []),
            ...(can("owner", "manager")
              ? [to("kyc", "KYC & Profile", FileCheck), to("team", "Team", Users)]
              : []),
          ],
        },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
