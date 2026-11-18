import type { Site } from "./store";
import { distanceM } from "./gst";

export type DiscoveryFilters = { query: string; min: number; max: number; point?: { lat: number; lng: number } | undefined; radiusKm: number };
export function matchesDiscovery(site: Site, filters: DiscoveryFilters) {
  const text = `${site.id} ${site.name} ${site.city} ${site.corridor} ${site.category}`.toLowerCase();
  return site.status === "live" && filters.query.toLowerCase().trim().split(/\s+/).every((word) => text.includes(word))
    && site.monthlyRate >= filters.min && site.monthlyRate <= filters.max
    && (!filters.point || distanceM(site, filters.point) <= filters.radiusKm * 1000);
}