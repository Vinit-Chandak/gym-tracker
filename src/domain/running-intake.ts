import { z } from "zod";

/**
 * What a runner answers before the coach writes their programme (ADR 0059).
 *
 * Every running app that builds plans asks the same few things, because a plan cannot be built
 * without them: what the runner is training for (a race on a date, or a goal without one), one
 * honest piece of fitness evidence (a recent race or time trial, which sets every pace), how
 * much they run now (weekly distance and their longest recent run, which set where the plan
 * starts), and when they can run (how often, which days, the long run's day, and any day with a
 * time limit). Runna, Garmin Coach, COROS and Polar differ in how they ask, not in what. A race
 * after the goal may be named too, for the block to lead into (ADR 0063).
 *
 * Every answer may be missing on a draft. The coach reads what was given beside the runner's
 * own logged runs, and asks for what it cannot do without; nothing here is guessed in.
 */

const weekday = z.number().int().min(1).max(7);

/**
 * What the programme is for. `race` has a date; the others do not. `start` is somebody new to
 * running, run-walk first; `return` is coming back after a break or an injury.
 */
export const RUNNING_GOALS = [
  "race",
  "faster",
  "further",
  "base",
  "start",
  "return",
  "maintain",
] as const;
export type RunningGoal = (typeof RUNNING_GOALS)[number];

export const RUNNING_GOAL_LABELS: Record<RunningGoal, string> = {
  race: "A race on a date",
  faster: "Get faster at a distance",
  further: "Run further",
  base: "Build an aerobic base",
  start: "Start running",
  return: "Come back after a break",
  maintain: "Keep my running going",
};

/** The distances a plan is built for: sprints, the track, the road and beyond. */
export const RACE_DISTANCES = [
  "100m",
  "200m",
  "400m",
  "800m",
  "1500m",
  "mile",
  "5k",
  "10k",
  "half_marathon",
  "marathon",
  "ultra",
  "other",
] as const;
export type RaceDistance = (typeof RACE_DISTANCES)[number];

export const RACE_DISTANCE_LABELS: Record<RaceDistance, string> = {
  "100m": "100 m",
  "200m": "200 m",
  "400m": "400 m",
  "800m": "800 m",
  "1500m": "1500 m",
  mile: "Mile",
  "5k": "5K",
  "10k": "10K",
  half_marathon: "Half marathon",
  marathon: "Marathon",
  ultra: "Ultra",
  other: "Another distance",
};

/** Each named distance in metres; an ultra and "another" say their own. */
export const RACE_DISTANCE_METRES: Record<Exclude<RaceDistance, "ultra" | "other">, number> = {
  "100m": 100,
  "200m": 200,
  "400m": 400,
  "800m": 800,
  "1500m": 1500,
  mile: 1609.344,
  "5k": 5000,
  "10k": 10_000,
  half_marathon: 21_097.5,
  marathon: 42_195,
};

export const RUNNING_PLACES = ["outdoor", "treadmill", "track", "trail"] as const;
export type RunningPlace = (typeof RUNNING_PLACES)[number];

export const RUNNING_TERRAINS = ["flat", "rolling", "hilly"] as const;

/**
 * The most a run may take on a weekday, where the runner has a limit (ADR 0063): "40 minutes
 * before work, as long as it takes on Sunday". A day without one has none, and with none at all
 * the coach sizes each run from the goal and the runner's own usual runs.
 */
export const RUN_TIME_LIMIT_MINUTES = { min: 10, max: 600 } as const;

const timeLimitSchema = z.object({
  day: weekday,
  minutes: z.number().int().min(RUN_TIME_LIMIT_MINUTES.min).max(RUN_TIME_LIMIT_MINUTES.max),
});

/** A race after this block's goal, which the block leads into without planning (ADR 0063). */
const laterRaceSchema = z.object({
  raceDistance: z.enum(RACE_DISTANCES),
  /** For an ultra or another distance. */
  raceDistanceMetres: z.number().int().min(50).max(1_000_000).nullable().default(null),
  raceDate: z.iso.date(),
});
export type LaterRace = z.infer<typeof laterRaceSchema>;

