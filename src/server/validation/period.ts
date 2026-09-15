import { DEFAULT_PERIOD, PERIODS, periodBounds, type Period } from "@/domain/period";
import { todayInTimeZone } from "@/domain/program-calendar";

import { parseDateRange, type DateRange } from "./date-range";

/** The `period` search parameter, or the default: an unknown value is not an error. */
export function parsePeriod(value: string | string[] | undefined): Period {
  return PERIODS.find((period) => period === value) ?? DEFAULT_PERIOD;
}

/** The period as a date range ending today in the account's time zone. */
export function periodRange(period: Period, timeZone: string, now = new Date()): DateRange {
  return parseDateRange(periodBounds(period, todayInTimeZone(timeZone, now)), timeZone, now);
}
