/** Wall-clock conversions for `<input type="datetime-local">` values in an IANA time zone. */

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** Offset of `timeZone` from UTC in minutes at the given instant (positive east of UTC). */
export function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
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
export function fromDateTimeLocal(local: string, timeZone: string): Date | null {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (!Number.isFinite(wall)) return null;
  // Two passes so an offset change around the instant (DST) still lands on the right side.
  const first = wall - timeZoneOffsetMinutes(timeZone, new Date(wall)) * 60_000;
  const offset = timeZoneOffsetMinutes(timeZone, new Date(first));
  return new Date(wall - offset * 60_000);
}

/** Instant → "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone`, for datetime-local inputs. */
export function toDateTimeLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
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
