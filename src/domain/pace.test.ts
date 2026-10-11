import { describe, expect, it } from "vitest";

import { formatDuration, formatHold, formatPace, holdParts, paceSecondsPerKm } from "./pace";

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

  it("says a hold in seconds under a minute and as a clock from one", () => {
    // A session listed "72 s, 67 s" while a profile's longest hold read "0:51".
    expect(formatHold(51)).toBe("51 s");
    expect(formatHold(59.6)).toBe("1:00");
    expect(formatHold(72)).toBe("1:12");
    expect(formatHold(120)).toBe("2:00");
    expect(holdParts(45)).toEqual({ figure: "45", unit: "s" });
    expect(holdParts(102)).toEqual({ figure: "1:42" });
  });
});
