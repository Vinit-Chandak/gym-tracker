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
