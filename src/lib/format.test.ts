import { describe, expect, it } from "vitest";

import {
  formatActivityMetric,
  formatAmount,
  formatDateRange,
  formatDateTime,
  formatDay,
  formatIsoDate,
  formatIsoDay,
  formatIsoLongDay,
  formatIsoMonth,
  formatIsoShortDay,
  formatIsoShortMonth,
  formatIsoWeekdayDay,
  formatLoadStep,
  formatMacros,
  formatMinutes,
  formatPortion,
  formatRunKm,
  formatSharedDistance,
  formatTime,
  formatWholeKcal,
} from "./format";

/**
 * These dates are rendered on the server and hydrated in the browser, and the two run different
 * builds of ICU. Where the weekday leads, some versions put a comma after it and some do not, so
 * anything that takes the formatter's own string renders differently in the two places and React
 * throws out the server's HTML on arrival. The separators have to be ours.
 */
describe("dates that have to read the same on the server and in the page", () => {
  it("writes a weekday date and time without a comma of the formatter's choosing", () => {
    const at = formatDateTime("2026-09-12T10:47:00Z", "Europe/London");
    expect(at).toBe("Sat 12\u00a0Sept, 11:47");
    expect(at.split(",")).toHaveLength(2);
  });

  it("writes weekday calendar dates the same way", () => {
    expect(formatIsoDate("2026-09-08")).toBe("Tue 8\u00a0Sept\u00a02026");
    expect(formatIsoWeekdayDay("2026-09-11")).toBe("Fri 11\u00a0Sept");
    expect(formatIsoDay("2026-09-08")).toBe("8\u00a0Sept\u00a02026");
  });

  it("leaves this year's year off a weekday date, and keeps another year's", () => {
    expect(formatIsoDate("2026-10-11", "2026")).toBe("Sun 11\u00a0Oct");
    expect(formatIsoDate("2025-10-11", "2026")).toBe("Sat 11\u00a0Oct\u00a02025");
  });

  it("holds a day to its month and year, so a line never ends on the day alone", () => {
    expect(formatDay("2025-11-17T09:00:00Z", "Europe/London", "2026")).toBe(
      "17\u00a0Nov\u00a02025",
    );
    expect(formatIsoShortDay("2026-09-28")).toBe("28\u00a0Sept");
    expect(formatIsoLongDay("2026-09-26")).toBe("Saturday 26\u00a0September");
    expect(formatIsoMonth("2025-09", "2026")).toBe("September\u00a02025");
    expect(formatIsoShortMonth("2022-02")).toBe("Feb\u00a02022");
    // A range breaks only around its dash.
    expect(formatDateRange("2025-10-13", "2026-10-11")).toBe(
      "13\u00a0Oct\u00a02025 – 11\u00a0Oct\u00a02026",
    );
  });

  it("keeps a plain time and an unreadable date as they were", () => {
    expect(formatTime("2026-09-12T10:47:00Z", "Europe/London")).toBe("11:47");
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
  });
});

it("writes a run's distance as it was logged", () => {
  // Metres are stored exactly, so 3.45 km is not 3.5 km, and a round number keeps no decimals.
  expect(formatRunKm(3450)).toBe("3.45");
  expect(formatRunKm(3400)).toBe("3.4");
  expect(formatRunKm(5000)).toBe("5");
  expect(formatRunKm(0)).toBe("0");
  expect(formatRunKm(12345)).toBe("12.35");
});

it("writes the library's load jump as the step a reader in their unit can load", () => {
  expect(formatLoadStep(2.5, "kg")).toBe("2.5\u00a0kg");
  // 2.5 kg is 5.51 lb, which no plate makes: the jump in pounds is the nearest one that is.
  expect(formatLoadStep(2.5, "lb")).toBe("5\u00a0lb");
  expect(formatLoadStep(1.25, "lb")).toBe("2.5\u00a0lb");
  expect(formatLoadStep(5, "lb")).toBe("10\u00a0lb");
});

