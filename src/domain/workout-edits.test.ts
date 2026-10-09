import { describe, expect, it } from "vitest";

import { canEditWorkout, lastEditDay } from "./workout-edits";

describe("a finished workout's week of changes", () => {
  it("runs to the seventh day after the day it was trained", () => {
    expect(lastEditDay("2026-10-02")).toBe("2026-10-09");
    expect(lastEditDay("2026-12-28")).toBe("2027-01-04");
  });

  it("is counted in days of the athlete's own time zone, not hours", () => {
    // Thursday 2 October at 22:30 in Kolkata is 17:00 UTC.
    const started = new Date("2026-10-02T17:00:00Z");
    const zone = "Asia/Kolkata";
    // Late on the seventh day after it, there, it is still open.
    expect(canEditWorkout(started, zone, new Date("2026-10-09T18:00:00Z"))).toBe(true);
    // Just past midnight on the eighth, it is closed.
    expect(canEditWorkout(started, zone, new Date("2026-10-09T18:31:00Z"))).toBe(false);
    // Read in UTC it was still the 2nd, so UTC's eighth day starts later.
    expect(canEditWorkout(started, "UTC", new Date("2026-10-09T23:59:00Z"))).toBe(true);
  });

  it("dates a workout by when it started, however late it finished", () => {
    const started = new Date("2026-10-02T18:00:00Z"); // 23:30 on the 2nd in Kolkata
    expect(canEditWorkout(started, "Asia/Kolkata", new Date("2026-10-09T18:00:00Z"))).toBe(true);
  });
});
