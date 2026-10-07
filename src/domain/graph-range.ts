import { addDays, daysBetween } from "./program-calendar";
import { weekStart } from "./running";

/**
 * The spans every graph offers (ADR 0042): the same five, in the same order, on every graph in
 * the app, so a reader picks a span once and every graph answers in it. A month is the default:
 * long enough to show a trend, short enough that each day is still its own mark.
 */
export const RANGE_PRESETS = ["1m", "3m", "6m", "12m", "all"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const DEFAULT_RANGE_PRESET: RangePreset = "1m";

/** What each span is called on its button, and what the button says aloud. */
export const RANGE_PRESET_LABELS: Record<RangePreset, { short: string; long: string }> = {
  "1m": { short: "1m", long: "1 month" },
  "3m": { short: "3m", long: "3 months" },
  "6m": { short: "6m", long: "6 months" },
  "12m": { short: "12m", long: "12 months" },
  all: { short: "All", long: "All time" },
};

/**
 * What one mark on a graph stands for. A month is drawn day by day, a quarter or a half week by
 * week, a year and more month by month: each span gets between about a dozen and about sixty
 * marks, which is what a phone's width can draw and a thumb can still tell apart.
 */
export type Bucket = "day" | "week" | "month";

/** The span a graph is drawn over, from the first day of its first mark to its last day. */
export type GraphRange = {
  /** The span chosen, or null for dates chosen by hand. */
  preset: RangePreset | null;
  /** The first day drawn: always the first day of a bucket, so no mark is cut at the start. */
  from: string;
  /** The last day drawn: today, or the end of the dates chosen by hand. */
  to: string;
  bucket: Bucket;
};

/** The earliest day the app accepts as a record's date, and so where "All" starts looking. */
export const EARLIEST_DAY = "2000-01-01";

export function parseRangePreset(value: unknown): RangePreset | null {
  return typeof value === "string" && (RANGE_PRESETS as readonly string[]).includes(value)
    ? (value as RangePreset)
    : null;
}

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The same day `months` months away, held at the month's last day where it has no such day. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The first day of the bucket `isoDate` falls in: itself, its week's Monday, or the 1st. */
export function bucketStart(isoDate: string, bucket: Bucket): string {
  if (bucket === "day") return isoDate;
  if (bucket === "week") return weekStart(isoDate);
  return `${isoDate.slice(0, 7)}-01`;
}

/** The first day of the bucket after the one starting on `start`. */
export function nextBucket(start: string, bucket: Bucket): string {
  if (bucket === "day") return addDays(start, 1);
  if (bucket === "week") return addDays(start, 7);
  return addMonths(start, 1);
}

/** The last day of the bucket starting on `start`. */
export function bucketEnd(start: string, bucket: Bucket): string {
  return addDays(nextBucket(start, bucket), -1);
}

/**
 * The bucket a span is drawn in when it was not one of the presets: by day up to about six
 * weeks, by week up to about seven months, by month beyond.
 */
export function bucketForSpan(from: string, to: string): Bucket {
  const days = daysBetween(from, to) + 1;
  if (days <= 45) return "day";
  if (days <= 230) return "week";
  return "month";
}

/**
 * A preset's span, ending today. The start reaches back to its bucket's first day, so a week or
 * a month is never drawn cut short at the left edge; only the bucket still running (this week,
 * this month) is partial, and every graph says so.
 */
export function presetRange(preset: Exclude<RangePreset, "all">, today: string): GraphRange {
  switch (preset) {
    case "1m":
      return { preset, from: addDays(addMonths(today, -1), 1), to: today, bucket: "day" };
    case "3m":
      return {
        preset,
        from: weekStart(addDays(addMonths(today, -3), 1)),
        to: today,
        bucket: "week",
      };
    case "6m":
      return {
        preset,
        from: weekStart(addDays(addMonths(today, -6), 1)),
        to: today,
        bucket: "week",
      };
    case "12m":
      return {
        preset,
        from: bucketStart(addMonths(today, -11), "month"),
        to: today,
        bucket: "month",
      };
  }
}

/**
 * "All": from the first record a graph has to today, in whichever bucket that span needs. A
 * graph with nothing in it at all is drawn over a month, the default, so it still has an axis.
 */
export function allRange(earliest: string | null, today: string): GraphRange {
  if (!earliest || earliest > today) return { ...presetRange("1m", today), preset: "all" };
  const bucket = bucketForSpan(earliest, today);
  return { preset: "all", from: bucketStart(earliest, bucket), to: today, bucket };
}

/** Dates chosen by hand, widened at the start to a whole first bucket, as a preset is. */
export function customRange(from: string, to: string): GraphRange {
  const bucket = bucketForSpan(from, to);
  return { preset: null, from: bucketStart(from, bucket), to, bucket };
}

/** One mark's place on a graph: its first and last day, and whether it is still running. */
export type Slot = { start: string; end: string; partial: boolean };

/**
 * Every bucket of a range, oldest first. A bucket that ends after today, or after the range
 * does, is partial: its totals are real, but they are not a whole bucket's.
 */
export function rangeSlots(range: GraphRange, today: string): Slot[] {
  const last = range.to < today ? range.to : today;
  const slots: Slot[] = [];
  for (let start = range.from; start <= range.to; start = nextBucket(start, range.bucket)) {
    const end = bucketEnd(start, range.bucket);
    slots.push({ start, end, partial: end > last });
  }
  return slots;
}

/** Which slot of `range` a day falls in, or -1 outside it. */
export function slotIndex(range: GraphRange, isoDate: string): number {
  if (isoDate < range.from || isoDate > range.to) return -1;
  if (range.bucket === "day") return daysBetween(range.from, isoDate);
  if (range.bucket === "week") return Math.floor(daysBetween(range.from, isoDate) / 7);
  const [fy, fm] = range.from.split("-").map(Number) as [number, number];
  const [y, m] = isoDate.split("-").map(Number) as [number, number];
  return y * 12 + m - (fy * 12 + fm);
}

/** What the reader asked for: a span, remembered, or dates chosen by hand. */
export type RangeChoice =
  | { preset: RangePreset; custom?: never }
  | { preset?: never; custom: { from: string; to: string } };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: string) =>
  ISO_DAY.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/**
 * Dates in the URL win over the remembered span, as long as they make a range: both real days,
 * From no later than To, and nothing before the app's first day. Either may be left out: To is
 * then today, From a month before To. Dates that make no range fall back to the remembered span
 * and say why, so the screen keeps its graphs rather than blanking out.
 */
