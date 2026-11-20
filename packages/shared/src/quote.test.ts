import { describe, expect, it } from "vitest";
import { cancellationFor, computeQuoteTotals, defaultBillableUnits } from "./quote";

describe("quote maths", () => {
  it("matches a manual calculation (media + production + installation, fee line, 18% GST)", () => {
    // 30-day hoarding at ₹50,000/month + ₹14,400 printing + ₹12,000 mounting, 5% platform fee
    const t = computeQuoteTotals([{ rate: 50000, qty: 1, billableUnits: 1, production: 14400, installation: 12000 }], 5);
    expect(t.subtotal).toBe(76400);
    expect(t.serviceFee).toBe(3820); // 5% of 76,400
    expect(t.taxable).toBe(80220);
    expect(t.cgst).toBe(7220); // 9% of 80,220 = 7,219.8 → 7,220
    expect(t.sgst).toBe(7220);
    expect(t.total).toBe(94660);
  });
  it("multiplies rate × quantity × billable units per line", () => {
    const t = computeQuoteTotals([{ rate: 950, qty: 10, billableUnits: 2, production: 0, installation: 0 }, { rate: 1100, qty: 2, billableUnits: 30, production: 0, installation: 0 }], 0);
    expect(t.items.map((i) => i.media)).toEqual([19000, 66000]);
    expect(t.total).toBe(Math.round(85000 * 1.18));
  });
  it("derives billable units from dates and pricing unit", () => {
    expect(defaultBillableUnits("per_month", "2026-12-01", "2026-12-30")).toBe(1);
    expect(defaultBillableUnits("per_month", "2026-12-01", "2026-12-15")).toBe(0.5);
    expect(defaultBillableUnits("per_day", "2026-12-01", "2026-12-10")).toBe(10);
    expect(defaultBillableUnits("per_sqft", "2026-12-01", "2026-12-10", { widthFt: 40, heightFt: 20 })).toBe(800);
  });
});

describe("cancellation rules", () => {
  it("apply different fees depending on how early the client cancels", () => {
    expect(cancellationFor(100000, "2027-01-31", "2026-12-01")).toMatchObject({ feePct: 10, fee: 10000, refundable: 90000 });
    expect(cancellationFor(100000, "2027-01-31", "2027-01-10")).toMatchObject({ feePct: 25 });
    expect(cancellationFor(100000, "2027-01-31", "2027-01-20")).toMatchObject({ feePct: 50 });
    expect(cancellationFor(100000, "2027-01-31", "2027-02-02")).toMatchObject({ feePct: 100, refundable: 0 });
  });
});
