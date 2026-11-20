/**
 * Module 10 — the five MVP roles and the role-permission matrix.
 * This file is the single documented source of truth; the API enforces it server-side
 * and the web app uses it only to decide what to show (never as a security boundary).
 */
export const ROLES = ["client", "vendor", "admin", "growth_partner", "finance"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  client: "Client / Agency",
  vendor: "Vendor / Media Owner",
  admin: "Central Admin",
  growth_partner: "Growth Partner",
  finance: "Finance / Audit",
};

/** Scope of a grant: own records, records assigned to the user, or everything. */
export type Scope = "own" | "assigned" | "all";

export const PERMISSIONS = {
  // Module 10 — users & system
  "users.manage": { admin: "all" },
  "users.role.assign": { admin: "all" },
  "audit.read": { admin: "all", finance: "all" },
  "system.deployments.read": { admin: "all" },
  // Module 1 — client portal
  "client.profile": { client: "own" },
  "leads.create": { client: "own", growth_partner: "own", admin: "all" },
  "leads.read": { client: "own", growth_partner: "own", admin: "all" },
  "quotes.decide": { client: "own" },
  "shortlist.manage": { client: "own" },
  // Module 2 — vendor portal
  "vendor.profile": { vendor: "own" },
  "vendor.bank.read": { vendor: "own", finance: "all" },
  "inventory.manage": { vendor: "own", admin: "all" },
  "workorders.read": { vendor: "assigned", admin: "all", client: "own" },
  "workorders.execute": { vendor: "assigned", admin: "all" },
  "proofs.decide": { admin: "all" },
  "issues.manage": { admin: "all" },
  // Module 3 — admin control tower
  "vendors.kyc.decide": { admin: "all" },
  "inventory.decide": { admin: "all" },
  "leads.assign": { admin: "all" },
  "quotes.manage": { admin: "all" },
  "overrides.create": { admin: "all" },
  // Module 5 — availability
  "holds.manage": { admin: "all" },
  "availability.block": { admin: "all", vendor: "own" },
  "availability.respond": { vendor: "own" },
  // Module 8 — finance
  "finance.manage": { finance: "all" },
  /** Recording a payment (maker) — Admin may enter it; only Finance verifies, and never their own entry. */
  "finance.record": { finance: "all", admin: "all" },
  "finance.verify": { finance: "all" },
  "payables.read": { vendor: "own", finance: "all" },
  "payments.read.own": { client: "own" },
  "finance.status.read": { admin: "all", finance: "all" },
  // Module 9 — reports & notifications
  "reports.admin": { admin: "all", finance: "all" },
  "reports.client_campaign": { client: "own", admin: "all", finance: "all" },
  "reports.vendor_performance": { vendor: "own", admin: "all", finance: "all" },
  "notifications.manage": { admin: "all" },
  "notifications.read": { admin: "all" },
  // Module 10 — growth partner
  "partner.earnings.read": { growth_partner: "own", admin: "all", finance: "all" },
} as const satisfies Record<string, Partial<Record<Role, Scope>>>;

export type Permission = keyof typeof PERMISSIONS;

export function scopeFor(role: Role, permission: Permission): Scope | null {
  const grants: Partial<Record<Role, Scope>> = PERMISSIONS[permission];
  return grants[role] ?? null;
}

export const can = (role: Role, permission: Permission) => scopeFor(role, permission) !== null;

/** Roles that must use 2FA once it is enabled (Module 10: optional 2FA for Admin and Finance). */
export const PRIVILEGED_ROLES: readonly Role[] = ["admin", "finance"];
