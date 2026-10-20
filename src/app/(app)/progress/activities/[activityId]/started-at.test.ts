import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { startedAtLine } from "./started-at";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

it("says which run it is by its day and time where it was recorded", () => {
  // Liam's run of Saturday morning in Los Angeles.
  const run = new Date("2026-10-10T12:47:00Z");
  expect(startedAtLine(run, "America/Los_Angeles", "America/Los_Angeles")).toMatch(
    /^Sat\s10\sOct,\s05:47$/,
  );
  // Recorded in another zone, it says which rather than moving into today's.
  expect(startedAtLine(run, "America/Los_Angeles", "Europe/London")).toMatch(
    /^Sat\s10\sOct,\s05:47 \(America\/Los Angeles\)$/,
  );
  // Another year names its year.
  expect(startedAtLine(new Date("2025-10-15T15:00:00Z"), "UTC", "UTC")).toMatch(/2025/);
});
