import { convertLoad } from "@/lib/units";

import { estimated1RM } from "./analytics";
import { addExerciseVolume, emptyMuscleVolume } from "./muscle-volume";
import type { MuscleSets } from "./muscle-split";
import { paceSecondsPerKm } from "./pace";
import { todayInTimeZone } from "./program-calendar";
import type { TrainingSport } from "./sport-scope";
import type {
  ExerciseModality,
  LoadPortability,
  LoadUnit,
  MuscleGroup,
  PrescriptionType,
  SetType,
} from "./types";

/**
 * What leaves an account (ADR 0026): the numbers a follower may see, computed once when a
 * session finishes by the same rules Progress draws from — warm-ups excluded, `estimated1RM`,
 * `addExerciseVolume` — so a friend never reads a number you would not see yourself.
 * Everything is in kilograms, seconds and metres; the reader's unit is applied on display.
 */

/** The per-exercise measurements a shared row carries (plan §3.9). */
export const SHARED_METRICS = [
  "e1rm",
  "top_weight",
  "best_set_volume",
  "most_reps",
  "longest_hold",
  "longest_carry",
] as const;
export type SharedMetric = (typeof SHARED_METRICS)[number];

/** What a metric is counted in; "kg" ones are shown in the reader's preferred unit. */
export const METRIC_UNIT: Record<SharedMetric, "kg" | "reps" | "seconds" | "metres"> = {
  e1rm: "kg",
  top_weight: "kg",
  best_set_volume: "kg",
  most_reps: "reps",
  longest_hold: "seconds",
  longest_carry: "metres",
};

export type MetricExercise = {
  modality: ExerciseModality;
  defaultPrescriptionType: PrescriptionType;
};

/**
 * Which metrics apply to a movement, primary first (plan §3.9): the primary decides
 * "Stronger" and is what the movement is ranked by.
 */
export function metricsForExercise(exercise: MetricExercise): SharedMetric[] {
  switch (exercise.defaultPrescriptionType) {
    case "duration":
      return ["longest_hold", "top_weight"];
    case "distance":
      return ["longest_carry", "top_weight"];
    case "reps":
      return exercise.modality === "barbell" || exercise.modality === "dumbbell"
        ? ["e1rm", "top_weight", "best_set_volume", "most_reps"]
        : ["most_reps", "top_weight", "best_set_volume"];
  }
}

export function primaryMetric(exercise: MetricExercise): SharedMetric {
  return metricsForExercise(exercise)[0]!;
}

/** The metric's label for this movement: a pull-up's top weight is the load it added. */
export function metricLabel(metric: SharedMetric, exercise: MetricExercise): string {
  switch (metric) {
    case "e1rm":
      return "Est. 1RM";
    case "top_weight":
      return exercise.defaultPrescriptionType === "duration"
        ? "Heaviest hold"
        : exercise.defaultPrescriptionType === "distance"
          ? "Heaviest carry"
          : exercise.modality === "barbell" || exercise.modality === "dumbbell"
            ? "Top weight"
            : "Added load";
    case "best_set_volume":
      return "Best set";
    case "most_reps":
      return "Most reps";
    case "longest_hold":
      return "Longest hold";
    case "longest_carry":
      return "Longest carry";
  }
}

export type ComparableExercise = { userId: string | null; loadPortability: LoadPortability };

/**
 * Comparable across people (plan §3.9): in the shared library, and a load that means the same
 * everywhere. Machines still count toward sets, volume and the split; they are never ranked.
 */
export function isComparable(exercise: ComparableExercise): boolean {
  return exercise.userId === null && exercise.loadPortability === "global";
}

