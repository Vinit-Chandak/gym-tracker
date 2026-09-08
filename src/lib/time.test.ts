import { describe, expect, it } from "vitest";

import { fromDateTimeLocal, timeZoneOffsetMinutes, toDateTimeLocal } from "./time";

describe("time zone wall-clock conversions", () => {
  it("knows Kolkata is UTC+5:30 and London moves with DST", () => {
    expect(timeZoneOffsetMinutes("Asia/Kolkata", new Date("2026-09-08T12:00:00Z"))).toBe(330);
    expect(timeZoneOffsetMinutes("Europe/London", new Date("2026-07-01T12:00:00Z"))).toBe(60);
    expect(timeZoneOffsetMinutes("Europe/London", new Date("2026-01-01T12:00:00Z"))).toBe(0);
  });

  it("round-trips a datetime-local value through the zone", () => {
    const instant = fromDateTimeLocal("2026-09-09T18:30", "Asia/Kolkata");
    expect(instant?.toISOString()).toBe("2026-09-09T13:00:00.000Z");
    expect(toDateTimeLocal(instant as Date, "Asia/Kolkata")).toBe("2026-09-09T18:30");
    expect(toDateTimeLocal(new Date("2026-09-09T23:45:00Z"), "Asia/Kolkata")).toBe(
      "2026-09-10T05:15",
    );
  });

  it("rejects malformed input", () => {
    expect(fromDateTimeLocal("yesterday", "Asia/Kolkata")).toBeNull();
    expect(fromDateTimeLocal("", "Asia/Kolkata")).toBeNull();
  });
});
