import { goalStatus } from "./nutrition";
import { addDays, daysBetween, isoWeekday } from "./program-calendar";

/**
 * Which day the Food tab shows, and the days around it (ADR 0037).
 *
 * Every day before today can be opened, filled in and corrected, as today can: food eaten late at
 * night belongs to the day it was eaten, and remembering it is not always done before midnight.
 * A day that has not come yet cannot be opened, as it cannot be logged.
 */

/** A day with food on it, and what it came to: all a calendar needs to mark it. */
export type FoodDayTotal = { date: string; kcal: number };

/**
 * How a day with food on it is marked: whether its energy met the goal band, went past it, or
 * neither. A day still under its band is only marked as logged, as the summary says nothing of a
 * day that has not reached its goal. Without a target there is no band, and every day is logged.
 */
export type FoodDayMark = "logged" | "met" | "over";

export function foodDayMark(kcal: number, targetKcal: number | null): FoodDayMark {
  if (targetKcal === null) return "logged";
  const status = goalStatus(kcal, targetKcal);
  return status === "under" ? "logged" : status;
}

/** Before this, a date in a link is a slip rather than a day anyone logged food on. */
const EARLIEST_DAY = "2000-01-01";

/**
 * The day a Food link names, or today. Only a real calendar date between 2000 and today opens;
 * a typo, a day that does not exist (30 February) or one still to come opens today instead of
 * failing, since whatever the link was for, today is where the Food tab starts.
 */
export function foodDayFrom(value: string | string[] | undefined, today: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  // A date that does not exist rolls over into the next month and comes back different.
  if (addDays(value, 0) !== value) return today;
  return value > today || value < EARLIEST_DAY ? today : value;
}

/** The strip holds at least this many weeks: about two months to swipe back through. */
export const STRIP_WEEKS = 8;
/** And at most a year's; a day chosen from further back is shown, but not in the strip. */
const MOST_STRIP_WEEKS = 53;

/**
 * The days in the strip under the Food header, as weeks of seven, newest first.
 *
 * Each week ends on the same weekday as today, so the newest ends on today itself: yesterday is
 * always beside it, one tap away however the calendar's weeks fall, and no week in the strip
 * holds a day that has not come yet. It reaches back far enough to hold the day on screen.
 */
export function stripWeeks(today: string, date: string): string[][] {
  const reach = Math.floor(daysBetween(date, today) / 7) + 1;
  const count = Math.min(MOST_STRIP_WEEKS, Math.max(STRIP_WEEKS, reach));
  return Array.from({ length: count }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(today, -7 * week - 6 + day)),
  );
}

/** The first and last day the strip holds, which is what its marks are read over. */
export function stripRange(today: string, date: string): { from: string; to: string } {
  const weeks = stripWeeks(today, date);
  return { from: weeks[weeks.length - 1]![0]!, to: today };
}

/** A month as `YYYY-MM`. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month `months` after `month` (or before, when negative). */
export function addMonths(month: string, months: number): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  const total = year * 12 + (index - 1) + months;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** The first and last day of a month. */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(`${addMonths(month, 1)}-01`, -1) };
}

/**
 * A month as a calendar lays it out: rows of seven from Monday, as the app's weeks run, with
 * null in the places before its first day and after its last.
 */
export function monthGrid(month: string): (string | null)[][] {
  const { from, to } = monthRange(month);
  const days = daysBetween(from, to) + 1;
  const cells: (string | null)[] = [
    ...Array.from<null>({ length: isoWeekday(from) - 1 }).fill(null),
    ...Array.from({ length: days }, (_, day) => addDays(from, day)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}
