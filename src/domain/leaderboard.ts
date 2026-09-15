import { metricsForExercise, type MetricExercise, type SharedMetric } from "./shared-stats";
import type { TrainingSport } from "./sport-scope";

/**
 * The leaderboard (plan §3.12): who in your circle leads on a number. Two kinds of board —
 * Activity ranks a period's totals, Exercise ranks all-time bests of one movement — and one
 * way of ranking either: equal values share a rank, and whoever has nothing for the metric is
 * listed after the ranked rows, greyed, so a friend's absence is visible rather than
 * mysterious.
 */

/** The two boards, behind one control: a period's totals, or one movement's all-time bests. */
export const BOARD_MODES = ["activity", "exercise"] as const;
export type BoardMode = (typeof BOARD_MODES)[number];
export const BOARD_MODE_LABELS: Record<BoardMode, string> = {
  activity: "Activity",
  exercise: "Exercise",
};

/**
 * What Activity mode can rank, by sport (plan §3.12, §3.16): for lifting the six numbers
 * Compare shows for a period; for running its five. Running has no Exercise mode, so these
 * are the whole of its board.
 */
export const LIFTING_METRICS = [
  "workouts",
  "workout_time",
  "volume",
  "working_sets",
  "active_days",
  "records",
] as const;
export const RUNNING_METRICS = ["runs", "distance", "time", "best_pace", "longest_run"] as const;
export type LiftingMetric = (typeof LIFTING_METRICS)[number];
export type RunningMetric = (typeof RUNNING_METRICS)[number];
export type ActivityMetric = LiftingMetric | RunningMetric;

export const ACTIVITY_METRICS: Record<TrainingSport, readonly ActivityMetric[]> = {
  workout: LIFTING_METRICS,
  run: RUNNING_METRICS,
};
export const DEFAULT_ACTIVITY_METRIC: Record<TrainingSport, ActivityMetric> = {
  workout: "workouts",
  run: "runs",
};

export const ACTIVITY_METRIC_LABELS: Record<ActivityMetric, string> = {
  workouts: "Workouts",
  workout_time: "Workout time",
  volume: "Total volume",
  working_sets: "Working sets",
  active_days: "Active days",
  records: "Records set",
  runs: "Runs",
  distance: "Distance",
  time: "Time",
  best_pace: "Best pace",
  longest_run: "Longest run",
};

/** The one metric that improves downwards: a faster pace is a smaller number. */
export function lowerIsBetter(metric: ActivityMetric): boolean {
  return metric === "best_pace";
}

/** A period's totals for one person, as the shared session rows sum them. */
export type ActivityTotals = {
  sessions: number;
  durationSeconds: number;
  volumeKg: number;
  workingSets: number;
  activeDays: number;
  records: number;
  distanceMeters: number;
  /** The fastest average pace over a run of at least 1 km; null without one (§3.16). */
  bestPaceSecondsPerKm: number | null;
  longestRunMeters: number;
};

/**
 * The one number a metric reads off a period's totals, or null when the period has nothing
 * for it — a best pace needs a run of a kilometre — which the board lists as "—".
 */
export function activityValue(totals: ActivityTotals, metric: ActivityMetric): number | null {
  switch (metric) {
    case "workouts":
    case "runs":
      return totals.sessions;
    case "workout_time":
    case "time":
      return totals.durationSeconds;
    case "volume":
      return totals.volumeKg;
    case "working_sets":
      return totals.workingSets;
    case "active_days":
      return totals.activeDays;
    case "records":
      return totals.records;
    case "distance":
      return totals.distanceMeters;
    case "best_pace":
      return totals.bestPaceSecondsPerKm;
    case "longest_run":
      return totals.longestRunMeters;
  }
}

/**
 * The relative-strength rankings (decision 5): a load over the lifter's latest body weight.
 * Offered only when two or more people in the circle share theirs, and listing only them.
 */
export const PER_KG_METRICS = ["e1rm_per_kg", "top_weight_per_kg"] as const;
export type PerKgMetric = (typeof PER_KG_METRICS)[number];
export type BoardMetric = SharedMetric | PerKgMetric;

const PER_KG_BASE: Record<PerKgMetric, SharedMetric> = {
  e1rm_per_kg: "e1rm",
  top_weight_per_kg: "top_weight",
};

export function isPerKgMetric(metric: BoardMetric): metric is PerKgMetric {
  return metric in PER_KG_BASE;
}

/** The load a per-kg metric divides, or null for a metric that stands on its own. */
export function perKgBase(metric: BoardMetric): SharedMetric | null {
  return isPerKgMetric(metric) ? PER_KG_BASE[metric] : null;
}

/**
 * What one movement can be ranked by, primary first (§3.9), with the per-kg variants of its
 * loads after them when body weight is shared enough to divide by.
 */
export function boardMetricsForExercise(exercise: MetricExercise, perKg: boolean): BoardMetric[] {
  const metrics: BoardMetric[] = metricsForExercise(exercise);
  if (!perKg) return metrics;
  return [...metrics, ...PER_KG_METRICS.filter((metric) => metrics.includes(PER_KG_BASE[metric]))];
}

export type Rankable = { key: string; value: number | null };
export type Ranked<T extends Rankable> = T & {
  /** 1 for the leader; equal values share a rank; null for a row with nothing to rank. */
  rank: number | null;
};

/**
 * Ranks rows by value, best first. Equal values share a rank and the next rank skips what
 * they took (1, 1, 3), so a rank always says how many people are ahead of you. Rows with
 * nothing (null) trail in the order given, unranked. Ties keep the order given too, so a
 * caller that sorts by name gets a stable, readable board.
 */
export function rank<T extends Rankable>(rows: readonly T[], lowerIsBetter = false): Ranked<T>[] {
  const present = rows
    .map((row, index) => ({ row, index }))
    .filter((entry): entry is { row: T & { value: number }; index: number } => {
      return entry.row.value !== null;
    })
    .sort((a, b) => {
      const byValue = lowerIsBetter ? a.row.value - b.row.value : b.row.value - a.row.value;
      return byValue || a.index - b.index;
    });
  const ranked: Ranked<T>[] = [];
  present.forEach(({ row }, i) => {
    // The same value as the row above shares its rank; otherwise this is the position.
    const above = i > 0 ? present[i - 1]!.row : null;
    ranked.push({ ...row, rank: above?.value === row.value ? ranked[i - 1]!.rank : i + 1 });
  });
  const absent = rows.filter((row) => row.value === null).map((row) => ({ ...row, rank: null }));
  return [...ranked, ...absent];
}

/**
 * The top of a board with your own row kept in view: the first `n` rows, and yours after them
 * when it is not among them — even unranked, so the card never hides where you stand.
 */
export function topWithYou<T extends Rankable>(
  rows: readonly Ranked<T>[],
  you: string,
  n: number,
): Ranked<T>[] {
  const top = rows.slice(0, n);
  if (top.some((row) => row.key === you)) return top;
  const mine = rows.find((row) => row.key === you);
  return mine ? [...top, mine] : top;
}
