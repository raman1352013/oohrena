import { useSystemOverview } from "@/lib/admin-users-api";
import { fmtDate } from "@/lib/format";
import { Empty, KCard, Loading, Pill, Row, Stats } from "@/components/app/kit";

const str = (d: Record<string, unknown>, k: string) =>
  typeof d[k] === "string" ? d[k] : undefined;

export function SystemOverview() {
  const { data, isLoading } = useSystemOverview();
  if (isLoading || !data) return <Loading />;

  const lastDeploy = data.deployments[0];
  return (
    <div className="space-y-6">
      <Stats
        items={[
          { label: "Errors", value: data.errorCount, tone: data.errorCount ? "danger" : undefined },
          { label: "Last deploy", value: lastDeploy ? fmtDate(lastDeploy.at) : "—" },
        ]}
      />

      <KCard title="Deploys" bodyClass="px-5 divide-y divide-line">
        {data.deployments.length ? (
          data.deployments.map((d) => (
            <Row
              key={d._id}
              k={
                <span className="font-mono">
                  {[str(d.detail, "version"), str(d.detail, "commit"), str(d.detail, "environment")]
                    .filter(Boolean)
                    .join(" · ") || "Release"}
                </span>
              }
              v={fmtDate(d.at)}
            />
          ))
        ) : (
          <Empty title="No deploys" />
        )}
      </KCard>

      <KCard title="Backups" bodyClass="px-5 divide-y divide-line">
        {data.backups.length ? (
          data.backups.map((b) => {
            const bytes = Number(b.detail["sizeBytes"]);
            return (
              <Row
                key={b._id}
                k={
                  <span className="flex items-center gap-2">
                    <Pill tone={b.type === "restore" ? "hold" : "verified"}>{b.type}</Pill>
                    {bytes > 0 && `${Math.round(bytes / 1024)} KB`}
                    {str(b.detail, "status")}
                  </span>
                }
                v={fmtDate(b.at)}
              />
            );
          })
        ) : (
          <Empty title="No backups" />
        )}
      </KCard>

      {data.recentErrors.length > 0 && (
        <KCard title="Recent errors" bodyClass="divide-y divide-line">
          {data.recentErrors.map((err) => (
            <div key={err._id} className="p-4 text-[12px]">
              <div className="text-mute">{fmtDate(err.at)}</div>
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
