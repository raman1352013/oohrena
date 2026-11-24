import { useState } from "react";
import { toast } from "sonner";
import { isSensitiveSetting, type SystemSettingItem } from "@oohrena/shared";
import { Btn, Empty, KCard, Loading, Pill, Stats } from "@/components/app/kit";
import { ask } from "@/components/app/ask";
import { fmtDate } from "@/lib/format";
import { useApproveSetting, useSystemSettings, useUpdateSetting } from "@/lib/settings-api";

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function SettingsPanel() {
  const { data: settings, isLoading, isError, error } = useSystemSettings();
  const update = useUpdateSetting();
  const approve = useApproveSetting();
  const [filter, setFilter] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");
  const [editErr, setEditErr] = useState<string | null>(null);

  if (isLoading) return <Loading />;
  if (isError) return <div className="text-destructive text-[13px]">{error.message}</div>;

  const items = settings ?? [];
  const pendingCount = items.filter((s) => s.status === "pending_approval").length;

  const filtered = items.filter(
    (s) =>
      s.key.toLowerCase().includes(filter.toLowerCase()) ||
      formatVal(s.value).toLowerCase().includes(filter.toLowerCase()),
  );

  function startEdit(item: SystemSettingItem) {
    setEditingKey(item.key);
    setEditValue(formatVal(item.value));
    setEditReason("");
    setEditErr(null);
  }

  function handleSaveEdit(e: React.FormEvent, key: string) {
    e.preventDefault();
    setEditErr(null);
    if (!editReason.trim() || editReason.trim().length < 3) {
      setEditErr("Reason must be at least 3 characters");
      return;
    }

    let parsedVal: unknown = editValue;
    try {
      parsedVal = JSON.parse(editValue);
    } catch {
      parsedVal = editValue;
    }

    update.mutate(
      { key, value: parsedVal, reason: editReason.trim() },
      {
        onSuccess: (res) => {
          if (res.status === "pending_approval") {
            toast.success("Change submitted for maker-checker approval");
          } else {
            toast.success("Setting updated");
          }
          setEditingKey(null);
        },
        onError: (e) => setEditErr(e.message),
      },
    );
  }

  async function handleApprove(item: SystemSettingItem) {
    const res = await ask({
      title: `Approve change for ${item.key}?`,
      action: "Approve",
      label: "Approval note",
      body: (
        <div className="space-y-1 text-[12px] text-mute mb-2">
          <div>Proposed value: <code className="text-ink font-semibold">{formatVal(item.pendingValue)}</code></div>
          <div>Requested by: <span className="font-semibold">{item.pendingChangedBy}</span></div>
          <div>Reason: <span className="italic">{item.pendingReason}</span></div>
        </div>
      ),
      required: false,
    });
    if (!res) return;

    approve.mutate(
      { key: item.key, reason: res.reason || undefined },
      {
        onSuccess: () => toast.success("Setting change approved"),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="space-y-5">
      <Stats
        items={[
          { label: "Total Settings", value: items.length },
          {
            label: "Pending Approvals",
            value: pendingCount,
            tone: pendingCount > 0 ? "hold" : undefined,
            alert: pendingCount > 0 ? `${pendingCount} need maker-checker` : undefined,
          },
        ]}
      />

      <KCard
        title="System Settings & Thresholds"
        right={
          <input
            type="search"
            placeholder="Filter settings…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 px-2.5 text-[12px] bg-card border border-line rounded-lg text-ink w-48"
          />
        }
      >
        {filtered.length === 0 ? (
          <Empty title="No settings match filter" />
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((s) => {
              const sensitive = isSensitiveSetting(s.key);
              const isPending = s.status === "pending_approval";
              const isEditing = editingKey === s.key;
              return (
                <div key={s.key} className="py-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-ink text-[13px]">{s.key}</span>
                        {sensitive && <Pill tone="navy">Maker-Checker</Pill>}
                        {isPending && <Pill tone="hold">Pending Approval</Pill>}
                      </div>

                      <div className="text-[12px] text-mute flex flex-wrap items-center gap-x-4 gap-y-1">
                        <div>
                          Value: <code className="text-ink font-semibold bg-muted px-1.5 py-0.5 rounded">{formatVal(s.value)}</code>
                        </div>
                        {isPending && (
                          <div>
                            Proposed: <code className="text-saffron-deep font-semibold bg-saffron/10 px-1.5 py-0.5 rounded">{formatVal(s.pendingValue)}</code>
                          </div>
                        )}
                        <div>v{s.version}</div>
                        <div>Effective {fmtDate(s.effectiveFrom)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isPending && (
                        <Btn size="sm" variant="primary" onClick={() => void handleApprove(s)}>
                          Approve
                        </Btn>
                      )}
                      <Btn size="sm" variant="secondary" onClick={() => (isEditing ? setEditingKey(null) : startEdit(s))}>
                        {isEditing ? "Cancel" : "Edit"}
                      </Btn>
                    </div>
                  </div>

                  {isEditing && (
                    <form onSubmit={(e) => handleSaveEdit(e, s.key)} className="bg-canvas p-4 rounded-lg border border-line space-y-3 text-[13px]">
                      {editErr && <div className="text-destructive text-[12px]">{editErr}</div>}
                      {sensitive && (
                        <div className="text-[12px] text-saffron-deep font-medium">
                          Note: This setting is sensitive. Changes require maker-checker approval by another administrator.
                        </div>
                      )}
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[12px] text-ink font-medium block mb-1">New value</label>
                          <input
                            required
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full h-9 px-3 bg-card border border-line rounded-lg text-ink font-mono text-[12px]"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] text-ink font-medium block mb-1">Reason for change</label>
                          <input
                            required
                            placeholder="Reason for updating threshold"
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            className="w-full h-9 px-3 bg-card border border-line rounded-lg text-ink text-[12px]"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <Btn size="sm" variant="secondary" type="button" onClick={() => setEditingKey(null)}>
                          Cancel
                        </Btn>
                        <Btn size="sm" type="submit" disabled={update.isPending}>
                          {update.isPending ? "Saving…" : "Save change"}
                        </Btn>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </KCard>
    </div>
  );
}
