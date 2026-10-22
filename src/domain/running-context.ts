import type { MuscleGroup } from "./types";
import { addDays } from "./program-calendar";
import { weekStart } from "./running";
import { RUN_TYPES, type RunType } from "./run-types";
import { continuousStretches, type RecordedLap } from "./run-segments";

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
  /** Its laps as recorded, in order; empty when it was recorded as a whole. */
  laps: readonly RecordedLap[];
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

/** The race distances a prediction is made for. */
export const STANDARD_DISTANCES = [
  { label: "5K", metres: 5000 },
  { label: "10K", metres: 10_000 },
  { label: "Half marathon", metres: 21_097.5 },
  { label: "Marathon", metres: 42_195 },
] as const;

/** Strava's benchmark running distances, from 400 m to 50K: where a best effort is kept. */
export const BENCHMARK_DISTANCES = [
  { label: "400 m", metres: 400 },
  { label: "½ mile", metres: 804.672 },
  { label: "1K", metres: 1000 },
  { label: "1 mile", metres: 1609.344 },
  { label: "2 miles", metres: 3218.688 },
  { label: "5K", metres: 5000 },
  { label: "10K", metres: 10_000 },
  { label: "15K", metres: 15_000 },
  { label: "10 miles", metres: 16_093.44 },
  { label: "20K", metres: 20_000 },
  { label: "Half marathon", metres: 21_097.5 },
  { label: "30K", metres: 30_000 },
  { label: "Marathon", metres: 42_195 },
  { label: "50K", metres: 50_000 },
] as const;

/** How much further than a distance a stretch may run and still stand for it. */
const OVERSHOOT = 1.05;

/**
 * Riegel fitted his curve to efforts of three and a half minutes to 230 (American Scientist,
 * 1981); outside them a prediction is the formula's guess, not his.
 */
const PREDICTS_FROM_SECONDS = 210;
const PREDICTS_TO_SECONDS = 230 * 60;

export type BestEffort = {
  label: string;
  metres: number;
  /** The stretch's own time, scaled to the exact distance at its own pace. */
  seconds: number;
  on: string;
  sourceId: string;
  /** The run's reported effort: a 5 was all-out, anything less makes the time a floor. */
  effort: number | null;
  /** What kind of run it came from; null when the athlete did not say. */
  runType: RunType | null;
  /** Where in that run: "whole run", "lap 3", "laps 2–6" or "rep 2 of 6". */
  part: string;
  /** A rep of a session run in pieces, rested before and after: faster than a race could hold. */
  rep: boolean;
};

/**
 * The fastest effort at each benchmark distance, from every stretch of every run that was one
 * unbroken effort (`continuousStretches`): a whole steady run, one lap, laps run back to back, or
 * a rep. A stretch stands for a distance when it is that far and at most 5 per cent further, its
 * time scaled to the exact distance at its own pace; a longer stretch says nothing of a shorter
 * distance, since nobody knows its fastest part. These are logged training, not race results.
 */
export function bestEfforts(runs: readonly LoggedRun[]): BestEffort[] {
  const fastest = new Map<string, BestEffort>();
  for (const run of runs)
    for (const stretch of continuousStretches(run))
      for (const distance of BENCHMARK_DISTANCES) {
        if (stretch.metres < distance.metres || stretch.metres > distance.metres * OVERSHOOT)
          continue;
        const seconds = Math.round((stretch.ms / 1000) * (distance.metres / stretch.metres));
        const held = fastest.get(distance.label);
        if (held && held.seconds <= seconds) continue;
        fastest.set(distance.label, {
          label: distance.label,
          metres: distance.metres,
          seconds,
          on: run.occurredOn,
          sourceId: `activity:${run.id}`,
          effort: run.effort,
          runType: run.runType,
          part: stretch.part,
          rep: stretch.rep,
        });
      }
  return BENCHMARK_DISTANCES.flatMap((distance) => fastest.get(distance.label) ?? []);
}

