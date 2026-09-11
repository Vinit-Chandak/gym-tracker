import { describe, expect, it } from "vitest";

import { nextWeeklyReviewPeriod, weeklyReviewPeriod } from "./coach-cadence";
import { isoWeekday } from "./program-calendar";

const DAY_MS = 86_400_000;
// Monday, September 7, 04:00 IST is still Sunday in UTC.
const MONDAY = new Date("2026-09-06T22:30:00Z");

describe("weekly review periods", () => {
  it("returns an exact complete interval at 04:00 IST across the UTC date boundary", () => {
    expect(weeklyReviewPeriod(MONDAY)).toEqual({
      policyVersion: 1,
      timeZone: "Asia/Kolkata",
      reviewDate: "2026-09-07",
      start: "2026-08-30T22:30:00.000Z",
      end: "2026-09-06T22:30:00.000Z",
    });
  });

  it.each([
    [1, "2026-09-14", "2026-09-13T22:30:00.000Z"],
    [2, "2026-09-15", "2026-09-14T22:30:00.000Z"],
    [7, "2026-09-20", "2026-09-19T22:30:00.000Z"],
  ])(
    "switches to weekday %i only after the seven-day minimum",
    (reviewWeekday, reviewDate, end) => {
      const period = nextWeeklyReviewPeriod({ previousScheduledBoundary: MONDAY, reviewWeekday });
      expect(period).toMatchObject({ reviewDate, end });
      expect(new Date(period.end).getTime() - new Date(period.start).getTime()).toBe(7 * DAY_MS);
      expect(MONDAY.toISOString()).toBe("2026-09-06T22:30:00.000Z");
    },
  );

  it("handles a change to an earlier weekday across year end", () => {
    const period = nextWeeklyReviewPeriod({
      previousScheduledBoundary: new Date("2026-12-30T22:30:00Z"), // Thursday, December 31 IST
      reviewWeekday: 3,
    });
    expect(period).toMatchObject({
      reviewDate: "2027-01-13",
      start: "2027-01-05T22:30:00.000Z",
      end: "2027-01-12T22:30:00.000Z",
    });
  });

  it("chooses the first eligible boundary for every old/new weekday pair", () => {
    for (let oldDay = 1; oldDay <= 7; oldDay++) {
      const previousScheduledBoundary = new Date(MONDAY.getTime() + (oldDay - 1) * DAY_MS);
      for (let reviewWeekday = 1; reviewWeekday <= 7; reviewWeekday++) {
        const period = nextWeeklyReviewPeriod({ previousScheduledBoundary, reviewWeekday });
        const elapsed = new Date(period.end).getTime() - previousScheduledBoundary.getTime();
        expect(elapsed).toBeGreaterThanOrEqual(7 * DAY_MS);
        expect(elapsed).toBeLessThan(14 * DAY_MS);
        expect(isoWeekday(period.reviewDate)).toBe(reviewWeekday);
        expect(period.end.endsWith("T22:30:00.000Z")).toBe(true);
      }
    }
  });

  it.each([0, 8, 1.5, NaN])("rejects invalid review weekday %s", (reviewWeekday) => {
    expect(() =>
      nextWeeklyReviewPeriod({ previousScheduledBoundary: MONDAY, reviewWeekday }),
    ).toThrow(/weekday/);
  });

  it.each(["invalid", "2026-09-07T00:00:00Z", "2026-09-06T22:30:00.001Z"])(
    "rejects an invalid or actual execution timestamp as the anchor: %s",
    (value) => {
      expect(() =>
        nextWeeklyReviewPeriod({ previousScheduledBoundary: new Date(value), reviewWeekday: 1 }),
      ).toThrow(/boundary/);
    },
  );
});
