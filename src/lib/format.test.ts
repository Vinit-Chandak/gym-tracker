import { describe, expect, it } from "vitest";

import {
  formatActivityMetric,
  formatAmount,
  formatDateTime,
  formatIsoDate,
  formatIsoDay,
  formatIsoWeekdayDay,
  formatMacros,
  formatPortion,
  formatRunKm,
  formatTime,
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
    expect(at).toBe("Sat 12 Sept, 11:47");
    expect(at.split(",")).toHaveLength(2);
  });

  it("writes weekday calendar dates the same way", () => {
    expect(formatIsoDate("2026-09-08")).toBe("Tue 8 Sept 2026");
    expect(formatIsoWeekdayDay("2026-09-11")).toBe("Fri 11 Sept");
    expect(formatIsoDay("2026-09-08")).toBe("8 Sept 2026");
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

it("writes a period's total by what it counts, in the reader's unit", () => {
  expect(formatActivityMetric("workouts", 12, "kg")).toBe("12");
  expect(formatActivityMetric("workout_time", 4320, "kg")).toBe("1 h 12 min");
  expect(formatActivityMetric("volume", 6240, "lb")).toBe("13,756.8 lb");
  expect(formatActivityMetric("records", 1234, "kg")).toBe("1,234");
  expect(formatActivityMetric("runs", 3, "kg")).toBe("3");
  expect(formatActivityMetric("distance", 21450, "kg")).toBe("21.5 km");
  expect(formatActivityMetric("time", 1870, "kg")).toBe("31 min");
  expect(formatActivityMetric("best_pace", 325, "kg")).toBe("5:25 /km");
  // One run keeps its logged distance; a total rounds to a tenth.
  expect(formatActivityMetric("longest_run", 5245, "kg")).toBe("5.25 km");
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

it("writes the macronutrients that are known, in whole grams", () => {
  expect(formatMacros({ carbsG: 66.3, fatG: 6.9, proteinG: 16.9 })).toBe(
    "Carbs 66 g · Fat 7 g · Protein 17 g",
  );
  expect(formatMacros({ carbsG: null, fatG: 0, proteinG: 25 })).toBe("Fat 0 g · Protein 25 g");
  expect(formatMacros({ carbsG: null, fatG: null, proteinG: null })).toBe("");
});
