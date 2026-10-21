import type { MuscleGroup } from "./types";
import { addDays } from "./program-calendar";
import { weekStart } from "./running";
import { RUN_TYPES, type RunType } from "./run-types";

/**
 * What a running coach reads before it plans (ADR 0059), worked out once by the server so every
 * run of the coach reads the same numbers: how much the athlete has run week by week, their
 * longest recent run, their best honest efforts and what those predict, and which days their
 * other programmes load the legs.
 *
 * Each number comes from logged runs and nothing else. A week with no runs is a week of zero
 * runs, said so; a distance nobody logged is not filled in from a plan.
 */

export type LoggedRun = {
  id: string;
  /** The local date it happened on, as stored. */
  occurredOn: string;
  distanceMetres: number;
  durationMs: number;
  runType: RunType | null;
  environment: string;
  /** The effort the athlete reported, out of five; null when they did not say. */
  effort: number | null;
};

export type RunningWeek = {
  /** Monday of the week. */
  weekStart: string;
  runs: number;
  km: number;
  minutes: number;
  longestKm: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Every week of the last `weeks`, newest first, empty ones included. */
export function runningWeeks(
  runs: readonly LoggedRun[],
  today: string,
  weeks: number,
): RunningWeek[] {
  const current = weekStart(today);
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(current, -7 * index);
    const inWeek = runs.filter(
      (run) => run.occurredOn <= today && weekStart(run.occurredOn) === start,
    );
    return {
      weekStart: start,
      runs: inWeek.length,
      km: round1(inWeek.reduce((sum, run) => sum + run.distanceMetres, 0) / 1000),
      minutes: Math.round(inWeek.reduce((sum, run) => sum + run.durationMs, 0) / 60_000),
      longestKm: round1(Math.max(0, ...inWeek.map((run) => run.distanceMetres)) / 1000),
    };
  });
}

/** The longest run of the last `days` days before and including `today`, or null. */
export function longestRunWithin(
  runs: readonly LoggedRun[],
  today: string,
  days: number,
): { km: number; on: string; id: string } | null {
  const from = addDays(today, -days + 1);
  const recent = runs.filter((run) => run.occurredOn >= from && run.occurredOn <= today);
  if (recent.length === 0) return null;
  const longest = recent.reduce((best, run) =>
    run.distanceMetres > best.distanceMetres ? run : best,
  );
  return { km: round1(longest.distanceMetres / 1000), on: longest.occurredOn, id: longest.id };
}

/** Riegel's endurance formula: T2 = T1 × (D2 / D1)^1.06, fitted to world records. */
export function riegelSeconds(seconds: number, fromMetres: number, toMetres: number): number {
  return seconds * Math.pow(toMetres / fromMetres, 1.06);
}

export const STANDARD_DISTANCES = [
  { label: "5K", metres: 5000 },
  { label: "10K", metres: 10_000 },
  { label: "Half marathon", metres: 21_097.5 },
  { label: "Marathon", metres: 42_195 },
] as const;

export type BestEffort = {
  label: string;
  metres: number;
  /** The run's own time scaled to the exact distance, at its own pace. */
  seconds: number;
  on: string;
  sourceId: string;
  /** The run's reported effort: a 5 was all-out, anything less makes the time a floor. */
  effort: number | null;
};

/**
 * The fastest whole run at each standard distance: a run counts for a distance when it was at
 * least that far and no more than 5 per cent further, and its time is its pace times the exact
 * distance. A whole run is not a race, so the coach is told these are logged runs, not results.
 */
export function bestEfforts(runs: readonly LoggedRun[]): BestEffort[] {
  const efforts: BestEffort[] = [];
  for (const standard of STANDARD_DISTANCES) {
    const candidates = runs.filter(
      (run) =>
        run.distanceMetres >= standard.metres &&
        run.distanceMetres <= standard.metres * 1.05 &&
        run.durationMs > 0,
    );
    if (candidates.length === 0) continue;
    const fastest = candidates.reduce((best, run) =>
      run.durationMs / run.distanceMetres < best.durationMs / best.distanceMetres ? run : best,
    );
    efforts.push({
      label: standard.label,
      metres: standard.metres,
      seconds: Math.round((fastest.durationMs / 1000) * (standard.metres / fastest.distanceMetres)),
      on: fastest.occurredOn,
      sourceId: `activity:${fastest.id}`,
      effort: fastest.effort,
    });
  }
  return efforts;
}

/** What one effort predicts at every standard distance (Riegel; a marathon is best-case). */
export function predictions(fromMetres: number, seconds: number) {
  return STANDARD_DISTANCES.map((standard) => ({
    label: standard.label,
    seconds: Math.round(riegelSeconds(seconds, fromMetres, standard.metres)),
  }));
}

/** How many of each kind of run, of those that said, and on what. */
export function runMix(runs: readonly LoggedRun[]) {
  const types: Partial<Record<RunType, number>> = {};
  for (const type of RUN_TYPES) {
    const count = runs.filter((run) => run.runType === type).length;
    if (count > 0) types[type] = count;
  }
  const environments: Record<string, number> = {};
  for (const run of runs) environments[run.environment] = (environments[run.environment] ?? 0) + 1;
  return { types, untyped: runs.filter((run) => run.runType === null).length, environments };
}

const LEG_MUSCLES: readonly MuscleGroup[] = [
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "abductors",
  "hip_flexors",
];

export type LegLoad = "heavy" | "moderate" | "light" | "none";

/**
 * How hard a strength day is on the legs, from its working sets: a set of an exercise whose
 * first muscles are the legs' counts whole, a calf set half. Eight or more is a leg day a run
 * should keep away from; one to three is a little leg work beside the rest. A rule of thumb for
 * planning around, said as one, never a measurement of fatigue.
 */
export function legLoad(
  exercises: readonly { sets: number; primaryMuscles: readonly MuscleGroup[] }[],
): { sets: number; load: LegLoad } {
  let sets = 0;
  for (const exercise of exercises) {
    if (exercise.primaryMuscles.some((muscle) => LEG_MUSCLES.includes(muscle)))
      sets += exercise.sets;
    else if (exercise.primaryMuscles.includes("calves")) sets += exercise.sets / 2;
  }
  return {
    sets,
    load: sets >= 8 ? "heavy" : sets >= 4 ? "moderate" : sets > 0 ? "light" : "none",
  };
}

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
