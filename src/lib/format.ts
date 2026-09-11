import { dateTimeFormatter } from "./date-time-format";

/** "Tue 8 Sep, 18:30" in the given IANA time zone. */
export function formatDateTime(value: string | Date, timeZone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return dateTimeFormatter("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "8 Sep" in the given time zone. */
export function formatDay(value: string | Date, timeZone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return dateTimeFormatter("en-GB", { timeZone, day: "numeric", month: "short" }).format(date);
}

/** A calendar date, read as itself: no time zone shifts it off the day it names. */
function formatIso(isoDate: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return dateTimeFormatter("en-GB", { timeZone: "UTC", ...options }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

const ISO_DAY = { day: "numeric", month: "short", year: "numeric" } as const;

/** "Tue 8 Sep 2026" for an ISO date string. */
export function formatIsoDate(isoDate: string): string {
  return formatIso(isoDate, { weekday: "short", ...ISO_DAY });
}

/** "8 Sep 2026" for an ISO date string: the same date without its weekday. */
export function formatIsoDay(isoDate: string): string {
  return formatIso(isoDate, ISO_DAY);
}

/**
 * "Fri 11 Sept" — today's date beside the wordmark, where the year is never in question.
 * en-GB puts a comma after the weekday; a masthead line reads better without it.
 */
export function formatIsoWeekdayDay(isoDate: string): string {
  return formatIso(isoDate, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

/** Compact date range, retaining both years when it crosses a year boundary. */
export function formatDateRange(from: string, to: string): string {
  const format = (date: string, year: boolean) =>
    dateTimeFormatter("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      ...(year ? { year: "numeric" as const } : {}),
    }).format(new Date(`${date}T00:00:00Z`));
  return from === to
    ? format(to, true)
    : `${format(from, from.slice(0, 4) !== to.slice(0, 4))} – ${format(to, true)}`;
}

/** "1 h 12 min" / "48 min". */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Kilograms per pound, for turning the library's kg defaults into the reader's unit. */
const LB_PER_KG = 2.2046226218;

/**
 * A load stored in kilograms, written in the unit the reader prefers: "2.5 kg" or "5.5 lb".
 * Only for the shared library's own defaults — logged sets keep the unit they were logged in.
 */
export function formatKilograms(kilograms: number, unit: "kg" | "lb"): string {
  if (unit === "kg") return `${kilograms} kg`;
  return `${Math.round(kilograms * LB_PER_KG * 10) / 10} lb`;
}
