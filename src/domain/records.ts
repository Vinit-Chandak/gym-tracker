import { metricValue, type ExerciseStats, type SharedMetric } from "./shared-stats";

/** One record: a comparable exercise's metric beating every earlier finished session. */
export type TrainingRecord = {
  exerciseId: string;
  metric: SharedMetric;
  value: number;
  previous: number;
};

/** The best an account had done per exercise and metric before this session. */
export type PreviousMaxima = ReadonlyMap<string, Partial<Record<SharedMetric, number>>>;

/**
 * Which of a session's numbers are records (plan §3.13): a strict improvement, on a comparable
 * exercise, of a metric that movement is measured by, over a value that already existed. A
 * first-ever performance is not announced — a new account's first workout would otherwise
 * proclaim twenty records — so a metric with no earlier value never qualifies.
 */
export function detectRecords(
  previous: PreviousMaxima,
  exercises: readonly ExerciseStats[],
): TrainingRecord[] {
  const records: TrainingRecord[] = [];
  for (const stats of exercises) {
    if (!stats.comparable) continue;
    const earlier = previous.get(stats.exerciseId);
    if (!earlier) continue;
    for (const metric of stats.metrics) {
      const value = metricValue(stats, metric);
      const before = earlier[metric];
      if (value === null || before === undefined || !(value > before)) continue;
      records.push({ exerciseId: stats.exerciseId, metric, value, previous: before });
    }
  }
  return records;
}
