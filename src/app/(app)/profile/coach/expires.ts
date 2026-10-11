import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate, formatTime } from "@/lib/format";

/**
 * "Sat 9 Jan 2027, 19:00": when a coach token stops working, on the account's own clock. A
 * token lasts whole days from the minute it was made, so the time is part of the answer, and
 * the date is the athlete's, not the UTC date, which can be a day either side of it.
 */
export function expiresLabel(expiresAt: Date, timeZone: string): string {
  return `${formatIsoDate(todayInTimeZone(timeZone, expiresAt))}, ${formatTime(expiresAt, timeZone)}`;
}
