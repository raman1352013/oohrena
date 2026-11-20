export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const lakh = (n: number) => "₹" + (n / 100000).toFixed(1) + "L";
export function left(ms: number) {
  if (ms <= 0) return "Overdue";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${m % 60}m` : `${m}m left`;
}
export const ist = (t: number) =>
  new Date(t).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }) + " IST";
export const latlng = (lat: number, lng: number) => `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
export const fmtDate = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      })
    : "—";

export const selectCls =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
