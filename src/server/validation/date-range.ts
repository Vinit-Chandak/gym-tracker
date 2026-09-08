import { z } from "zod";

import { addDays, daysBetween, todayInTimeZone } from "@/domain/program-calendar";
import { fromDateTimeLocal } from "@/lib/time";

export const civilDate = z.iso.date();
export type DateRange = { from: string; to: string; start: Date; end: Date };

/** Inclusive civil dates, converted to an exclusive upper instant in the account's time zone. */
export function parseDateRange(
  input: { from?: string; to?: string },
  timeZone: string,
  now = new Date(),
): DateRange {
  const to = civilDate.parse(input.to || todayInTimeZone(timeZone, now));
  const from = civilDate.parse(input.from || addDays(to, -83));
  const days = daysBetween(from, to);
  if (days < 0 || days > 365)
    throw new Error("Choose a date range of up to one year, with From before To.");
  const start = fromDateTimeLocal(`${from}T00:00`, timeZone);
  const end = fromDateTimeLocal(`${addDays(to, 1)}T00:00`, timeZone);
  if (!start || !end) throw new Error("Invalid date range.");
  return { from, to, start, end };
}

/**
 * Always yields a usable range: an unusable one falls back to the default window and
 * reports why, so the page keeps its filters and content instead of blanking out.
 */
export function parseDateRangeOrDefault(
  input: { from?: string; to?: string },
  timeZone: string,
  now = new Date(),
): { range: DateRange; error: string | null } {
  try {
    return { range: parseDateRange(input, timeZone, now), error: null };
  } catch (error) {
    return {
      range: parseDateRange({}, timeZone, now),
      error:
        error instanceof Error
          ? error.message
          : "Choose a date range of up to one year, with From before To.",
    };
  }
}
