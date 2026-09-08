import { describe, expect, it } from "vitest";

import { formatDuration, formatPace, paceSecondsPerKm } from "./pace";

describe("run pace", () => {
  it("computes seconds per km from distance and duration", () => {
    // 5 km in 33:05 → 397 s/km → 6:37/km
    expect(paceSecondsPerKm(5000, 1985)).toBe(397);
    expect(formatPace(paceSecondsPerKm(5000, 1985))).toBe("6:37");
    // 2.2 km at 5:30/km → 726 s total
    expect(formatPace(paceSecondsPerKm(2200, 726))).toBe("5:30");
  });

  it("refuses to divide by zero distance or duration", () => {
    expect(paceSecondsPerKm(0, 600)).toBeNull();
    expect(paceSecondsPerKm(1000, 0)).toBeNull();
    expect(formatPace(null)).toBe("—");
  });

  it("formats durations", () => {
    expect(formatDuration(1985)).toBe("33:05");
    expect(formatDuration(3730)).toBe("1:02:10");
    expect(formatDuration(59)).toBe("0:59");
  });
});
