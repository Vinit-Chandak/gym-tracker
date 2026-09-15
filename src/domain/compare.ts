/**
 * Head to head (plan §3.10–3.11): who leads on a number and by how much. Side `a` is always
 * the viewer, `b` the friend, and the percentage is said from the viewer's side, relative to
 * the friend's value — "+20%" is "you did a fifth more than they did".
 */

export type Side = "a" | "b";
export type TrendPoint = { date: string; value: number };
export type Point = { date: string; value: number | null };

export type Comparison = {
  /** Who is ahead; null when equal, or when neither side has anything. */
  leader: Side | null;
  /** (a − b) ÷ b × 100 to one decimal; null when it cannot be said (b is nothing). */
  percent: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Nothing (null) and zero are the same absence: a side that logged nothing reads "0" on the
 * bar and the percentage is "—", because there is no value to be a fraction of. A side with
 * a value leads a side without one whichever way the metric points, since for pace and the
 * like a zero is not a fast time but a missing one.
 */
export function compareValues(
  a: number | null,
  b: number | null,
  lowerIsBetter = false,
): Comparison {
  const va = a ?? 0;
  const vb = b ?? 0;
  if (va === vb) return { leader: null, percent: va === 0 ? null : 0 };
  if (vb === 0) return { leader: "a", percent: null };
  if (va === 0) return { leader: "b", percent: null };
  const percent = round1(((va - vb) / vb) * 100);
  const aLeads = lowerIsBetter ? va < vb : va > vb;
  return { leader: aLeads ? "a" : "b", percent };
}

/** The Stronger badge (§3.11): whoever leads on the primary metric over all time; a tie, nobody. */
export function strongerVerdict(
  a: number | null,
  b: number | null,
  lowerIsBetter = false,
): Side | null {
  return compareValues(a, b, lowerIsBetter).leader;
}

/** "1.18" for 88 kg at 74.5 kg body weight; null without a body weight to divide by. */
export function bodyWeightRatio(loadKg: number, bodyWeightKg: number | null): number | null {
  if (bodyWeightKg === null || !(bodyWeightKg > 0)) return null;
  return Math.round((loadKg / bodyWeightKg) * 100) / 100;
}

/**
 * Two people's readings on one date axis: the union of their dates, oldest first, each
 * series holding null where that person has no session. `Chart` bridges those gaps.
 */
export function alignSeries(
  a: readonly TrendPoint[],
  b: readonly TrendPoint[],
): { dates: string[]; a: Point[]; b: Point[] } {
  const dates = [...new Set([...a, ...b].map((p) => p.date))].sort();
  const fill = (points: readonly TrendPoint[]): Point[] => {
    const byDate = new Map(points.map((p) => [p.date, p.value]));
    return dates.map((date) => ({ date, value: byDate.get(date) ?? null }));
  };
  return { dates, a: fill(a), b: fill(b) };
}
