export const GST_RATE = 0.18;
export const HOLD_MS = 48 * 60 * 60 * 1000;
export const GPS_THRESHOLD_M = 50;

export type QuoteLines = { base: number; print: number; mounting: number };

export function computeQuote(l: QuoteLines) {
  const subtotal = Math.round(l.base + l.print + l.mounting);
  const cgst = Math.round(subtotal * 0.09);
  const sgst = Math.round(subtotal * 0.09);
  return { subtotal, cgst, sgst, gst: cgst + sgst, total: subtotal + cgst + sgst };
}

export function holdUntil(sentAt: number) {
  return sentAt + HOLD_MS;
}

export function isHoldActive(until: number | undefined, now = Date.now()) {
  return !!until && until > now;
}

/** Haversine distance in metres */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const gpsPasses = (m: number) => m < GPS_THRESHOLD_M;
