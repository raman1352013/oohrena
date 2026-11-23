import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ADMIN_TABS, AdminShell, type AdminTab } from "@/components/app/admin/AdminShell";

/** Layout for every /admin page: the sidebar, with the open section in `?tab=`. */
export const Route = createFileRoute("/admin")({
  validateSearch: (s: Record<string, unknown>): { tab?: AdminTab | undefined } =>
    ADMIN_TABS.includes(s["tab"] as AdminTab) ? { tab: s["tab"] as AdminTab } : {},
  component: AdminLayout,
});

function AdminLayout() {
  const { tab = "inbox" } = Route.useSearch();
  return (
    <AdminShell tab={tab}>
      <Outlet />
    </AdminShell>
  );
}
