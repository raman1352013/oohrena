import { describe, expect, it } from "vitest";
import { computeQuote, holdUntil, isHoldActive, gpsPasses } from "./gst";

describe("OOHRENA business rules", () => {
  it("adds 18% GST split as 9% CGST + 9% SGST", () => {
    const q = computeQuote({ base: 120000, print: 14400, mounting: 12000 });
    expect(q.subtotal).toBe(146400);
    expect(q.cgst).toBe(13176);
    expect(q.sgst).toBe(13176);
    expect(q.total).toBe(172752);
  });
  it("holds inventory for exactly 48 hours after dispatch", () => {
    const sent = 1_000_000;
    expect(holdUntil(sent) - sent).toBe(48 * 3600 * 1000);
    expect(isHoldActive(holdUntil(sent), sent + 47 * 3600 * 1000)).toBe(true);
    expect(isHoldActive(holdUntil(sent), sent + 49 * 3600 * 1000)).toBe(false);
  });
  it("GPS proof must be under 50 m from the registered asset", () => {
    expect(gpsPasses(22)).toBe(true);
    expect(gpsPasses(50)).toBe(false);
  });
});
