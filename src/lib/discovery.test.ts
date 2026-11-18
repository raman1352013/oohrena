import { describe, expect, it } from "vitest";
import { getState } from "./store";
import { matchesDiscovery } from "./discovery";

describe("Marketplace discovery", () => {
  const site = getState().sites.find((item) => item.id === "ST-101");
  if (!site) throw new Error("Missing test inventory");
  const filters = { query: "Bandra Mumbai", min: 0, max: Infinity, radiusKm: 5 };
  it("matches locality and city together", () => {
    expect(matchesDiscovery(site, filters)).toBe(true);
    expect(matchesDiscovery(site, { ...filters, query: "Delhi" })).toBe(false);
  });
  it("excludes pending and rejected inventory", () => {
    expect(matchesDiscovery({ ...site, status: "pending" }, filters)).toBe(false);
    expect(matchesDiscovery({ ...site, status: "rejected" }, filters)).toBe(false);
  });
  it("applies the monthly budget range", () => {
    expect(matchesDiscovery(site, { ...filters, min: 120000, max: 120000 })).toBe(true);
    expect(matchesDiscovery(site, { ...filters, max: 119999 })).toBe(false);
  });
  it("uses the requested GPS radius", () => {
    expect(matchesDiscovery(site, { ...filters, point: site })).toBe(true);
    expect(matchesDiscovery(site, { ...filters, point: { lat: 28.5672, lng: 77.21 } })).toBe(false);
  });
});