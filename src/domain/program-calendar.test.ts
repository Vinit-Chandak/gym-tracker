import { describe, expect, it } from "vitest";
import { formatIsoDate } from "@/lib/format";

import {
  addDays,
  daysBetween,
  isoWeekday,
  programEndDate,
  programWeekIndex,
  todayInTimeZone,
} from "./program-calendar";

const START = "2026-09-08"; // Tuesday

describe("programme calendar anchored on the start date", () => {
  it("preserves accepted years below 100 in calculations and labels", () => {
    expect(programEndDate("0001-01-01", 8)).toBe("0001-02-25");
    expect(addDays("0099-12-31", 1)).toBe("0100-01-01");
    // The weekday's separator is the app's own, not ICU's, so the server and the browser agree.
    expect(formatIsoDate("0001-01-01")).toBe("Mon 1 Jan 1");
  });
  it("runs 8 weeks from 8 Sep 2026 to 2 Nov 2026", () => {
    expect(programEndDate(START, 8)).toBe("2026-11-02");
    expect(daysBetween(START, "2026-11-02")).toBe(55);
    expect(addDays(START, 7)).toBe("2026-09-15");
  });

  it("counts weeks from the start date, not from Monday", () => {
    expect(programWeekIndex(START, 8, "2026-09-08")).toBe(1);
    expect(programWeekIndex(START, 8, "2026-09-14")).toBe(1);
    expect(programWeekIndex(START, 8, "2026-09-15")).toBe(2);
    expect(programWeekIndex(START, 8, "2026-11-02")).toBe(8);
    expect(programWeekIndex(START, 8, "2026-11-03")).toBeNull();
    expect(programWeekIndex(START, 8, "2026-09-07")).toBeNull();
  });

  it("knows the ISO weekday", () => {
    expect(isoWeekday("2026-09-08")).toBe(2);
    expect(isoWeekday("2026-09-13")).toBe(7);
    expect(isoWeekday("2026-09-14")).toBe(1);
  });

  it("resolves today in India even when UTC is still the previous day", () => {
    const lateEveningUtc = new Date("2026-09-08T20:00:00Z"); // 01:30 IST on 9 Sep
    expect(todayInTimeZone("Asia/Kolkata", lateEveningUtc)).toBe("2026-09-09");
    expect(todayInTimeZone("UTC", lateEveningUtc)).toBe("2026-09-08");
  });
});
