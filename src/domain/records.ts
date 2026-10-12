import { setLengthIn, type SetLengthUnit } from "@/lib/distance-units";

import { metricValue, type ExerciseStats, type SharedMetric } from "./shared-stats";

/** One record: a comparable exercise's metric beating every earlier finished session. */
export type TrainingRecord = {
  exerciseId: string;
  metric: SharedMetric;
  value: number;
  previous: number;
};

/** Half the tenth an estimated 1RM used to be kept to: closer than this is the same lift. */
const ESTIMATE_TIE = 0.05;

/** The best an account had done per exercise and metric before this session. */
export type PreviousMaxima = ReadonlyMap<string, Partial<Record<SharedMetric, number>>>;

/**
 * Which of a session's numbers are records (plan §3.13): a strict improvement, on a comparable
 * exercise, of a metric that movement is measured by, over a value that already existed. A
 * first-ever performance is not announced — a new account's first workout would otherwise
 * proclaim twenty records — so a metric with no earlier value never qualifies.
 *
 * An estimated 1RM is kept to the hundredth now and was kept to the tenth before, so the same
 * lift can read 16.33 against an older row's 16.3: an estimate has to beat the best by more
 * than that rounding (`ESTIMATE_TIE`) to be a record.
 *
 * A carry has to be longer in the figures its athlete reads, `length` (ADR 0056). In yards a
 * best kept as 50 m reads 55 yd, and 55 yd logged is kept as 50.3 m: longer in metres, but the
 * same carry as far as the athlete can tell, never "55 yd · was 55 yd". In metres, kept to the
 * tenth they are read in, any longer carry is one.
 */
export function detectRecords(
  previous: PreviousMaxima,
  exercises: readonly ExerciseStats[],
  length: SetLengthUnit,
): TrainingRecord[] {
  const records: TrainingRecord[] = [];
  for (const stats of exercises) {
    if (!stats.comparable) continue;
    const earlier = previous.get(stats.exerciseId);
    if (!earlier) continue;
    for (const metric of stats.metrics) {
      const value = metricValue(stats, metric);
      const before = earlier[metric];
      if (value === null || before === undefined) continue;
      const beats =
        metric === "longest_carry"
          ? setLengthIn(value, length) > setLengthIn(before, length)
          : value > before + (metric === "e1rm" ? ESTIMATE_TIE : 0);
      if (!beats) continue;
      records.push({ exerciseId: stats.exerciseId, metric, value, previous: before });
    }
  }
  return records;
}
