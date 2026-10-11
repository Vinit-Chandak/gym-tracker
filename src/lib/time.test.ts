import { describe, expect, it } from "vitest";

import {
  dateTimeLocalCandidates,
  formatUtcOffset,
  fromDateTimeLocal,
  timeZoneOffsetMinutes,
  toDateTimeLocal,
} from "./time";

describe("time zone wall-clock conversions", () => {
  it("finds both sides of hour and half-hour clock rollbacks without inventing gap times", () => {
    expect(
      dateTimeLocalCandidates("2025-11-02T01:30", "America/New_York").map((instant) =>
        instant.toISOString(),
      ),
    ).toEqual(["2025-11-02T05:30:00.000Z", "2025-11-02T06:30:00.000Z"]);
    expect(
      dateTimeLocalCandidates("2026-04-05T01:45", "Australia/Lord_Howe").map((instant) =>
        instant.toISOString(),
      ),
    ).toEqual(["2026-04-04T14:45:00.000Z", "2026-04-04T15:15:00.000Z"]);
    expect(dateTimeLocalCandidates("2026-03-08T02:30", "America/New_York")).toEqual([]);
    expect(dateTimeLocalCandidates("2026-02-30T01:00", "Asia/Kolkata")).toEqual([]);
    expect(dateTimeLocalCandidates("2026-09-29T12:00", "Not/A_Time_Zone")).toEqual([]);
    expect(dateTimeLocalCandidates("2026-09-29T12:00", "Asia/Kolkata")).toHaveLength(1);
    expect(formatUtcOffset(-240)).toBe("UTC−04:00");
    expect(formatUtcOffset(330)).toBe("UTC+05:30");
  });
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

  it.each([
    "2026-02-30T10:00",
    "2026-13-01T10:00",
    "2026-09-00T10:00",
    "2026-09-09T24:00",
    "2026-09-09T12:60",
    "2026-09-09T12:00junk",
    "2026-09-09T12:00Z",
  ])("does not silently normalize %s", (local) => {
    expect(fromDateTimeLocal(local, "Asia/Kolkata")).toBeNull();
  });

  it("rejects nonexistent actual times while retaining compatible calendar boundaries", () => {
    expect(
      fromDateTimeLocal("2026-03-08T02:30", "America/New_York", { rejectNonexistent: true }),
    ).toBeNull();
    expect(
      fromDateTimeLocal("2026-03-08T03:30", "America/New_York", {
        rejectNonexistent: true,
      })?.toISOString(),
    ).toBe("2026-03-08T07:30:00.000Z");
    expect(fromDateTimeLocal("2026-03-08T02:30", "America/New_York")).not.toBeNull();
  });

  it.each([
    // Western zones whose clocks jump from midnight to one: the day starts at the jump, not at
    // 23:00 the evening before.
    ["2026-09-06T00:00", "America/Santiago", "2026-09-06T04:00:00.000Z"],
    ["2026-03-08T00:00", "America/Havana", "2026-03-08T05:00:00.000Z"],
    // Eastern ones always did.
    ["2026-04-24T00:00", "Africa/Cairo", "2026-04-23T22:00:00.000Z"],
    ["2026-03-29T00:00", "Asia/Beirut", "2026-03-28T22:00:00.000Z"],
  ])("starts a day whose midnight never happened at the jump: %s in %s", (local, zone, iso) => {
    const start = fromDateTimeLocal(local, zone);
    expect(start?.toISOString()).toBe(iso);
    expect(toDateTimeLocal(start!, zone)).toBe(`${local.slice(0, 10)}T01:00`);
    // So a session at 23:30 the evening before falls before this day starts, in that evening's.
    expect(toDateTimeLocal(new Date(start!.getTime() - 30 * 60_000), zone).slice(11)).toBe("23:30");
  });
});
