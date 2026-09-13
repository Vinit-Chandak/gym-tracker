import { describe, expect, it } from "vitest";

import {
  MAX_REVIEW_INTERVAL_DAYS,
  MIN_REVIEW_INTERVAL_DAYS,
  reviewStanding,
  reviewWeekdayFor,
  weeklyReviewPeriod,
  type ReviewStanding,
} from "./coach-cadence";

const DAY_MS = 86_400_000;
// Monday, September 7, 04:00 IST is still Sunday in UTC.
const MONDAY = new Date("2026-09-06T22:30:00Z");
const before = (days: number) => new Date(MONDAY.getTime() - days * DAY_MS);

describe("what a review reads", () => {
  it("covers the interval from the previous review's end to this boundary", () => {
    expect(weeklyReviewPeriod(before(7), MONDAY)).toEqual({
      policyVersion: 2,
      timeZone: "Asia/Kolkata",
      reviewDate: "2026-09-07",
      start: "2026-08-30T22:30:00.000Z",
      end: "2026-09-06T22:30:00.000Z",
    });
  });

  it("reads the extra days when the trigger waited for a rest day", () => {
    const period = weeklyReviewPeriod(before(10), MONDAY);
    expect(new Date(period.end).getTime() - new Date(period.start).getTime()).toBe(10 * DAY_MS);
  });

  it("starts at consent for an athlete who has never had one", () => {
    const consented = new Date("2026-08-28T09:15:00Z");
    expect(weeklyReviewPeriod(consented, MONDAY).start).toBe("2026-08-28T09:15:00.000Z");
  });

  it.each(["invalid", "2026-09-07T00:00:00Z", "2026-09-06T22:30:00.001Z"])(
    "rejects an invalid or actual execution timestamp as the boundary: %s",
    (value) => {
      expect(() => weeklyReviewPeriod(before(7), new Date(value))).toThrow(/boundary|required/);
    },
  );

  it("refuses an interval that would end before it began", () => {
    expect(() => weeklyReviewPeriod(before(-1), MONDAY)).toThrow(/starts/);
  });
});

describe("when a review is owed", () => {
  it.each<[number, ReviewStanding]>([
    [0, "too_soon"],
    [6.9, "too_soon"],
    [MIN_REVIEW_INTERVAL_DAYS, "needs_a_quiet_day"],
    [9.9, "needs_a_quiet_day"],
    [MAX_REVIEW_INTERVAL_DAYS, "due"],
    [21, "due"],
  ])("is %s days past the last review: %s", (elapsed, standing) => {
    expect(reviewStanding(before(elapsed), MONDAY)).toBe(standing);
  });

  it("never asks for a rest day it would then refuse to wait for", () => {
    expect(MIN_REVIEW_INTERVAL_DAYS).toBeLessThan(MAX_REVIEW_INTERVAL_DAYS);
  });

  it.each(["invalid", ""])("rejects an unreadable anchor: %s", (value) => {
    expect(() => reviewStanding(new Date(value), MONDAY)).toThrow(/required/);
  });
});

describe("the weekday a programme leaves free", () => {
  it.each([
    // A weekday lifter's free day is Sunday, ready for Monday.
    [[1, 3, 5], [], 7],
    // The last free day before a weekend block, rather than on top of it.
    [[6, 7], [], 5],
    // A run costs a day less than a session, so a run day beats a lifting day.
    [[1, 2, 3, 4, 5, 6], [7], 7],
    [[1, 2, 3, 4, 5, 7], [6], 6],
    // Training every day still has to name a day.
    [[1, 2, 3, 4, 5, 6, 7], [], 7],
    // Nothing said yet: the end of the week.
    [[], [], 7],
  ])("reads a free day out of %j", (trainingDays, runDays, expected) => {
    expect(reviewWeekdayFor({ trainingDays, runDays })).toBe(expected);
  });

  it("never names a lifting day while any other day is free", () => {
    for (let sessions = 1; sessions <= 6; sessions++) {
      const trainingDays = [1, 2, 3, 4, 5, 6, 7].slice(0, sessions);
      const chosen = reviewWeekdayFor({ trainingDays, runDays: [] });
      expect(trainingDays).not.toContain(chosen);
    }
  });
});
