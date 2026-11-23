import { useState } from "react";
import type { Role } from "@oohrena/shared";
import { ROLE_LABELS } from "@oohrena/shared";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Btn, Empty, KCard, Loading, Notice, Pill } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { fmtDate, selectCls } from "@/lib/format";
import { cn } from "@/lib/utils";
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

const ROLES = Object.keys(ROLE_LABELS) as Role[];
const STAFF_ROLES = ["admin", "finance", "growth_partner"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const roleTone = (r: Role) =>
  r === "admin"
    ? "danger"
    : r === "finance"
      ? "verified"
      : r === "growth_partner"
        ? "hold"
        : "neutral";
const statusTone = (s: AdminUserItem["status"]) =>
  s === "active" ? "verified" : s === "suspended" ? "danger" : "hold";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function UserManagement() {
  const [role, setRole] = useState<Role | undefined>();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useAdminUsers({ role, q: search || undefined });
  const suspend = useSuspendUser();
  const reactivate = useReactivateUser();
  const [creating, setCreating] = useState(false);
  const [sessionsFor, setSessionsFor] = useState<AdminUserItem | null>(null);
  const [roleFor, setRoleFor] = useState<AdminUserItem | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className={cn(selectCls, "sm:w-64")}
        />
        <select
          aria-label="Role"
          value={role ?? ""}
          onChange={(e) => setRole(e.target.value ? (e.target.value as Role) : undefined)}
          className={cn(selectCls, "sm:w-48")}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <Btn className="sm:ml-auto" onClick={() => setCreating(true)}>
          Add staff
        </Btn>
      </div>

      <KCard title={`Users · ${data?.total ?? 0}`} bodyClass="divide-y divide-line">
        {isLoading ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty title="No users" />
        ) : (
          data.items.map((u) => (
            <div
              key={u.userId}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[13px]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{u.fullName}</span>
                  <Pill tone={roleTone(u.role)}>{ROLE_LABELS[u.role]}</Pill>
                  <Pill tone={statusTone(u.status)}>{u.status}</Pill>
                  {u.twoFactorEnabled && <Pill tone="verified">2FA</Pill>}
                </div>
                <div className="text-[12px] text-mute mt-1 truncate">
                  <span className="font-mono">{u.userId}</span> · {u.email}
                  {u.orgId && ` · ${u.orgId}`} ·{" "}
                  {u.lastLoginAt ? `Last sign-in ${fmtDate(u.lastLoginAt)}` : "Never signed in"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn size="sm" variant="secondary" onClick={() => setSessionsFor(u)}>
                  Sessions
                </Btn>
                <Btn size="sm" variant="secondary" onClick={() => setRoleFor(u)}>
                  Role
                </Btn>
                {u.status === "active" ? (
                  <Btn
                    size="sm"
                    variant="danger"
                    disabled={suspend.isPending}
                    onClick={() => {
                      if (confirm(`Suspend ${u.email}? This signs them out everywhere.`))
                        suspend.mutate(u.userId);
                    }}
                  >
                    Suspend
                  </Btn>
                ) : (
                  <Btn
                    size="sm"
                    variant="secondary"
                    disabled={reactivate.isPending}
                    onClick={() => reactivate.mutate(u.userId)}
                  >
                    Reactivate
                  </Btn>
                )}
              </div>
            </div>
          ))
        )}
      </KCard>

      <CreateStaffDialog open={creating} onClose={() => setCreating(false)} />
      {sessionsFor && <SessionsDialog user={sessionsFor} onClose={() => setSessionsFor(null)} />}
      {roleFor && <RoleDialog user={roleFor} onClose={() => setRoleFor(null)} />}
    </div>
  );
}

function CreateStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateStaffUser();
  const blank = { fullName: "", email: "", mobile: "", role: "admin" as StaffRole };
  const [f, setF] = useState(blank);
  const [done, setDone] = useState<{ inviteSent: boolean; link?: string | undefined } | null>(null);
  const [error, setError] = useState<string>();
  const close = () => {
    setF(blank);
    setDone(null);
    setError(undefined);
    onClose();
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    create.mutate(f, {
      onSuccess: (r) => setDone({ inviteSent: r.inviteSent, link: r.devInviteLink }),
      onError: (err) => setError(errMsg(err)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="space-y-4">
            {done.inviteSent ? (
              <Notice>Invitation sent to {f.email}. It expires in 7 days.</Notice>
            ) : (
              <Notice tone="hold">
                Account created, but the invitation email failed. Ask {f.email} to use “Forgot
                password”.
              </Notice>
            )}
            {done.link && (
              <Field
                id="invite-link"
                label="Set-password link (development)"
                readOnly
                value={done.link}
              />
            )}
            <div className="flex justify-end">
              <Btn onClick={close}>Done</Btn>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <FormError message={error} />
            <Field
              id="staff-name"
              label="Name"
              required
              value={f.fullName}
              onChange={(e) => setF({ ...f, fullName: e.target.value })}
            />
            <Field
              id="staff-email"
              label="Email"
              type="email"
              required
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
            <Field
              id="staff-mobile"
              label="Mobile"
              type="tel"
              required
              value={f.mobile}
              onChange={(e) => setF({ ...f, mobile: e.target.value })}
            />
            <label className="block space-y-1.5 text-[13px] text-ink">
              Role
              <select
                value={f.role}
                onChange={(e) => setF({ ...f, role: e.target.value as StaffRole })}
                className={selectCls}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" variant="secondary" onClick={close}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={create.isPending}>
                {create.isPending ? "Adding…" : "Add"}
              </Btn>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SessionsDialog({ user, onClose }: { user: AdminUserItem; onClose: () => void }) {
  const { data, isLoading } = useUserSessions(user.userId);
  const revoke = useRevokeSession();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sessions · {user.fullName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto divide-y divide-line border border-line rounded-lg">
          {isLoading ? (
            <Loading />
          ) : !data?.length ? (
            <Empty title="No active sessions" />
          ) : (
            data.map((s) => (
              <div
                key={s.sessionId}
                className="p-3 flex items-center justify-between gap-3 text-[12px]"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.device || "Unknown device"}</div>
                  <div className="text-mute">
                    {s.ip || "Unknown IP"} · {fmtDate(s.lastSeenAt)}
                  </div>
                </div>
                <Btn
                  size="sm"
                  variant="danger"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ userId: user.userId, sessionId: s.sessionId })}
                >
                  Revoke
                </Btn>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ user, onClose }: { user: AdminUserItem; onClose: () => void }) {
  const assign = useAssignUserRole();
  const [role, setRole] = useState<Role>(user.role);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    assign.mutate(
      { userId: user.userId, role, reason },
      { onSuccess: onClose, onError: (err) => setError(errMsg(err)) },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Role · {user.fullName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <FormError message={error} />
          <label className="block space-y-1.5 text-[13px] text-ink">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={selectCls}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-[13px] text-ink">
            Reason
            <Textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Btn type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Btn>
            <Btn type="submit" disabled={assign.isPending || !reason.trim() || role === user.role}>
              {assign.isPending ? "Saving…" : "Save"}
            </Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
