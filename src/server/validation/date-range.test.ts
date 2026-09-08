import { expect, it } from "vitest";
import { parseDateRange } from "./date-range";
it("includes the whole final date in the profile time zone", () => {
  const range = parseDateRange({ from: "2026-09-08", to: "2026-09-08" }, "Asia/Kolkata");
  expect(range.start.toISOString()).toBe("2026-09-07T18:30:00.000Z");
  expect(range.end.toISOString()).toBe("2026-09-08T18:30:00.000Z");
});
it("rejects rolled-over, reversed and excessive date ranges", () => {
  for (const input of [
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "2026-09-09", to: "2026-09-08" },
    { from: "2020-01-01", to: "2026-09-08" },
  ])
    expect(() => parseDateRange(input, "Asia/Kolkata")).toThrow();
});