/**
 * Whether an effort says anything about a race: one unbroken, unrested effort that lasted
 * between three and a half minutes and 230. A rep is rested before and after, so it is run faster
 * than the same distance could be held in a race, and a shorter effort is outside the curve.
 */
export function predictsRaces(effort: Pick<BestEffort, "seconds" | "rep">): boolean {
  return (
    !effort.rep && effort.seconds >= PREDICTS_FROM_SECONDS && effort.seconds <= PREDICTS_TO_SECONDS
  );
}

export type RepEffort = {
  /** The rep's own distance and time, as recorded. */
  metres: number;
  seconds: number;
  paceSecondsPerKm: number;
  on: string;
  sourceId: string;
  effort: number | null;
  runType: RunType | null;
  part: string;
};

/**
 * The fastest rep at each distance the athlete runs reps over, at its own recorded distance and
 * time: reps within 5 per cent of one another's distance are the same rep (a watch's 400 m and
 * 410 m). Shortest first. What a rep says about a race, it says through a coach, not a formula.
 */
export function fastestReps(runs: readonly LoggedRun[]): RepEffort[] {
  const reps = runs
    .flatMap((run) =>
      continuousStretches(run)
        .filter((stretch) => stretch.rep)
        .map((stretch): RepEffort => ({
          metres: Math.round(stretch.metres),
          seconds: Math.round(stretch.ms / 1000),
          paceSecondsPerKm: Math.round(stretch.ms / stretch.metres),
          on: run.occurredOn,
          sourceId: `activity:${run.id}`,
          effort: run.effort,
          runType: run.runType,
          part: stretch.part,
        })),
    )
    .sort((a, b) => a.metres - b.metres);
  const groups: RepEffort[][] = [];
  for (const rep of reps) {
    const group = groups.at(-1);
    if (group && rep.metres <= group[0]!.metres * OVERSHOOT) group.push(rep);
    else groups.push([rep]);
  }
  return groups.map((group) =>
    group.reduce((best, rep) => (rep.paceSecondsPerKm < best.paceSecondsPerKm ? rep : best)),
  );
}

/** The distances "A recent race or time trial" names, beside Another distance. */
const RACE_EVIDENCE_DISTANCES = [
  { label: "Mile", metres: 1609.344 },
  { label: "5K", metres: 5000 },
  { label: "10K", metres: 10_000 },
  { label: "Half marathon", metres: 21_097.5 },
  { label: "Marathon", metres: 42_195 },
] as const;

/**
 * The athlete's latest run logged as a race or a time trial, whole: the only runs that answer
 * "A recent race or time trial", as Runna and Daniels set paces from one. Any other run is
 * training, however fast, and is not offered as one.
 *
 * A race is a measured course, so its time stands for its distance whatever the watch measured,
 * 3 per cent short to 5 per cent long; a time trial is the watch's distance, scaled at its own
 * pace to the distance it stands for within 5 per cent. Anything else keeps its own distance.
 */
export function latestRaceOrTrial(
  runs: readonly LoggedRun[],
): { label: string; metres: number; seconds: number; on: string } | null {
  const raced = runs.filter(
    (run) =>
      (run.runType === "race" || run.runType === "time_trial") &&
      run.distanceMetres > 0 &&
      run.durationMs > 0,
  );
  if (raced.length === 0) return null;
  const latest = raced.reduce((held, run) => (run.occurredOn > held.occurredOn ? run : held));
  const seconds = Math.round(latest.durationMs / 1000);
  const race = latest.runType === "race";
  const named = RACE_EVIDENCE_DISTANCES.find(
    (distance) =>
      latest.distanceMetres >= distance.metres * (race ? 0.97 : 1) &&
      latest.distanceMetres <= distance.metres * OVERSHOOT,
  );
  if (!named)
    return {
      label: "Another distance",
      metres: latest.distanceMetres,
      seconds,
      on: latest.occurredOn,
    };
  return {
    label: named.label,
    metres: named.metres,
    seconds: race ? seconds : Math.round((seconds * named.metres) / latest.distanceMetres),
    on: latest.occurredOn,
  };
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
