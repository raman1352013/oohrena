import { useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarCheck,
  CircleAlert,
  Images,
  Inbox,
  Megaphone,
  Plus,
  Server,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useDashboard } from "@/lib/deals-api";
import { useAdminInventory, useAdminVendors } from "@/lib/inventory-api";
import { WorkspaceShell, type NavItem } from "@/components/app/WorkspaceShell";
import { NewLeadDialog } from "./NewLeadDialog";

export const ADMIN_TABS = [
  "inbox",
  "bookings",
  "campaigns",
  "proofs",
  "issues",
  "vendors",
  "users",
  "system",
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

/** Admin layout on the shared WorkspaceShell. The open section lives in `/admin?tab=`. */
export function AdminShell({ tab, children }: { tab: AdminTab; children: ReactNode }) {
  const d = useDashboard().data;
  const kyc = useAdminVendors("pending").data;
  const listings = useAdminInventory("pending").data;
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onReports = path.startsWith("/reports");
  const [adding, setAdding] = useState(false);

  const to = (t: AdminTab, label: string, icon: LucideIcon, n?: number): NavItem => ({
    id: t,
    label,
    icon,
    n,
    to: "/admin",
    search: t === "inbox" ? {} : { tab: t },
    active: !onReports && tab === t,
  });

  return (
    <WorkspaceShell
      label="Admin"
      action={{ label: "Log inquiry", icon: Plus, onClick: () => setAdding(true) }}
      groups={[
        {
          items: [
            to("inbox", "Inbox", Inbox, d?.leads.new),
            to(
              "bookings",
              "Bookings",
              CalendarCheck,
              d && (d.bookings.confirmed ?? 0) + (d.bookings.live ?? 0),
            ),
            to("campaigns", "Campaigns", Megaphone),
            to("proofs", "Proofs", Images, d?.proofsToVerify),
            to("issues", "Issues", CircleAlert, d?.openIssues),
            to("vendors", "Vendors", Store, (kyc?.total ?? 0) + (listings?.total ?? 0)),
          ],
        },
        {
          label: "Manage",
          items: [
            to("users", "Users", Users),
            to("system", "System", Server),
            { id: "reports", label: "Reports", icon: BarChart3, to: "/reports", active: onReports },
          ],
        },
      ]}
    >
      {children}
      <NewLeadDialog open={adding} onClose={() => setAdding(false)} />
    </WorkspaceShell>
  );
}
