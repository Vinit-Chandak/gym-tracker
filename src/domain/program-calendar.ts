/**
 * Calendar maths for a programme anchored on its start date (not on Mondays).
 * All dates are ISO `YYYY-MM-DD` strings interpreted in the user's time zone.
 */
const DAY_MS = 86_400_000;

/** Weekly volume and charts bucket Monday–Sunday (ISO weekday 1 starts the week). */
export const TRAINING_WEEK_START = 1;

function toUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y + m + d)) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return fromUtcMs(toUtcMs(isoDate) + days * DAY_MS);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Last day of a programme that starts on `startDate` and runs for `weeks` weeks. */
export function programEndDate(startDate: string, weeks: number): string {
  return addDays(startDate, weeks * 7 - 1);
}

/** 1-based programme week containing `date`, or null outside the programme. */
export function programWeekIndex(startDate: string, weeks: number, date: string): number | null {
  const offset = daysBetween(startDate, date);
  if (offset < 0 || offset >= weeks * 7) return null;
  return Math.floor(offset / 7) + 1;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(isoDate: string): number {
  const day = new Date(toUtcMs(isoDate)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Today's civil date in the given IANA time zone, e.g. "Asia/Kolkata". */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
