import { AVAILABILITY_STATE_LABEL, type DayAvailability } from "@oohrena/shared";
import { cn } from "@/lib/utils";

const CELL: Record<string, string> = {
  available: "bg-verified-soft text-verified border-verified/20",
  limited: "bg-verified-soft/60 text-verified border-hold/40",
  hold: "bg-hold-soft text-hold border-hold/30",
  pending_vendor: "bg-hold-soft/60 text-hold border-dashed border-hold/50",
  booked: "bg-navy text-navy-foreground border-navy",
  blocked: "bg-muted text-mute border-line line-through",
  expired: "bg-card text-mute border-line",
};

/** Month grids of days coloured by state. Partly used days (LED slots, fleets) show free/total. */
export function AvailabilityCalendar({
  days,
  unitLabel,
  showUnits,
}: {
  days: DayAvailability[];
  unitLabel?: string;
  showUnits?: boolean;
}) {
  if (!days.length) return null;
  const months = new Map<string, DayAvailability[]>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(d);
  }
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-4">
        {[...months.entries()].map(([k, list]) => {
          const first = new Date(`${list[0]!.date}T00:00:00Z`);
          const lead = (first.getUTCDay() + 6) % 7; // Monday-first
          return (
            <div key={k}>
              <div className="text-[12px] font-semibold mb-1.5">
                {first.toLocaleDateString("en-IN", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </div>
              <div className="grid grid-cols-7 gap-1 text-[10px] text-center">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div key={i} className="text-mute">
                    {d}
                  </div>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <div key={`e${i}`} />
                ))}
                {list.map((d) => {
                  const partial = d.state === "available" && d.used > 0;
                  return (
                    <div
                      key={d.date}
                      title={`${d.date}: ${partial ? `${d.free} of ${d.capacity} ${unitLabel ?? ""} free` : AVAILABILITY_STATE_LABEL[d.state]}`}
                      className={cn(
                        "h-7 rounded border grid place-items-center leading-none",
                        CELL[partial ? "limited" : d.state],
                      )}
                    >
                      <span>{Number(d.date.slice(8))}</span>
                      {showUnits && d.capacity > 1 && (
                        <span className="text-[8px] opacity-80">
                          {d.free}/{d.capacity}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-mute">
        {(["available", "limited", "hold", "pending_vendor", "booked", "blocked"] as const).map(
          (s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn("w-3 h-3 rounded border", CELL[s])} />
              {s === "limited" ? "Partly taken" : AVAILABILITY_STATE_LABEL[s]}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