export const runningIntakeSchema = z.object({
  goal: z.enum(RUNNING_GOALS).nullable().default(null),
  raceDistance: z.enum(RACE_DISTANCES).nullable().default(null),
  /** For an ultra or another distance: a 15K, a 50-miler. */
  raceDistanceMetres: z.number().int().min(50).max(1_000_000).nullable().default(null),
  raceDate: z.iso.date().nullable().default(null),
  /** Optional, as Runna leaves it: a goal time is a hope, the evidence below sets the paces. */
  goalTimeSeconds: z
    .number()
    .int()
    .min(5)
    .max(7 * 86_400)
    .nullable()
    .default(null),
  /** A recent race or all-out time trial, the one piece of evidence every pace comes from. */
  recentEffort: z
    .object({
      distanceMetres: z.number().min(50).max(1_000_000),
      timeSeconds: z
        .number()
        .int()
        .min(5)
        .max(7 * 86_400),
      on: z.iso.date().nullable().default(null),
    })
    .nullable()
    .default(null),
  /** What the runner covers in a usual week now, and the longest run of the last month. */
  weeklyDistanceMetres: z.number().int().min(0).max(1_000_000).nullable().default(null),
  longestRecentMetres: z.number().int().min(0).max(1_000_000).nullable().default(null),
  longRunDay: weekday.nullable().default(null),
  /**
   * How long the long run may be, as an intake written before `timeLimits` said it; its other
   * runs took the intake's minutes per session. Read, never written now (ADR 0063).
   */
  longRunMinutes: z.number().int().min(10).max(600).nullable().default(null),
  /** Each weekday's limit, where it has one (ADR 0063). */
  timeLimits: z
    .array(timeLimitSchema)
    .max(7)
    .default([])
    .refine(
      (limits) => new Set(limits.map((limit) => limit.day)).size === limits.length,
      "Give each weekday one limit.",
    ),
  nextRace: laterRaceSchema.nullable().default(null),
  places: z
    .array(z.enum(RUNNING_PLACES))
    .max(RUNNING_PLACES.length)
    .default([])
    .refine((places) => new Set(places).size === places.length, "Choose each place once."),
  terrain: z.enum(RUNNING_TERRAINS).nullable().default(null),
});
export type RunningIntake = z.infer<typeof runningIntakeSchema>;

/** The race's distance in metres, whichever way it was given; null without one. */
export function raceMetres(intake: Pick<RunningIntake, "raceDistance" | "raceDistanceMetres">) {
  if (!intake.raceDistance) return null;
  if (intake.raceDistance === "ultra" || intake.raceDistance === "other")
    return intake.raceDistanceMetres;
  return RACE_DISTANCE_METRES[intake.raceDistance];
}

export type RunTimeLimit = z.infer<typeof timeLimitSchema>;

/**
 * Each weekday's limit, Monday first (ADR 0063). An intake written before the limits were asked
 * said one figure for every run and perhaps another for the long run: on the days it offered
 * (every day where it offered none), each takes the first, and the long run's day the second, or
 * none. An older intake that never said its long run's day cannot say which day is free.
 */
export function runTimeLimits(
  intake: Pick<RunningIntake, "timeLimits" | "longRunDay" | "longRunMinutes"> | null,
  minutesPerRun: number | null,
  days: readonly number[],
): RunTimeLimit[] {
  if (intake?.timeLimits.length) return [...intake.timeLimits].sort((a, b) => a.day - b.day);
  const longRun = intake?.longRunDay ?? null;
  const longRunMinutes = intake?.longRunMinutes ?? null;
  const offered = days.length > 0 ? [...days].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7];
  return offered.flatMap((day) => {
    const minutes = day === longRun ? longRunMinutes : minutesPerRun;
    return minutes === null ? [] : [{ day, minutes }];
  });
}

/**
 * What a running intake is missing before a programme can be asked for, as the form says it.
 * A race needs its distance and date, and a date still to come; a goal time without a distance
 * means nothing.
 */
export function runningIntakeProblems(
  intake: RunningIntake | null,
  today: string,
): { path: string; message: string }[] {
  const problems: { path: string; message: string }[] = [];
  if (!intake?.goal) {
    problems.push({ path: "goal", message: "Choose what you are training for." });
    return problems;
  }
  if (intake.goal === "race" || intake.goal === "faster") {
    if (!intake.raceDistance)
      problems.push({ path: "raceDistance", message: "Choose the distance." });
    else if (
      (intake.raceDistance === "ultra" || intake.raceDistance === "other") &&
      !intake.raceDistanceMetres
    )
      problems.push({ path: "raceDistanceMetres", message: "Say how far the race is." });
  }
  if (intake.goal === "race") {
    if (!intake.raceDate) problems.push({ path: "raceDate", message: "Choose the race date." });
    else if (intake.raceDate <= today)
      problems.push({ path: "raceDate", message: "Choose a race date still to come." });
  }
  if (intake.recentEffort?.on && intake.recentEffort.on > today)
    problems.push({ path: "recentEffort", message: "A recent race cannot be in the future." });
  const later = intake.nextRace;
  if (later) {
    if (
      (later.raceDistance === "ultra" || later.raceDistance === "other") &&
      !later.raceDistanceMetres
    )
      problems.push({
        path: "nextRace.raceDistanceMetres",
        message: "Say how far the later race is.",
      });
    const after = intake.goal === "race" && intake.raceDate ? intake.raceDate : today;
    if (later.raceDate <= after)
      problems.push({
        path: "nextRace.raceDate",
        message:
          after === today ? "Choose a later race still to come." : "Choose a date after the race.",
      });
  }
  return problems;
}
