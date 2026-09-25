import type { ActivityMetric } from "@/domain/leaderboard";
import { METRIC_UNIT, type SharedMetric } from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";

import { formatDuration, formatPace } from "@/domain/pace";
import { dateTimeFormatter } from "./date-time-format";
import { fromKilograms } from "./units";

/**
 * The pieces of a formatted date, so a caller can join them itself.
 *
 * Where a weekday leads the date, en-GB puts a comma after it in some versions of ICU and not
 * in others — and the copy Node was built with and the one in the browser do not always agree.
 * The same instant then renders as "Sat 12 Sept, 11:47" on the server and "Sat, 12 Sept, 11:47"
 * in the page, which React reports as a hydration mismatch and repaints the tree to fix. Joining
 * the parts here means the separators are ours, and both sides write the same words.
 */
function dateParts(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): Record<Intl.DateTimeFormatPartTypes, string> {
  const parts = {} as Record<Intl.DateTimeFormatPartTypes, string>;
  for (const part of dateTimeFormatter("en-GB", options).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return parts;
}

/** "Tue 8 Sept, 18:30" in the given IANA time zone. */
export function formatDateTime(value: string | Date, timeZone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const at = dateParts(date, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${at.weekday} ${at.day} ${at.month}, ${at.hour}:${at.minute}`;
}

/** "09:15" in the given time zone. */
export function formatTime(value: string | Date, timeZone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return dateTimeFormatter("en-GB", {
    timeZone,
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
function isoParts(
  isoDate: string,
  options: Intl.DateTimeFormatOptions,
): Record<Intl.DateTimeFormatPartTypes, string> | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return dateParts(new Date(`${isoDate}T00:00:00Z`), { timeZone: "UTC", ...options });
}

const ISO_DAY = { day: "numeric", month: "short", year: "numeric" } as const;

/** "Tue 8 Sept 2026" for an ISO date string. */
export function formatIsoDate(isoDate: string): string {
  const on = isoParts(isoDate, { weekday: "short", ...ISO_DAY });
  return on ? `${on.weekday} ${on.day} ${on.month} ${on.year}` : isoDate;
}

/** "8 Sept 2026" for an ISO date string: the same date without its weekday. */
export function formatIsoDay(isoDate: string): string {
  const on = isoParts(isoDate, ISO_DAY);
  return on ? `${on.day} ${on.month} ${on.year}` : isoDate;
}

/** "Fri 11 Sept" — today's date beside the wordmark, where the year is never in question. */
export function formatIsoWeekdayDay(isoDate: string): string {
  const on = isoParts(isoDate, { weekday: "short", day: "numeric", month: "short" });
  return on ? `${on.weekday} ${on.day} ${on.month}` : isoDate;
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

/**
 * A single run's distance, as it was logged: "3.45", "3.4", "5".
 *
 * Metres are stored exactly, so rounding one run to a tenth of a kilometre throws away the
 * difference between 3.45 and 3.5 for no reason. Weekly and block totals keep their single
 * decimal, where the second digit is noise.
 */
export function formatRunKm(distanceMeters: number): string {
  return String(Math.round(distanceMeters / 10) / 100);
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

/** "6,240 kg" / "13,757 lb": a shared load in the reader's unit, thousands separated. */
export function formatSharedLoad(kilograms: number, unit: BodyLoadUnit): string {
  return `${fromKilograms(kilograms, unit).toLocaleString("en-GB")} ${unit}`;
}

/**
 * A shared metric's value as a reader in `unit` should see it (ADR 0026): loads in their
 * unit, reps as a count, holds as a clock, carries in metres.
 */
export function formatSharedMetric(
  metric: SharedMetric,
  value: number,
  unit: BodyLoadUnit,
): string {
  switch (METRIC_UNIT[metric]) {
    case "kg":
      return formatSharedLoad(value, unit);
    case "reps":
      return `${value} ${value === 1 ? "rep" : "reps"}`;
    case "seconds":
      return formatDuration(value);
    case "metres":
      return `${value.toLocaleString("en-GB")} m`;
  }
}

/**
 * How a top weight was worked, in set notation: "4 × 12" for four sets whose best reached
 * twelve reps, "4 sets" for a hold or carry that has no reps to count.
 */
export function formatTopWeightWork(work: { sets: number; reps: number | null }): string {
  if (work.reps === null) return `${work.sets} ${work.sets === 1 ? "set" : "sets"}`;
  return `${work.sets} × ${work.reps}`;
}

/** "42.3 km": a period's distance, to a tenth, as the weekly totals on Runs read. */
export function formatTotalKm(distanceMeters: number): string {
  return `${Math.round(distanceMeters / 100) / 10} km`;
}

/**
 * A period's total on the leaderboard or a compare row: a count, a time as the other period
 * totals read it, a load in the reader's unit, a distance in kilometres, or a pace.
 */
export function formatActivityMetric(
  metric: ActivityMetric,
  value: number,
  unit: BodyLoadUnit,
): string {
  switch (metric) {
    case "workout_time":
    case "time":
      return formatMinutes(value / 60);
    case "volume":
      return formatSharedLoad(value, unit);
    case "workouts":
    case "working_sets":
    case "active_days":
    case "records":
    case "runs":
    case "sessions":
      return value.toLocaleString("en-GB");
    case "distance":
      return formatTotalKm(value);
    case "best_pace":
      return `${formatPace(value)} /km`;
    // One run, so the distance as it was logged, not rounded to a tenth.
    case "longest_run":
      return `${formatRunKm(value)} km`;
  }
}

/** "Today", "Yesterday", else the weekday and date: how an activity row says when. */
export function formatRelativeDay(isoDate: string, today: string): string {
  if (isoDate === today) return "Today";
  const [y, m, d] = today.split("-").map(Number);
  if (y && m && d) {
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    if (isoDate === yesterday) return "Yesterday";
  }
  return formatIsoWeekdayDay(isoDate);
}

/**
 * "135": macro summaries in whole grams (ADR 0032), with thousands separated.
 */
export function formatFoodAmount(value: number): string {
  // `+ 0` turns the -0 a small negative rounds to into 0.
  return (Math.round(value) + 0).toLocaleString("en-GB");
}

/** Energy retains its stored precision so the displayed total agrees with the goal badge. */
export function formatKcal(value: number): string {
  return (Math.round(value * 10) / 10 + 0).toLocaleString("en-GB", { maximumFractionDigits: 1 });
}
