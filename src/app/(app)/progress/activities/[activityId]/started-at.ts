import { todayInTimeZone } from "@/domain/program-calendar";
import { formatDateTime } from "@/lib/format";

/**
 * When an activity started: its day and time where it was recorded, as History dates it, the year
 * only outside this one. A record from another zone says which, rather than being quietly moved
 * into the zone the profile is in now. Its page and its correction both say it.
 */
export function startedAtLine(startedAt: Date, recordedTimeZone: string, timeZone: string): string {
  const elsewhere = recordedTimeZone !== timeZone;
  return `${formatDateTime(startedAt, recordedTimeZone, todayInTimeZone(timeZone).slice(0, 4))}${
    elsewhere ? ` (${recordedTimeZone.replaceAll("_", " ")})` : ""
  }`;
}
