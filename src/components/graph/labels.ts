import type { Route } from "next";

import type { Bucket, Slot } from "@/domain/graph-range";
import { originQuery, type NavOrigin } from "@/lib/nav";

/**
 * How every graph names its marks and where they lead (ADR 0042): the same words for a day,
 * a week and a month on every graph, and the same record behind each.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parts = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { y, m, d, weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]! };
};

/** "Tue 6 Oct" this year, "6 Oct 2024" in another: a day, as a record's readout names it. */
export function dayLabel(date: string, today: string): string {
  const { y, m, d, weekday } = parts(date);
  return y === Number(today.slice(0, 4))
    ? `${weekday} ${d} ${MONTHS[m - 1]}`
    : `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "14–20 Sept", "28 Sept – 4 Oct": a week's days, with its year when it is not this one. */
function weekLabel(start: string, end: string, today: string): string {
  const a = parts(start);
  const b = parts(end);
  const year = b.y === Number(today.slice(0, 4)) ? "" : ` ${b.y}`;
  return a.m === b.m
    ? `${a.d}–${b.d} ${MONTHS[b.m - 1]}${year}`
    : `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}${year}`;
}

/** A bucket as its readout and its row name it; the one still running says so. */
export function bucketLabel(slot: Slot, bucket: Bucket, today: string): string {
  if (bucket === "day") return slot.start === today ? "Today" : dayLabel(slot.start, today);
  if (bucket === "week")
    return slot.partial && slot.end >= today ? "This week" : weekLabel(slot.start, slot.end, today);
  if (slot.partial && slot.end >= today) return "This month";
  const { y, m } = parts(slot.start);
  return `${MONTHS[m - 1]} ${y}`;
}

/** What a bucket's total is per: said under the summary of a bucketed graph. */
export const BUCKET_WORD: Record<Bucket, string> = { day: "day", week: "week", month: "month" };

/** A finished workout, opened from a graph: Progress stays selected and Back returns here. */
export function workoutHref(sessionId: string, origin: NavOrigin | null): Route {
  return `/workouts/${sessionId}${originQuery(origin)}` as Route;
}

/** A logged run, ride or swim. */
export function activityHref(id: string, origin: NavOrigin | null): Route {
  return `/training/activities/${id}${originQuery(origin)}` as Route;
}

/** A day with more than one record: its page lists each. */
export function dayHref(date: string): Route {
  return `/progress/day/${date}` as Route;
}

/** A week or a month of one kind of record, as History lists them. */
export function historyHref(from: string, to: string, kind: "workout" | "run" | "recovery"): Route {
  return `/progress/history?from=${from}&to=${to}&kind=${kind}` as Route;
}

/** A day's food log on the Food tab. */
export function foodDayHref(date: string, today: string): Route {
  return (date === today ? "/food" : `/food?day=${date}`) as Route;
}

/** "1,234.5": a number to so many places, thousands separated, no trailing zeros. */
export function decimal(value: number, places = 1): string {
  const factor = 10 ** places;
  return (Math.round(value * factor) / factor + 0).toLocaleString("en-GB", {
    maximumFractionDigits: places,
  });
}

/** "1 run", "12 runs". */
export function counted(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}
