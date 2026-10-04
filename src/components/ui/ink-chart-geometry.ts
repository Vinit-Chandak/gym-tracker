/**
 * The geometry of Progress's charts (DESIGN.md, Prints: "Progress charts are not prints"):
 * distance, the heaviest set, body weight and sleep drawn in ink on the ground, the latest
 * reading in ink and the rest in `control`, the scale's labels in a margin column on the left so
 * no bar runs under them. Pure numbers here, so the rules can be tested without a browser.
 */

export type InkPoint = {
  /** An ISO date: the day, or the Monday of a week, or the first of a month. */
  date: string;
  value: number | null;
  /** Still running (this week): drawn in ink even at nothing, as a stub. */
  partial?: boolean;
};

/** Round values a scale may stop at, per power of ten. */
const NICE = [1, 2, 4, 5, 8] as const;

/** The round value nearest to `value` (8, 10, 20, 40, 50, 80…). */
export function nearestNice(value: number): number {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const candidates = [...NICE.map((n) => n * power), 10 * power];
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
  );
}

/**
 * A bar chart's scale: its top tick is the round value nearest the highest bar, and the one
 * under it its half, where that is a clean number ("5, 10"; "40, 80"). A bar over the top tick
 * keeps a little air above it.
 */
export function barScale(
  values: readonly number[],
  { integral = false }: { integral?: boolean } = {},
): { ticks: number[]; max: number } {
  const highest = Math.max(0, ...values);
  if (highest === 0) return { ticks: [], max: 1 };
  let top = nearestNice(highest);
  if (integral) top = Math.max(1, Math.round(top));
  const half = top / 2;
  const ticks = !integral || Number.isInteger(half) ? [half, top] : [top];
  return { ticks, max: highest > top ? highest * 1.08 : top };
}

/**
 * A line's domain: the readings with a little air above and below, and the round values inside
 * it (76, 77) for the scale.
 */
export function lineScale(values: readonly number[]): { ticks: number[]; lo: number; hi: number } {
  if (values.length === 0) return { ticks: [], lo: 0, hi: 1 };
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(high) * 0.02, 0.5);
  const lo = low - pad;
  const hi = high + pad;
  const raw = (hi - lo) / 2;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * power).find((n) => n >= raw) ?? 10 * power;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step)
    ticks.push(Math.round(t * 1000) / 1000);
  return { ticks, lo, hi };
}

export type BarRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  /** The latest reading, or the week still running: ink. The rest: control. */
  ink: boolean;
  index: number;
};

/**
 * Bars in their slots, each centred: up to 14 pt wide over a few weeks, closer together over
 * many readings. The latest reading is ink; a week still running is ink even at nothing, a
 * 3-pt stub, so it is seen to be counted.
 */
export function barRects(
  points: readonly InkPoint[],
  {
    left,
    width,
    top,
    bottom,
    max,
  }: { left: number; width: number; top: number; bottom: number; max: number },
): BarRect[] {
  const n = points.length;
  if (n === 0) return [];
  const slot = (width - left) / n;
  const barWidth = Math.min(14, slot * (n <= 16 ? 0.56 : 0.74));
  const latest = points.reduce(
    (found, point, index) => (point.value !== null || point.partial ? index : found),
    -1,
  );
  const plot = bottom - top;
  return points.flatMap((point, index) => {
    const value = point.value ?? 0;
    const ink = index === latest;
    const drawn = Math.max(ink && point.partial ? 3 : 0, (value / max) * plot);
    if (drawn <= 0) return [];
    return [
      {
        x: left + index * slot + (slot - barWidth) / 2,
        y: bottom - drawn,
        width: barWidth,
        height: drawn,
        radius: Math.min(3, barWidth * 0.21, drawn / 2),
        ink,
        index,
      },
    ];
  });
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * A line's points, placed by date so a lay-off reads as one, between `left` and `right`, the
 * readings between `lo` and `hi`. Missing readings break nothing: they are left out.
 */
export function linePoints(
  points: readonly InkPoint[],
  {
    left,
    right,
    top,
    bottom,
    lo,
    hi,
  }: { left: number; right: number; top: number; bottom: number; lo: number; hi: number },
): { x: number; y: number; index: number }[] {
  const known = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.value !== null);
  if (known.length === 0) return [];
  const days = known.map(({ point }) => dayNumber(point.date));
  const first = Math.min(...days);
  const span = Math.max(...days) - first;
  const y = (value: number) => bottom - ((value - lo) / (hi - lo || 1)) * (bottom - top);
  return known.map(({ point, index }, i) => ({
    x: span > 0 ? left + ((days[i]! - first) / span) * (right - left) : (left + right) / 2,
    y: y(point.value!),
    index,
  }));
}
