import { addDays, todayInTimeZone } from "./program-calendar";

/**
 * How long a finished workout stays open to changes (ADR 0049): the day it was trained and the
 * seven after it, in the athlete's own time zone. Long enough to put in a load forgotten on the
 * gym floor or an exercise nobody logged; short enough that history, records and what friends
 * were shown settle.
 */
export const EDIT_WINDOW_DAYS = 7;

/** The last day ("2026-10-16") a workout trained on `day` can still be changed. */
export function lastEditDay(day: string): string {
  return addDays(day, EDIT_WINDOW_DAYS);
}

/**
 * Whether a finished workout can still be changed: its day is the day it started, however late
 * it finished, as the rest of its record is dated (ADR 0049).
 */
export function canEditWorkout(startedAt: Date, timeZone: string, now: Date = new Date()): boolean {
  return todayInTimeZone(timeZone, now) <= lastEditDay(todayInTimeZone(timeZone, startedAt));
}
