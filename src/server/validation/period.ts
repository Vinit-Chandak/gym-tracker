import { DEFAULT_PERIOD, PERIODS, periodBounds, type Period } from "@/domain/period";
import { todayInTimeZone } from "@/domain/program-calendar";

import { dateWindow, parseDateRange, type DateRange } from "./date-range";

/** The `period` search parameter, or the default: an unknown value is not an error. */
export function parsePeriod(value: string | string[] | undefined): Period {
  return PERIODS.find((period) => period === value) ?? DEFAULT_PERIOD;
}

/** UTC+14, where every new date begins first: no session anywhere is dated later than here. */
const FIRST_INTO_EACH_DAY = "Pacific/Kiritimati";

/** A range ending on the viewer's today, run on to the latest date anywhere now. */
function upToNow(range: DateRange, timeZone: string, now: Date): DateRange {
  if (range.to < todayInTimeZone(timeZone, now)) return range;
  const latest = todayInTimeZone(FIRST_INTO_EACH_DAY, now);
  return latest > range.to ? { ...range, to: latest } : range;
}

/**
 * The period as a social screen reads it: from the viewer's calendar, up to the present
 * moment. Each session keeps its own local date, and a friend in a time zone ahead of the
 * viewer's can already have trained on the viewer's tomorrow; the range runs to the latest
 * date anywhere on Earth now, so that session counts today rather than after the viewer's
 * midnight. These screens read the civil dates; the instants stay the viewer's own.
 */
export function periodRange(period: Period, timeZone: string, now = new Date()): DateRange {
  const range = parseDateRange(periodBounds(period, todayInTimeZone(timeZone, now)), timeZone, now);
  return upToNow(range, timeZone, now);
}

/**
 * The shared graph range (ADR 0044) as a social screen reads it: the viewer's days, and when
 * the span ends today, on to the present moment, as `periodRange`.
 */
export function socialWindow(
  from: string,
  to: string,
  timeZone: string,
  now = new Date(),
): DateRange {
  return upToNow(dateWindow(from, to, timeZone), timeZone, now);
}
