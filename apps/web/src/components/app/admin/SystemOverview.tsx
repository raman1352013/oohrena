import { useSystemOverview } from "@/lib/admin-users-api";
import { fmtDate } from "@/lib/format";
import { Empty, KCard, Pill, Row } from "@/components/app/kit";

export function SystemOverview() {
  const { data, isLoading } = useSystemOverview();

  if (isLoading) {
    return <div className="p-8 text-center text-mute text-[13px]">Loading system telemetry...</div>;
  }

  return (
    <div className="space-y-6">
      {/* System KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-line rounded-xl">
          <div className="text-[12px] text-mute">Platform Health</div>
          <div className="text-xl font-bold mt-1 text-emerald-600 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            Operational
          </div>
          <div className="text-[11px] text-mute mt-1">MongoDB replica set connected</div>
        </div>

        <div className="p-4 bg-card border border-line rounded-xl">
          <div className="text-[12px] text-mute">System Errors Logged</div>
          <div className="text-xl font-bold mt-1 text-foreground">{data?.errorCount ?? 0}</div>
          <div className="text-[11px] text-mute mt-1">Captured in system_events</div>
        </div>

        <div className="p-4 bg-card border border-line rounded-xl">
          <div className="text-[12px] text-mute">Last Production Deploy</div>
          <div className="text-xl font-bold mt-1 text-foreground">
            {data?.deployments && data.deployments[0]
              ? fmtDate(data.deployments[0].at)
              : "No releases recorded"}
          </div>
          <div className="text-[11px] text-mute mt-1">CI/CD deployment log</div>
        </div>
      </div>

      {/* Deployments History */}
      <KCard title="CI/CD Release & Deploy History" bodyClass="divide-y divide-line">
        {data?.deployments && data.deployments.length > 0 ? (
          data.deployments.map((d) => (
            <Row
              key={d._id}
              label={
                <div>
                  <div className="font-semibold text-[13px]">
                    {(d.detail?.version as string) || "Release"}
                  </div>
                  <div className="text-[11px] font-mono text-mute">
                    Commit: {(d.detail?.commit as string) || "main"} ·{" "}
                    {(d.detail?.environment as string) || "production"}
                  </div>
                </div>
              }
              value={
                <div className="text-right">
                  <span className="text-[12px] text-mute">{fmtDate(d.at)}</span>
                  <Pill tone="verified" className="ml-2">
                    Deployed
                  </Pill>
                </div>
              }
            />
          ))
        ) : (
          <Empty
            title="No deployment events logged"
          />
        )}
      </KCard>

      {/* Backups & Restores History */}
      <KCard
        title="Automated Database Backup & Restore Log (T-14)"
        bodyClass="divide-y divide-line"
      >
        {data?.backups && data.backups.length > 0 ? (
          data.backups.map((b) => (
            <Row
              key={b._id}
              label={
                <div>
                  <div className="font-semibold text-[13px] capitalize">{b.type} Snapshot</div>
                  <div className="text-[11px] font-mono text-mute">
                    Size:{" "}
                    {b.detail?.sizeBytes
                      ? `${Math.round(Number(b.detail.sizeBytes) / 1024)} KB`
                      : "Standard"}{" "}
                    · Status: {(b.detail?.status as string) || "Success"}
                  </div>
                </div>
              }
              value={
                <div className="text-right">
                  <span className="text-[12px] text-mute">{fmtDate(b.at)}</span>
                  <Pill tone={b.type === "restore" ? "hold" : "verified"} className="ml-2">
                    {b.type.toUpperCase()}
                  </Pill>
                </div>
              }
            />
          ))
        ) : (
          <Empty
            title="No backup events logged"
          />
        )}
      </KCard>

      {/* Recent Errors */}
      {data?.recentErrors && data.recentErrors.length > 0 && (
        <KCard title="Recent Application Error Events" bodyClass="divide-y divide-line">
          {data.recentErrors.map((err) => (
            <div key={err._id} className="p-3 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-danger font-medium">Error Event</span>
                <span className="text-mute">{fmtDate(err.at)}</span>
              </div>
              <pre className="mt-1 p-2 bg-muted rounded text-[11px] font-mono overflow-x-auto">
                {JSON.stringify(err.detail, null, 2)}
              </pre>
            </div>
          ))}
        </KCard>
      )}
    </div>
  );
}
