/**
 * The geometry of every graph (ADR 0042; DESIGN.md, Progress charts): where the scale stops,
 * where each mark stands on the date axis, which dates are named under it, and which mark a
 * finger is nearest. Pure numbers, so the rules can be tested without a browser.
 */

import { bucketEnd, slotIndex, type GraphRange } from "@/domain/graph-range";
import { addDays, daysBetween } from "@/domain/program-calendar";
import { addMonths } from "@/domain/graph-range";

/** The plot's box inside the drawing: the scale's labels stand left of `left`. */
export type Frame = { width: number; left: number; right: number; top: number; bottom: number };

/** Round steps a scale may stop at, per power of ten. */
const STEPS = [1, 2, 2.5, 4, 5] as const;

/** Candidate steps around a value, across three powers of ten. */
function candidates(value: number): number[] {
  const power = Math.floor(Math.log10(Math.max(value, 1e-9)));
  return [power - 1, power, power + 1].flatMap((p) => STEPS.map((step) => step * 10 ** p));
}

/**
 * A bar scale: from zero to a round top at or above the highest bar, in two or three equal
 * steps, so the top line is never under a bar and the lines between are round values. Of the
 * steps that fit, the one wasting least room over the highest bar wins.
 */
export function barScale(
  values: readonly number[],
  {
    integral = false,
    include = [],
    steps,
  }: { integral?: boolean; include?: readonly number[]; steps?: readonly number[] } = {},
): { ticks: number[]; max: number } {
  const highest = Math.max(0, ...values, ...include);
  if (!(highest > 0)) return { ticks: [0], max: 1 };
  let best: { step: number; n: number } | null = null;
  for (const step of steps ?? candidates(highest / 2.5)) {
    if (integral && (step < 1 || !Number.isInteger(step))) continue;
    const n = Math.ceil(highest / step - 1e-9);
    if (n < 2 || n > 3) continue;
    const waste = n * step - highest;
    if (!best || waste < best.n * best.step - highest - 1e-9) best = { step, n };
  }
  // A count of one: the scale is 0 and 1, whole numbers only.
  if (!best)
    best = { step: integral ? 1 : highest, n: integral ? Math.max(1, Math.ceil(highest)) : 1 };
  const ticks = Array.from({ length: best.n + 1 }, (_, i) => round(i * best.step));
  return { ticks, max: ticks.at(-1)! };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A line's scale: the readings with air above and below, and the round values inside as its
 * lines. A fixed scale (a 1–5 answer) is drawn whole whatever the readings.
 */
export function lineScale(
  values: readonly number[],
  {
    min,
    max,
    ticks: fixedTicks,
    steps,
  }: { min?: number; max?: number; ticks?: readonly number[]; steps?: readonly number[] } = {},
): { ticks: number[]; lo: number; hi: number } {
  if (min !== undefined && max !== undefined)
    return { ticks: [...(fixedTicks ?? [min, max])], lo: min, hi: max };
  if (values.length === 0) return { ticks: [], lo: 0, hi: 1 };
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const pad = span > 0 ? span * 0.14 : Math.max(Math.abs(high) * 0.03, 0.5);
  const lo = low - pad;
  const hi = high + pad;
  // Two or three lines inside the readings: the smallest round step that gives at most three.
  const ordered = [...(steps ?? candidates((hi - lo) / 2.5))].sort((a, b) => a - b);
  const step =
    ordered.find((s) => Math.floor(hi / s) - Math.ceil(lo / s) + 1 <= 3) ?? ordered.at(-1)!;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(round(t));
  return { ticks, lo, hi };
}

/** A slot's width and a bar's in it: up to 14 pt, closer together over many buckets. */
export function barLayout(count: number, frame: Frame): { slot: number; bar: number } {
  const slot = count > 0 ? (frame.right - frame.left) / count : 0;
  const bar = Math.max(1.5, Math.min(14, slot * (count <= 16 ? 0.56 : 0.7)));
  return { slot, bar };
}

/**
 * Where a day stands on the axis. Records stand on their own day across the whole range, so a
 * lay-off reads as one; a bucket's slot is a fixed width, and a day inside it stands its share
 * of the way across.
 */
export function dayX(
  date: string,
  range: GraphRange,
  frame: Frame,
  placement: "bucket" | "record",
  count: number,
): number {
  const width = frame.right - frame.left;
  if (placement === "record") {
    const days = daysBetween(range.from, range.to) + 1;
    return frame.left + (daysBetween(range.from, date) / days) * width;
  }
  const index = Math.max(0, slotIndex(range, date));
  const start = bucketStartAt(range, index);
  const length = daysBetween(start, bucketEnd(start, range.bucket)) + 1;
  return frame.left + ((index + daysBetween(start, date) / length) / count) * width;
}

/** The first day of a range's `index`th slot. */
function bucketStartAt(range: GraphRange, index: number): string {
  if (range.bucket === "day") return addDays(range.from, index);
  if (range.bucket === "week") return addDays(range.from, index * 7);
  return addMonths(range.from, index);
}

/** The middle of a mark: a record's day, or its bucket's slot. */
export function markX(
  index: number,
  date: string,
  range: GraphRange,
  frame: Frame,
  placement: "bucket" | "record",
  count: number,
): number {
  if (placement === "record") {
    const days = daysBetween(range.from, range.to) + 1;
    return frame.left + ((daysBetween(range.from, date) + 0.5) / days) * (frame.right - frame.left);
  }
  return frame.left + ((index + 0.5) / count) * (frame.right - frame.left);
}

/** The months as the app writes them on a date (en-GB short). */
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

export type AxisTick = { date: string; x: number; label: string };

/**
 * The dates named under a graph, at the calendar's own boundaries: each Monday over a month,
 * each month's first over a quarter or a half, the months (the year at January) over a year,
 * and each New Year beyond. As many as fit, evenly: a label never runs into the next or off
 * the right edge.
 */
export function axisTicks(
  range: GraphRange,
  frame: Frame,
  x: (date: string) => number,
  widthOf: (label: string) => number,
): AxisTick[] {
  const span = daysBetween(range.from, range.to) + 1;
  const all: AxisTick[] = [];
  const push = (date: string, label: string) => {
    if (date >= range.from && date <= range.to) all.push({ date, x: x(date), label });
  };
  if (span <= 45) {
    let monday = range.from;
    while (new Date(`${monday}T00:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
    for (let day = monday; day <= range.to; day = addDays(day, 7))
      push(day, `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`);
  } else if (span <= 1100) {
    for (
      let first = `${range.from.slice(0, 7)}-01`;
      first <= range.to;
      first = addMonths(first, 1)
    ) {
      const month = Number(first.slice(5, 7));
      push(first, month === 1 && span > 230 ? first.slice(0, 4) : MONTHS[month - 1]!);
    }
  } else {
    for (let year = Number(range.from.slice(0, 4)); `${year}-01-01` <= range.to; year++)
      push(`${year}-01-01`, String(year));
  }
  // A label that would run off the right edge is left out on its own; then every tick, every
  // second, every third…: the first stride whose labels all stand clear of each other.
  const inside = all.filter((tick) => tick.x + widthOf(tick.label) <= frame.width + 0.5);
  for (let stride = 1; stride <= Math.max(1, inside.length); stride++) {
    const kept = inside.filter((_, i) => i % stride === 0);
    const fits = kept.every(
      (tick, i) => i === 0 || tick.x - kept[i - 1]!.x >= widthOf(kept[i - 1]!.label) + 10,
    );
    if (fits) return kept;
  }
  return [];
}

/** The mark nearest a point along the axis, among those that have one. */
export function nearestIndex(xs: readonly (number | null)[], at: number): number | null {
  let best: number | null = null;
  xs.forEach((x, i) => {
    if (x === null) return;
    if (best === null || Math.abs(x - at) < Math.abs(xs[best]! - at)) best = i;
  });
  return best;
}

/** A bar: its top corners rounded, its foot square on the baseline. */
export function barPath(x: number, y: number, width: number, height: number, radius = 3): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const f = (n: number) => n.toFixed(2);
  return [
    `M${f(x)} ${f(y + height)}`,
    `V${f(y + r)}`,
    `Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}`,
    `H${f(x + width - r)}`,
    `Q${f(x + width)} ${f(y)} ${f(x + width)} ${f(y + r)}`,
    `V${f(y + height)}`,
    "Z",
  ].join("");
}

/**
 * A line through its points, broken wherever a bucket has no reading: a gap is unknown, and a
 * line across it would claim the values in between.
 */
export function linePath(points: readonly ({ x: number; y: number } | null)[]): string {
  let path = "";
  let pen = false;
  for (const point of points) {
    if (!point) {
      pen = false;
      continue;
    }
    path += `${pen ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    pen = true;
  }
  return path;
}