export type StatsSet = {
  setType: SetType;
  weight: number | null;
  unit: LoadUnit;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type StatsSlot = {
  exerciseId: string;
  exercise: ComparableExercise &
    MetricExercise & {
      primaryMuscles: readonly MuscleGroup[];
      secondaryMuscles: readonly MuscleGroup[] | null;
    };
  sets: readonly StatsSet[];
};

export type StatsWorkout = {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
  day: { name: string } | null;
  exercises: readonly StatsSlot[];
};

/** A workout that ran longer than this was left open, not trained; its duration is capped. */
export const MAX_SESSION_SECONDS = 4 * 60 * 60;

export type SessionStats = {
  sport: TrainingSport;
  sourceId: string;
  title: string;
  occurredOn: string;
  startedAt: Date;
  durationSeconds: number;
  workingSets: number;
  volumeKg: number;
  distanceMeters: number | null;
  paceSecondsPerKm: number | null;
  muscleSets: MuscleSets;
};

export type ExerciseStats = {
  exerciseId: string;
  comparable: boolean;
  metrics: SharedMetric[];
  workingSets: number;
  totalReps: number | null;
  topWeightKg: number | null;
  /** Working sets at the top weight, and the most reps one of them reached; null without one. */
  topWeightSets: number | null;
  topWeightReps: number | null;
  bestE1rmKg: number | null;
  bestSetVolumeKg: number | null;
  mostReps: number | null;
  longestDurationSeconds: number | null;
  longestDistanceMeters: number | null;
};

/** The column each metric is read from, so one switch serves records, tiles and boards. */
export function metricValue(stats: ExerciseStatsValues, metric: SharedMetric): number | null {
  switch (metric) {
    case "e1rm":
      return stats.bestE1rmKg;
    case "top_weight":
      return stats.topWeightKg;
    case "best_set_volume":
      return stats.bestSetVolumeKg;
    case "most_reps":
      return stats.mostReps;
    case "longest_hold":
      return stats.longestDurationSeconds;
    case "longest_carry":
      return stats.longestDistanceMeters;
  }
}
export type ExerciseStatsValues = Pick<
  ExerciseStats,
  | "bestE1rmKg"
  | "topWeightKg"
  | "bestSetVolumeKg"
  | "mostReps"
  | "longestDurationSeconds"
  | "longestDistanceMeters"
>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const max = (values: number[]) => (values.length ? Math.max(...values) : null);
const hasWeight = (set: StatsSet): set is StatsSet & { weight: number } =>
  set.weight !== null && (set.unit === "kg" || set.unit === "lb");

/** A kg or lb load in kilograms; stack steps and plate counts carry no weight. */
function weightKg(set: StatsSet): number | null {
  return hasWeight(set) ? convertLoad(set.weight, set.unit, "kg") : null;
}

/**
 * One finished workout's shared numbers: the session row and one exercise row per library
 * exercise, a movement done in two slots of one session counting once. Sets that are not
 * warm-ups are working sets, as on Progress; only kg and lb sets weigh anything.
 */
export function sessionStats(
  workout: StatsWorkout,
  timeZone: string,
): { session: SessionStats; exercises: ExerciseStats[] } {
  if (!workout.completedAt) throw new Error("Only a finished workout has shared stats.");
  const muscles = emptyMuscleVolume();
  const byExercise = new Map<string, ExerciseStats>();
  let workingSets = 0;
  let volumeKg = 0;
  for (const slot of workout.exercises) {
    const working = slot.sets.filter((set) => set.setType !== "warmup");
    workingSets += working.length;
    addExerciseVolume(muscles, {
      primaryMuscles: slot.exercise.primaryMuscles,
      secondaryMuscles: slot.exercise.secondaryMuscles ?? [],
      workingSets: working.length,
    });
    const loaded = working.flatMap((set) => {
      const kg = weightKg(set);
      return kg === null ? [] : [{ kg, reps: set.reps }];
    });
    for (const set of loaded) if (set.reps !== null) volumeKg += set.kg * set.reps;
    // A movement someone added themselves has no counterpart in anyone else's account.
    if (slot.exercise.userId !== null) continue;
    const reps = working.flatMap((set) => (set.reps === null ? [] : [set.reps]));
    const current = byExercise.get(slot.exerciseId) ?? {
      exerciseId: slot.exerciseId,
      comparable: isComparable(slot.exercise),
      metrics: metricsForExercise(slot.exercise),
      workingSets: 0,
      totalReps: null,
      topWeightKg: null,
      topWeightSets: null,
      topWeightReps: null,
      bestE1rmKg: null,
      bestSetVolumeKg: null,
      mostReps: null,
      longestDurationSeconds: null,
      longestDistanceMeters: null,
    };
    const better = (a: number | null, b: number | null) =>
      a === null ? b : b === null ? a : Math.max(a, b);
    current.workingSets += working.length;
    current.totalReps =
      reps.length === 0
        ? current.totalReps
        : (current.totalReps ?? 0) + reps.reduce((n, r) => n + r, 0);
    const top = max(loaded.map((set) => set.kg));
    if (top !== null && (current.topWeightKg === null || top >= current.topWeightKg)) {
      // The sets at the top load and the most reps one of them got. A movement done in two
      // slots of one session adds its sets up when both reached the same load; a heavier
      // slot replaces what a lighter one counted.
      const atTop = loaded.filter((set) => set.kg === top);
      const carried = top === current.topWeightKg;
      current.topWeightSets = atTop.length + (carried ? (current.topWeightSets ?? 0) : 0);
      current.topWeightReps = better(
        carried ? current.topWeightReps : null,
        max(atTop.flatMap((set) => (set.reps === null ? [] : [set.reps]))),
      );
    }
    current.topWeightKg = better(current.topWeightKg, top);
    current.bestE1rmKg = better(
      current.bestE1rmKg,
      max(
        loaded.flatMap((set) => {
          const value = estimated1RM(set.kg, set.reps, slot.exercise.modality, "kg");
          return value === null ? [] : [value];
        }),
      ),
    );
    current.bestSetVolumeKg = better(
      current.bestSetVolumeKg,
      max(loaded.flatMap((set) => (set.reps === null ? [] : [round2(set.kg * set.reps)]))),
    );
    current.mostReps = better(current.mostReps, max(reps));
    current.longestDurationSeconds = better(
      current.longestDurationSeconds,
      max(working.flatMap((set) => (set.durationSeconds === null ? [] : [set.durationSeconds]))),
    );
    current.longestDistanceMeters = better(
      current.longestDistanceMeters,
      max(working.flatMap((set) => (set.distanceMeters === null ? [] : [set.distanceMeters]))),
    );
    byExercise.set(slot.exerciseId, current);
  }
  const muscleSets: MuscleSets = {};
  for (const [muscle, sets] of Object.entries(muscles)) {
    if (sets > 0) muscleSets[muscle as MuscleGroup] = sets;
  }
  const elapsed = Math.round((workout.completedAt.getTime() - workout.startedAt.getTime()) / 1000);
  return {
    session: {
      sport: "workout",
      sourceId: workout.id,
      title: workout.day?.name?.trim() || "Workout",
      occurredOn: todayInTimeZone(timeZone, workout.startedAt),
      startedAt: workout.startedAt,
      durationSeconds: Math.min(Math.max(elapsed, 0), MAX_SESSION_SECONDS),
      workingSets,
      volumeKg: round2(volumeKg),
      distanceMeters: null,
      paceSecondsPerKm: null,
      muscleSets,
    },
    exercises: [...byExercise.values()],
  };
}

export type StatsRun = {
  id: string;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number;
};

/** A run's shared row: distance, time and pace; outdoor and treadmill are not told apart. */
export function runStats(run: StatsRun, timeZone: string): SessionStats {
  const pace = paceSecondsPerKm(run.distanceMeters, run.durationSeconds);
  return {
    sport: "run",
    sourceId: run.id,
    title: "Run",
    occurredOn: todayInTimeZone(timeZone, run.startedAt),
    startedAt: run.startedAt,
    durationSeconds: run.durationSeconds,
    workingSets: 0,
    volumeKg: 0,
    distanceMeters: run.distanceMeters,
    paceSecondsPerKm: pace === null ? null : round1(pace),
    muscleSets: {},
  };
}
