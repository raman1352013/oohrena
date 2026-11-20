import { describe, expect, it } from "vitest";
import { gpsLabel, proofScheduleFor } from "./execution";

describe("proof schedule", () => {
  it("has installation, weekly checks and end-of-campaign proof", () => {
    expect(proofScheduleFor("2026-12-01", "2026-12-30")).toEqual([
      { type: "before", dueDate: "2026-12-01" }, { type: "periodic", dueDate: "2026-12-08" }, { type: "periodic", dueDate: "2026-12-15" },
      { type: "periodic", dueDate: "2026-12-22" }, { type: "periodic", dueDate: "2026-12-29" }, { type: "after", dueDate: "2026-12-30" },
    ]);
    expect(proofScheduleFor("2026-12-01", "2026-12-01")).toEqual([{ type: "before", dueDate: "2026-12-01" }]);
  });
});

describe("GPS label", () => {
  it("states exactly what was captured", () => {
    expect(gpsLabel({ gpsSource: "none" })).toBe("Location not captured");
    expect(gpsLabel({ gpsSource: "device", distanceM: 24, accuracyM: 8 })).toBe("Location captured by device (±8 m) · 24 m from site");
    expect(gpsLabel({ gpsSource: "device" })).not.toMatch(/verified/i);
  });
});
