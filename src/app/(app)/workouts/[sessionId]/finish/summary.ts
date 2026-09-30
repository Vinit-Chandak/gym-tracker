import { detectRecords, type PreviousMaxima } from "@/domain/records";
import {
  metricLabel,
  sessionStats,
  type SharedMetric,
  type StatsWorkout,
} from "@/domain/shared-stats";

export type FinishRecord = {
  exerciseId: string;
  exerciseName: string;
  /** The metric's name for this movement: "Top weight", "Most reps". */
  label: string;
  metric: SharedMetric;
  value: number;
};

export type FinishSummary = {
  workingSets: number;
  /** Loaded working sets only, in kilograms, as Progress and a follower read it. */
  volumeKg: number;
  /** Capped as the shared stats cap it: a session left open all day was not trained all day. */
  durationSeconds: number;
  records: FinishRecord[];
};

/** The open session as the finish screen reads it: the stats' own shape, with names. */
export type FinishWorkout = Omit<StatsWorkout, "exercises"> & {
  exercises: readonly (StatsWorkout["exercises"][number] & { exercise: { name: string } })[];
};

/**
 * What finishing now would record, worked out by the same rules and from the same bests
 * finishing uses (`sessionStats`, then `detectRecords` against `previousMaxima` before the
 * session started): the working sets, the volume, how long it has run and the records it would
 * set. Only a preview for the finish screen; nothing is written, and finishing decides again.
 */
export function finishSummary(
  workout: FinishWorkout,
  now: Date,
  previous: PreviousMaxima,
): FinishSummary {
  // The zone only dates the shared row, which a preview never writes.
  const stats = sessionStats({ ...workout, completedAt: now }, "UTC");
  const movements = new Map(workout.exercises.map((slot) => [slot.exerciseId, slot.exercise]));
  return {
    workingSets: stats.session.workingSets,
    volumeKg: stats.session.volumeKg,
    durationSeconds: stats.session.durationSeconds,
    records: detectRecords(previous, stats.exercises).flatMap((record) => {
      const exercise = movements.get(record.exerciseId);
      return exercise
        ? [
            {
              exerciseId: record.exerciseId,
              exerciseName: exercise.name,
              label: metricLabel(record.metric, exercise),
              metric: record.metric,
              value: record.value,
            },
          ]
        : [];
    }),
  };
}