it("writes a period's total by what it counts, in the reader's unit", () => {
  expect(formatActivityMetric("workouts", 12, "kg")).toBe("12");
  expect(formatActivityMetric("workout_time", 4320, "kg")).toBe("1\u00a0h 12\u00a0min");
  // A volume is whole, as Progress totals it: never a tenth of a pound in five figures.
  expect(formatActivityMetric("volume", 6240, "lb")).toBe("13,757\u00a0lb");
  expect(formatActivityMetric("volume", 87137.06, "kg")).toBe("87,137\u00a0kg");
  expect(formatActivityMetric("records", 1234, "kg")).toBe("1,234");
  expect(formatActivityMetric("runs", 3, "kg")).toBe("3");
  expect(formatActivityMetric("distance", 21450, "kg")).toBe("21.5\u00a0km");
  expect(formatActivityMetric("time", 1870, "kg")).toBe("31\u00a0min");
  expect(formatActivityMetric("best_pace", 325, "kg")).toBe("5:25\u00a0/km");
  // One run keeps its logged distance; a total rounds to a tenth.
  expect(formatActivityMetric("longest_run", 5245, "kg")).toBe("5.25\u00a0km");
  // Distances and paces in the reader's own unit for the sport.
  expect(formatActivityMetric("distance", 21450, "kg", "mi")).toBe("13.3\u00a0mi");
  expect(formatActivityMetric("best_pace", 325, "kg", "mi")).toBe("8:43\u00a0/mi");
  expect(formatActivityMetric("longest_run", 8046.72, "kg", "mi")).toBe("5\u00a0mi");
  expect(formatActivityMetric("distance", 12400, "kg", "m")).toBe("12,400\u00a0m");
  expect(formatActivityMetric("distance", 1500, "kg", "yd")).toBe("1,640\u00a0yd");
});

it("writes a shared distance in the reader's unit, to the precision it is read at", () => {
  expect(formatSharedDistance(5200, "km")).toBe("5.2\u00a0km");
  expect(formatSharedDistance(3450, "km")).toBe("3.45\u00a0km");
  expect(formatSharedDistance(1234567, "km", 1)).toBe("1,234.6\u00a0km");
  expect(formatSharedDistance(5200, "mi")).toBe("3.23\u00a0mi");
  expect(formatSharedDistance(1500, "m")).toBe("1,500\u00a0m");
  expect(formatSharedDistance(457.2, "yd")).toBe("500\u00a0yd");
});

it("rounds a time to the minute before splitting off the hours", () => {
  // 1:59:40 and 59:45 are a whole two hours and a whole hour, never "1 h 60 min" or "60 min".
  expect(formatMinutes(7180 / 60)).toBe("2\u00a0h");
  expect(formatMinutes(3585 / 60)).toBe("1\u00a0h");
  expect(formatMinutes(59.5)).toBe("1\u00a0h");
  expect(formatMinutes(119.6)).toBe("2\u00a0h");
  expect(formatMinutes((13 * 3600 + 59 * 60 + 40) / 60)).toBe("14\u00a0h");
  expect(formatMinutes(0.4)).toBe("0\u00a0min");
  expect(formatMinutes(72.4)).toBe("1\u00a0h 12\u00a0min");
  expect(formatMinutes(48)).toBe("48\u00a0min");
});

it("writes an amount of a food in its own unit, plural where the unit is a word", () => {
  expect(formatPortion(100, "g")).toBe("100 g");
  expect(formatPortion(1, "scoop")).toBe("1 scoop");
  expect(formatPortion(1.5, "scoop")).toBe("1.5 scoops");
  expect(formatPortion(0.5, "cup")).toBe("0.5 cups");
  expect(formatPortion(2, "tbsp")).toBe("2 tbsp");
  expect(formatPortion(1, "l")).toBe("1 L");
  expect(formatPortion(1250, "ml")).toBe("1,250 ml");
  expect(formatAmount(33.333)).toBe("33.33");
  expect(formatAmount(-0.001)).toBe("0");
});

it("writes a food's or a saved meal's energy to the nearest whole kcal, four digits and no comma", () => {
  expect(formatWholeKcal(1000.3)).toBe("1000");
  expect(formatWholeKcal(1000.8)).toBe("1001");
  expect(formatWholeKcal(282.5)).toBe("283");
  expect(formatWholeKcal(9999.4)).toBe("9999");
  // Past four digits it is still written whole; the column widens rather than cut it.
  expect(formatWholeKcal(9999.5)).toBe("10000");
  expect(formatWholeKcal(0.4)).toBe("0");
  expect(formatWholeKcal(-0.4)).toBe("0");
  // A half that floating point lands a hair under is still a half.
  expect(0.3 + 1.9 + 0.3).toBeLessThan(2.5);
  expect(formatWholeKcal(0.3 + 1.9 + 0.3)).toBe("3");
});

it("writes the macronutrients that are known, in whole grams", () => {
  expect(formatMacros({ carbsG: 66.3, fatG: 6.9, proteinG: 16.9 })).toBe(
    "Carbs 66\u00a0g ·\u00a0Fat 7\u00a0g ·\u00a0Protein 17\u00a0g",
  );
  expect(formatMacros({ carbsG: null, fatG: 0, proteinG: 25 })).toBe(
    "Fat 0\u00a0g ·\u00a0Protein 25\u00a0g",
  );
  expect(formatMacros({ carbsG: null, fatG: null, proteinG: null })).toBe("");
});