export function chooseRange(
  remembered: RangePreset,
  dates: { from?: string; to?: string },
  today: string,
): { choice: RangeChoice; error: string | null } {
  if (!dates.from && !dates.to) return { choice: { preset: remembered }, error: null };
  const to = dates.to || today;
  const from = dates.from || addDays(addMonths(to, -1), 1);
  if (!isDay(from) || !isDay(to) || from > to || from < EARLIEST_DAY)
    return {
      choice: { preset: remembered },
      error: "Those dates do not make a range: choose a From on or before To.",
    };
  return { choice: { custom: { from, to } }, error: null };
}

/**
 * The range a choice draws. "All" depends on where a graph's own records start, so it takes
 * the earliest of them; every other choice is the same for every graph.
 */
export function rangeOf(
  choice: RangeChoice,
  today: string,
  earliest: string | null = null,
): GraphRange {
  if (choice.custom) return customRange(choice.custom.from, choice.custom.to);
  if (choice.preset === "all") return allRange(earliest, today);
  return presetRange(choice.preset, today);
}

/** The days a choice has to read: for "All", every day there could be a record on. */
export function readWindowOf(choice: RangeChoice, today: string): { from: string; to: string } {
  if (choice.preset === "all") return { from: EARLIEST_DAY, to: today };
  const range = rangeOf(choice, today);
  return { from: range.from, to: range.to };
}
