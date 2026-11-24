import { useState } from "react";
import { toast } from "sonner";
import { VENDOR_ROLE_LABELS, type VendorRole } from "@oohrena/shared";
import { Btn, Empty, KCard, Loading, Pill } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { ask } from "@/components/app/ask";
import { selectCls } from "@/lib/format";
import {
  useInviteVendorStaff,
  useRemoveVendorStaff,
  useUpdateVendorStaff,
  useVendorTeam,
  type VendorStaffItem,
} from "@/lib/inventory-api";

export function TeamPanel({ isOwner }: { isOwner: boolean }) {
  const team = useVendorTeam();
  const invite = useInviteVendorStaff();
  const update = useUpdateVendorStaff();
  const remove = useRemoveVendorStaff();

  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<"manager" | "field" | "accounts">("field");
  const [err, setErr] = useState<string>();

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    invite.mutate(
      { name, email, mobile, role },
      {
        onSuccess: () => {
          toast.success("Team member invited");
          setName("");
          setEmail("");
          setMobile("");
          setShowInvite(false);
        },
        onError: (e) => setErr(e.message),
      },
    );
  }

  async function handleRemove(member: VendorStaffItem) {
    const res = await ask({
      title: `Remove ${member.name}?`,
      action: "Remove",
      danger: true,
      body: "They will immediately lose access to your vendor account.",
      required: false,
    });
    if (!res) return;
    remove.mutate(member.userId, {
      onSuccess: () => toast.success("Member removed"),
      onError: (e) => toast.error(e.message),
    });
  }

  async function handleRoleChange(member: VendorStaffItem, newRole: "manager" | "field" | "accounts") {
    if (member.role === newRole) return;
    update.mutate(
      { userId: member.userId, role: newRole },
      {
        onSuccess: () => toast.success("Role updated"),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  if (team.isPending) return <Loading />;
  if (team.isError) return <div className="text-destructive text-[13px]">{team.error.message}</div>;

  const members = team.data ?? [];

  return (
    <KCard
      title="Team"
      right={
        isOwner ? (
          <Btn size="sm" variant={showInvite ? "secondary" : "primary"} onClick={() => setShowInvite((v) => !v)}>
            {showInvite ? "Cancel" : "Invite member"}
          </Btn>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {showInvite && isOwner && (
          <form onSubmit={handleInvite} className="bg-canvas p-4 rounded-lg border border-line space-y-3">
            <h3 className="font-semibold text-ink text-[14px]">Invite team member</h3>
            {err && <FormError message={err} />}
            <div className="grid sm:grid-cols-2 gap-3">
              <Field
                id="team-name"
                label="Full name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Field
                id="team-email"
                type="email"
                label="Email address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Field
                id="team-mobile"
                type="tel"
                label="Mobile number (10 digits)"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
              <div className="space-y-1.5">
                <label htmlFor="team-role" className="text-[13px] text-ink font-medium">
                  Role
                </label>
                <select
                  id="team-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as "manager" | "field" | "accounts")}
                  className={selectCls}
                >
                  <option value="manager">{VENDOR_ROLE_LABELS.manager}</option>
                  <option value="field">{VENDOR_ROLE_LABELS.field}</option>
                  <option value="accounts">{VENDOR_ROLE_LABELS.accounts}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Btn type="submit" size="sm" disabled={invite.isPending}>
                {invite.isPending ? "Inviting…" : "Send invite"}
              </Btn>
            </div>
          </form>
        )}

        {members.length === 0 ? (
          <Empty title="No team members" />
        ) : (
          <div className="divide-y divide-line">
            {members.map((m) => (
              <div key={m.userId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-ink flex items-center gap-2">
                    {m.name}
                    <Pill tone={m.role === "owner" ? "navy" : m.role === "manager" ? "saffron" : m.role === "field" ? "verified" : "neutral"}>
                      {VENDOR_ROLE_LABELS[m.role as VendorRole] ?? m.role}
                    </Pill>
                    {m.status !== "active" && (
                      <Pill tone={m.status === "suspended" ? "danger" : "hold"}>{m.status}</Pill>
                    )}
                  </div>
                  <div className="text-[12px] text-mute mt-0.5">
                    {m.email} · {m.mobile}
                  </div>
                </div>

                {isOwner && m.role !== "owner" && (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m, e.target.value as "manager" | "field" | "accounts")}
                      className="h-8 px-2 text-[12px] bg-card border border-line rounded-lg text-ink"
                    >
                      <option value="manager">{VENDOR_ROLE_LABELS.manager}</option>
                      <option value="field">{VENDOR_ROLE_LABELS.field}</option>
                      <option value="accounts">{VENDOR_ROLE_LABELS.accounts}</option>
                    </select>
                    <Btn size="sm" variant="danger" onClick={() => void handleRemove(m)}>
                      Remove
                    </Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </KCard>
  );
}
