import { expect, it } from "vitest";
import { parseDateRange, parseWeekRangeOrDefault } from "./date-range";
it("includes the whole final date in the profile time zone", () => {
  const range = parseDateRange({ from: "2026-09-08", to: "2026-09-08" }, "Asia/Kolkata");
  expect(range.start.toISOString()).toBe("2026-09-07T18:30:00.000Z");
  expect(range.end.toISOString()).toBe("2026-09-08T18:30:00.000Z");
});

it("keeps malformed and out-of-range chart weeks on a usable seven-day window", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  for (const input of ["2026-02-30", "9999-99-99", "9999-12-31", ["2026-09-22"], "bad"]) {
    const result = parseWeekRangeOrDefault(input, "Asia/Kolkata", now);
    expect(result.range.from).toBe("2026-09-21");
    expect(result.range.to).toBe("2026-09-27");
    expect(result.error).toMatch(/Showing this week/);
  }
  expect(parseWeekRangeOrDefault("2026-02-28", "UTC", now).range.from).toBe("2026-02-23");
  expect(parseWeekRangeOrDefault(undefined, "UTC", now).error).toBeNull();
});
it("rejects rolled-over, reversed and excessive date ranges", () => {
  for (const input of [
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "2026-09-09", to: "2026-09-08" },
    { from: "2020-01-01", to: "2026-09-08" },
  ])
    expect(() => parseDateRange(input, "Asia/Kolkata")).toThrow();
});
