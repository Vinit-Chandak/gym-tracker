import { describe, expect, it } from "vitest";

import { formatDateTime, formatDay, formatRelativeDay, formatTimeOrDateTime } from "./format";

/**
 * A day and month alone read as this year's: 13 October 2025, a Monday, written "Mon 13 Oct" a
 * year on, is the day after tomorrow and a Tuesday. Given the year it is now, a date in another
 * year names it; this year's stays as short as it was.
 */
describe("a date from another year names its year", () => {
  it("on a date and time, read in the account's zone", () => {
    expect(formatDateTime("2025-10-13T13:00:00Z", "Asia/Kolkata", "2026")).toBe(
      "Mon\u00a013\u00a0Oct\u00a02025, 18:30",
    );
    expect(formatDateTime("2026-09-12T10:47:00Z", "Europe/London", "2026")).toBe(
      "Sat\u00a012\u00a0Sept, 11:47",
    );
    // New Year's Eve in London is already New Year's Day in Tokyo.
    expect(formatDateTime("2025-12-31T20:00:00Z", "Asia/Tokyo", "2026")).toBe(
      "Thu\u00a01\u00a0Jan, 05:00",
    );
    // Without the year it is now, as before: no year.
    expect(formatDateTime("2025-10-13T13:00:00Z", "Asia/Kolkata")).toBe(
      "Mon\u00a013\u00a0Oct, 18:30",
    );
  });

  it("on a day and month", () => {
    expect(formatDay("2025-11-17T09:00:00Z", "Europe/London", "2026")).toBe(
      "17\u00a0Nov\u00a02025",
    );
    expect(formatDay("2026-01-05T09:00:00Z", "Europe/London", "2026")).toBe("5\u00a0Jan");
    expect(formatDay("2026-09-08T09:00:00Z", "Europe/London")).toBe("8\u00a0Sept");
  });

  it("on a time that was not today", () => {
    expect(formatTimeOrDateTime("2026-10-11T08:00:00Z", "Europe/London", "2026-10-11")).toBe(
      "09:00",
    );
    expect(formatTimeOrDateTime("2026-10-10T18:30:00Z", "Europe/London", "2026-10-11")).toBe(
      "Sat\u00a010\u00a0Oct, 19:30",
    );
    expect(formatTimeOrDateTime("2025-12-31T18:30:00Z", "Europe/London", "2026-01-01")).toBe(
      "Wed\u00a031\u00a0Dec\u00a02025, 18:30",
    );
  });

  it("on an activity row's day", () => {
    expect(formatRelativeDay("2026-10-11", "2026-10-11")).toBe("Today");
    expect(formatRelativeDay("2026-10-10", "2026-10-11")).toBe("Yesterday");
    expect(formatRelativeDay("2026-10-05", "2026-10-11")).toBe("Mon\u00a05\u00a0Oct");
    expect(formatRelativeDay("2025-12-30", "2026-01-01")).toBe("Tue\u00a030\u00a0Dec\u00a02025");
  });
});
