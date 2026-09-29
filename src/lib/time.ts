/** Wall-clock conversions for `<input type="datetime-local">` values in an IANA time zone. */

import { dateTimeFormatter } from "./date-time-format";

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function localTimestamp(local: string): number | null {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== local) return null;
  return wall;
}

/** Every matching instant, in chronological order; a clock rollback can produce two. */
export function dateTimeLocalCandidates(local: string, timeZone: string): Date[] {
  const wall = localTimestamp(local);
  if (wall === null) return [];
  const offsets = new Set<number>();
  // Read both sides of any nearby change, including half-hour and date-line transitions.
  try {
    for (const days of [-2, -1, 0, 1, 2]) {
      offsets.add(timeZoneOffsetMinutes(timeZone, new Date(wall + days * 86_400_000)));
    }
  } catch {
    // A restored browser draft can contain an old or invalid zone. Let validation explain
    // it when saving instead of making the rest of the form unusable.
    return [];
  }
  return [...offsets]
    .map((offset) => new Date(wall - offset * 60_000))
    .filter((instant) => toDateTimeLocal(instant, timeZone) === local)
    .sort((a, b) => a.getTime() - b.getTime());
}

export function formatUtcOffset(minutes: number): string {
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? "−" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

/** Offset of `timeZone` from UTC in minutes at the given instant (positive east of UTC). */
export function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = dateTimeFormatter("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((wall - at.getTime()) / 60_000);
}

/** "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone` → instant; null when malformed. */
export function fromDateTimeLocal(
  local: string,
  timeZone: string,
  options: { rejectNonexistent?: boolean } = {},
): Date | null {
  // Date.UTC normalizes impossible dates and overflowing time fields. A form must never
  // turn February 30 or 24:15 into a different day without the athlete choosing it.
  const wall = localTimestamp(local);
  if (wall === null) return null;
  // Two passes so an offset change around the instant (DST) still lands on the right side.
  const first = wall - timeZoneOffsetMinutes(timeZone, new Date(wall)) * 60_000;
  const offset = timeZoneOffsetMinutes(timeZone, new Date(first));
  const instant = new Date(wall - offset * 60_000);
  // Calendar boundaries may advance across a midnight clock change. Actual performances
  // instead reject a local time that never occurred during a daylight-saving jump.
  if (options.rejectNonexistent && toDateTimeLocal(instant, timeZone) !== local) return null;
  return instant;
}

/** Instant → "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone`, for datetime-local inputs. */
export function toDateTimeLocal(date: Date, timeZone: string): string {
  const parts = dateTimeFormatter("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
