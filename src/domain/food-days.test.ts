import { describe, expect, it } from "vitest";

import {
  addMonths,
  foodDayFrom,
  foodDayMark,
  monthGrid,
  monthRange,
  stripRange,
  stripWeeks,
  STRIP_WEEKS,
} from "./food-days";

const SUNDAY = "2026-09-27";

describe("the day a Food link opens", () => {
  it("opens any real day up to today", () => {
    expect(foodDayFrom("2026-09-26", SUNDAY)).toBe("2026-09-26");
    expect(foodDayFrom("2024-02-29", SUNDAY)).toBe("2024-02-29");
    expect(foodDayFrom(SUNDAY, SUNDAY)).toBe(SUNDAY);
  });

  it("opens today for anything else, rather than failing", () => {
    for (const value of [
      undefined,
      "",
      "yesterday",
      "2026-9-26",
      "2026-02-30", // does not exist
      "2026-13-01",
      "2026-09-28", // has not come yet
      "1999-12-31", // a slip, not a day anyone logged
      ["2026-09-26"],
    ]) {
      expect(foodDayFrom(value, SUNDAY)).toBe(SUNDAY);
    }
  });
});

describe("a day's mark", () => {
  it("says whether the day met the goal band, went past it, or neither", () => {
    // The band on 2,700 kcal runs from 2,430 to 2,970.
    expect(foodDayMark(1113, 2700)).toBe("logged");
    expect(foodDayMark(2430, 2700)).toBe("met");
    expect(foodDayMark(2970, 2700)).toBe("met");
    expect(foodDayMark(2970.1, 2700)).toBe("over");
  });

  it("only says a day was logged when there is no target to hold it to", () => {
    expect(foodDayMark(5000, null)).toBe("logged");
  });
});

describe("the strip's weeks", () => {
  it("ends on today, so yesterday is always in the newest week", () => {
    const weeks = stripWeeks(SUNDAY, SUNDAY);
    expect(weeks).toHaveLength(STRIP_WEEKS);
    expect(weeks[0]).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    // Just after midnight on a Monday, Sunday is still beside today, not a week away.
    expect(stripWeeks("2026-09-28", "2026-09-28")[0]!.slice(-2)).toEqual([
      "2026-09-27",
      "2026-09-28",
    ]);
  });

  it("runs back in whole weeks with nothing missing between them", () => {
    const days = stripWeeks(SUNDAY, SUNDAY).flat().sort();
    expect(days).toHaveLength(STRIP_WEEKS * 7);
    expect(new Set(days).size).toBe(days.length);
    expect(stripRange(SUNDAY, SUNDAY)).toEqual({ from: "2026-08-03", to: SUNDAY });
  });

  it("reaches back as far as the day on screen, up to a year", () => {
    const weeks = stripWeeks(SUNDAY, "2026-05-01");
    expect(weeks.flat()).toContain("2026-05-01");
    expect(weeks).toHaveLength(22);
    expect(stripWeeks(SUNDAY, "2024-01-01")).toHaveLength(53);
  });
});

describe("a month", () => {
  it("steps across years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-09", -21)).toBe("2024-12");
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("is laid out from Monday, with blanks around it", () => {
    // September 2026 begins on a Tuesday and ends on a Wednesday.
    const grid = monthGrid("2026-09");
    expect(grid).toHaveLength(5);
    expect(grid[0]).toEqual([null, ...[1, 2, 3, 4, 5, 6].map((d) => `2026-09-0${d}`)]);
    expect(grid[4]).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", null, null, null, null]);
    // June 2026 begins on a Monday; February 2026 on a Sunday.
    expect(monthGrid("2026-06")[0]![0]).toBe("2026-06-01");
    expect(monthGrid("2026-02")[0]).toEqual([null, null, null, null, null, null, "2026-02-01"]);
  });
});
