import { useState } from "react";
import type { Role } from "@oohrena/shared";
import { ROLE_LABELS } from "@oohrena/shared";
import { Btn, Empty, KCard, Pill } from "@/components/app/kit";
import { fmtDate } from "@/lib/format";
import {
  useAdminUsers,
  useAssignUserRole,
  useCreateStaffUser,
  useReactivateUser,
  useRevokeSession,
  useSuspendUser,
  useUserSessions,
  type AdminUserItem,
} from "@/lib/admin-users-api";

export function UserManagement() {
  const [roleFilter, setRoleFilter] = useState<Role | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminUsers({ role: roleFilter, q: search || undefined, page });
  const suspendUser = useSuspendUser();
  const reactivateUser = useReactivateUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [sessionsUser, setSessionsUser] = useState<AdminUserItem | null>(null);
  const [roleUser, setRoleUser] = useState<AdminUserItem | null>(null);

  return (
    <div className="space-y-4">
      {/* Search and Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-xl border border-line">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or ID..."
            className="h-9 px-3 rounded-lg border border-line bg-card text-[13px] w-64"
          />
          <select
            value={roleFilter ?? ""}
            onChange={(e) => setRoleFilter(e.target.value ? (e.target.value as Role) : undefined)}
            className="h-9 px-3 rounded-lg border border-line bg-card text-[13px]"
          >
            <option value="">All Roles</option>
            <option value="admin">Central Admin</option>
            <option value="finance">Finance / Audit</option>
            <option value="growth_partner">Growth Partner</option>
            <option value="vendor">Vendor / Media Owner</option>
            <option value="client">Client / Advertiser</option>
          </select>
        </div>
        <Btn tone="primary" onClick={() => setCreateOpen(true)}>
          + Add Staff Account
        </Btn>
      </div>

      {/* Users Table */}
      <KCard title={`Registered Accounts (${data?.total ?? 0})`} bodyClass="divide-y divide-line">
        {isLoading ? (
          <div className="p-8 text-center text-mute text-[13px]">Loading user accounts...</div>
        ) : data?.items && data.items.length > 0 ? (
          data.items.map((u) => (
            <div
              key={u.userId}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[13px]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-medium">{u.userId}</span>
                  <Pill
                    tone={
                      u.role === "admin"
                        ? "danger"
                        : u.role === "finance"
                          ? "verified"
                          : u.role === "growth_partner"
                            ? "hold"
                            : "neutral"
                    }
                  >
                    {ROLE_LABELS[u.role] ?? u.role}
                  </Pill>
                  <Pill
                    tone={
                      u.status === "active"
                        ? "verified"
                        : u.status === "suspended"
                          ? "danger"
                          : "hold"
                    }
                  >
                    {u.status}
                  </Pill>
                  {u.twoFactorEnabled && (
                    <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      2FA
                    </span>
                  )}
                </div>
                <div className="font-semibold mt-1">{u.fullName}</div>
                <div className="text-[12px] text-mute">
                  {u.email} {u.orgId ? `· ${u.orgId}` : ""}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-mute mr-2">
                  {u.lastLoginAt ? `Active ${fmtDate(u.lastLoginAt)}` : "Never logged in"}
                </span>
                <Btn size="sm" tone="secondary" onClick={() => setSessionsUser(u)}>
                  Sessions
                </Btn>
                <Btn size="sm" tone="secondary" onClick={() => setRoleUser(u)}>
                  Change Role
                </Btn>
                {u.status === "active" ? (
                  <Btn
                    size="sm"
                    tone="danger"
                    disabled={suspendUser.isPending}
                    onClick={() => {
                      if (
                        confirm(`Suspend user ${u.email}? All active sessions will be revoked.`)
                      ) {
                        void suspendUser.mutateAsync(u.userId);
                      }
                    }}
                  >
                    Suspend
                  </Btn>
                ) : (
                  <Btn
                    size="sm"
                    tone="primary"
                    disabled={reactivateUser.isPending}
                    onClick={() => void reactivateUser.mutateAsync(u.userId)}
                  >
                    Reactivate
                  </Btn>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty title="No accounts found" />
        )}
      </KCard>

      {/* Create Staff Modal */}
      {createOpen && <CreateStaffModal onClose={() => setCreateOpen(false)} />}

      {/* User Sessions Modal */}
      {sessionsUser && (
        <UserSessionsModal user={sessionsUser} onClose={() => setSessionsUser(null)} />
      )}

      {/* Change Role Modal */}
      {roleUser && <ChangeRoleModal user={roleUser} onClose={() => setRoleUser(null)} />}
    </div>
  );
}

function CreateStaffModal({ onClose }: { onClose: () => void }) {
  const createStaff = useCreateStaffUser();
  const [form, setForm] = useState<{
    fullName: string;
    email: string;
    mobile: string;
    role: "admin" | "finance" | "growth_partner";
  }>({
    fullName: "",
    email: "",
    mobile: "",
    role: "admin",
  });
  const [inviteResult, setInviteResult] = useState<{ inviteSent: boolean; devInviteLink?: string | undefined; email: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await createStaff.mutateAsync(form);
      setInviteResult({ inviteSent: res.inviteSent, devInviteLink: res.devInviteLink, email: form.email });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create staff account");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-line rounded-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold">Add Named Staff Account</h2>

        {inviteResult ? (
          <div className="space-y-4">
            {inviteResult.inviteSent ? (
              <div className="p-3 bg-emerald-50 text-emerald-800 text-[13px] rounded-lg border border-emerald-200">
                Staff account created. A set-password invitation was emailed to{" "}
                <strong>{inviteResult.email}</strong> (valid for 7 days).
              </div>
            ) : (
              <div className="p-3 bg-amber-50 text-amber-900 text-[13px] rounded-lg border border-amber-200">
                Staff account created, but the invitation email could not be sent. Check the email
                settings, then ask <strong>{inviteResult.email}</strong> to use "Forgot password".
              </div>
            )}
            {inviteResult.devInviteLink && (
              <div>
                <label className="block text-[12px] font-medium text-mute mb-1">
                  Development only: set-password link
                </label>
                <input
                  readOnly
                  type="text"
                  value={inviteResult.devInviteLink}
                  className="w-full font-mono text-[12px] p-2 rounded border border-line bg-muted"
                />
              </div>
            )}
            <div className="flex justify-end">
              <Btn tone="primary" onClick={onClose}>
                Done
              </Btn>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="p-3 bg-red-50 text-red-800 text-[13px] rounded-lg border border-red-200">
                {error}
              </div>
            )}
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">Full Name *</label>
              <input
                required
                type="text"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full h-9 rounded-lg border border-line bg-card px-3 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">
                Email Address *
              </label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full h-9 rounded-lg border border-line bg-card px-3 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">
                Mobile Number *
              </label>
              <input
                required
                type="text"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="+91..."
                className="w-full h-9 rounded-lg border border-line bg-card px-3 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-mute mb-1">Staff Role *</label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as "admin" | "finance" | "growth_partner",
                  })
                }
                className="w-full h-9 rounded-lg border border-line bg-card px-3 text-[13px]"
              >
                <option value="admin">Central Admin</option>
                <option value="finance">Finance / Audit</option>
                <option value="growth_partner">Growth Partner</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" tone="secondary" onClick={onClose}>
                Cancel
              </Btn>
              <Btn type="submit" tone="primary" disabled={createStaff.isPending}>
                {createStaff.isPending ? "Creating..." : "Create Account"}
              </Btn>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function UserSessionsModal({ user, onClose }: { user: AdminUserItem; onClose: () => void }) {
  const { data: sessions, isLoading } = useUserSessions(user.userId);
  const revokeSession = useRevokeSession();

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-line rounded-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Active Sessions for {user.fullName}</h2>
          <Btn size="sm" tone="secondary" onClick={onClose}>
            Close
          </Btn>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-line border border-line rounded-lg">
          {isLoading ? (
            <div className="p-4 text-center text-mute text-[13px]">Loading active sessions...</div>
          ) : sessions && sessions.length > 0 ? (
            sessions.map((s) => (
              <div
                key={s.sessionId}
                className="p-3 flex items-center justify-between gap-3 text-[12px]"
              >
                <div>
                  <div className="font-mono text-[11px] text-mute">{s.sessionId}</div>
                  <div className="font-medium">{s.device || "Unknown Device"}</div>
                  <div className="text-mute">
                    {s.ip || "Unknown IP"} · Last seen {fmtDate(s.lastSeenAt)}
                  </div>
                </div>
                <Btn
                  size="sm"
                  tone="danger"
                  disabled={revokeSession.isPending}
                  onClick={() =>
                    void revokeSession.mutateAsync({ userId: user.userId, sessionId: s.sessionId })
                  }
                >
                  Revoke
                </Btn>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-mute text-[13px]">No active sessions found.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangeRoleModal({ user, onClose }: { user: AdminUserItem; onClose: () => void }) {
  const assignRole = useAssignUserRole();
  const [role, setRole] = useState<Role>(user.role);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await assignRole.mutateAsync({ userId: user.userId, role, reason });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to change user role");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-line rounded-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold">Change Role for {user.fullName}</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="p-3 bg-red-50 text-red-800 text-[13px] rounded-lg border border-red-200">
              {error}
            </div>
          )}
          <div>
            <label className="block text-[12px] font-medium text-mute mb-1">
              Select New Role *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full h-9 rounded-lg border border-line bg-card px-3 text-[13px]"
            >
              <option value="admin">Central Admin</option>
              <option value="finance">Finance / Audit</option>
              <option value="growth_partner">Growth Partner</option>
              <option value="vendor">Vendor / Media Owner</option>
              <option value="client">Client / Advertiser</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-mute mb-1">
              Mandatory Justification / Reason *
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State the operational reason for changing this user's role..."
              className="w-full rounded-lg border border-line bg-card p-2 text-[13px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn type="button" tone="secondary" onClick={onClose}>
              Cancel
            </Btn>
            <Btn type="submit" tone="primary" disabled={assignRole.isPending || !reason.trim()}>
              {assignRole.isPending ? "Assigning..." : "Apply Role Change"}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
