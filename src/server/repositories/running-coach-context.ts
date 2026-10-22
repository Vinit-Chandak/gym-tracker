import { and, eq, gte, lte } from "drizzle-orm";

import { activities, exercises, runningActivityDetails } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { CoachIntake } from "@/domain/coaching-workflow";
import { ZONE_FEEL } from "@/domain/heart-rate";
import { addDays } from "@/domain/program-calendar";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import {
  bestEfforts,
  fastestReps,
  latestRaceOrTrial,
  legLoad,
  longestRunWithin,
  predictions,
  predictsRaces,
  runMix,
  runningWeeks,
  WEEKDAY_NAMES,
  type LoggedRun,
} from "@/domain/running-context";
import { raceMetres } from "@/domain/running-intake";
import { recordedLap } from "@/domain/run-segments";
import type { MuscleGroup } from "@/domain/types";
import type { Profile } from "@/server/queries/profile";
import { sharedExercises } from "@/server/queries/reference";

import { readHeartRate } from "./heart-rate";

/**
 * What a running job reads about the runner (ADR 0059), beside the context every job reads.
 *
 * The shared context gives a week of runs and a thirty-day total, which is enough to prepare a
 * session and not enough to write a marathon block: that needs where the runner has been for
 * months, their best honest efforts, their zones, their goal in their own words and which days
 * their lifting loads the legs. Everything here is read from their records and stated as such;
 * nothing is estimated that the records do not hold, except the age formula, which says it is one.
 */

const HISTORY_WEEKS = 16;
const BEST_EFFORT_DAYS = 182;

async function loggedRuns(db: DbOrTx, userId: string, from: string, to: string) {
  const rows = await db
    .select({
      id: activities.id,
      occurredOn: activities.occurredOn,
      durationMs: activities.durationMs,
      distanceMetres: runningActivityDetails.distanceMetres,
      runType: runningActivityDetails.runType,
      laps: runningActivityDetails.laps,
      environment: runningActivityDetails.environment,
      effortValue: activities.effortValue,
      effortStatus: activities.effortStatus,
    })
    .from(activities)
    .innerJoin(runningActivityDetails, eq(runningActivityDetails.activityId, activities.id))
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.sport, "running"),
        eq(activities.status, "completed"),
        gte(activities.occurredOn, from),
        lte(activities.occurredOn, to),
      ),
    );
  return rows.map((row): LoggedRun => ({
    id: row.id,
    occurredOn: row.occurredOn,
    durationMs: row.durationMs ?? 0,
    distanceMetres: row.distanceMetres,
    runType: row.runType,
    environment: row.environment,
    effort: row.effortStatus === "reported" ? row.effortValue : null,
    laps: row.laps.map(recordedLap),
  }));
}

/** An older programme's runs by weekday: how many of its weeks run there, and for how long. */
function legacyRuns(runs: ProgramBlueprint["runs"]) {
  const byDay = new Map<number, ProgramBlueprint["runs"]>();
  for (const run of runs) byDay.set(run.dayOfWeek, [...(byDay.get(run.dayOfWeek) ?? []), run]);
  return [...byDay]
    .sort(([a], [b]) => a - b)
    .map(([day, entries]) => ({
      weekday: WEEKDAY_NAMES[day - 1],
      weeks: entries.length,
      minutes: [
        Math.min(...entries.map((run) => run.duration[0])),
        Math.max(...entries.map((run) => run.duration[1])),
      ],
    }));
}

/** Which weekdays each other programme loads the legs, read from its days' exercises. */
async function otherProgrammes(
  db: DbOrTx,
  userId: string,
  programmes: readonly { sport: string; blueprint: ProgramBlueprint | null }[],
) {
  const own = await db.select().from(exercises).where(eq(exercises.userId, userId));
  const muscles = new Map<string, readonly MuscleGroup[]>(
    [...(await sharedExercises(db)), ...own].map((exercise) => [
      exercise.slug,
      exercise.primaryMuscles,
    ]),
  );
  return programmes
    .filter((programme) => programme.sport !== "running" && programme.blueprint)
    .map(({ sport, blueprint }) => {
      const plan = blueprint!;
      if (plan.days.length === 0)
        return {
          sport,
          name: plan.name,
          sessionsPerWeek:
            Math.round(((plan.enduranceSessions?.length ?? 0) / plan.weeks) * 10) / 10,
          days: [],
        };
      return {
        sport,
        name: plan.name,
        repeats: plan.repeats ?? null,
        // An older combined programme's own runs, which the running programme takes over.
        ...(plan.runs.length > 0 ? { runs: legacyRuns(plan.runs) } : {}),
        days: plan.days
          .filter((day) => day.includesLifting)
          .map((day) => {
            const legs = legLoad(
              day.exercises.map((exercise) => ({
                sets: exercise.sets,
                primaryMuscles: muscles.get(exercise.exerciseSlug) ?? [],
              })),
            );
            return {
              weekday: WEEKDAY_NAMES[day.dayOfWeek - 1],
              name: day.name,
              focus: day.focus || null,
              legSets: legs.sets,
              legLoad: legs.load,
            };
          }),
      };
    });
}

export async function runningCoachContext(
  db: DbOrTx,
  profile: Profile,
  today: string,
  intake: CoachIntake | null,
  programmes: readonly { sport: string; blueprint: ProgramBlueprint | null }[],
) {
  const runs = await loggedRuns(db, profile.id, addDays(today, -BEST_EFFORT_DAYS), today);
  const weeks = runningWeeks(runs, today, HISTORY_WEEKS);
  // The four complete weeks before this one, which is still being run.
  const complete = weeks.slice(1, 5);
  const heartRate = await readHeartRate(db, profile, today);
  const entry = intake?.sports.find((sport) => sport.sport === "running") ?? null;
  const goal = entry?.running ?? null;
  const evidence = goal?.recentEffort ?? null;
  const efforts = bestEfforts(runs.filter((run) => run.occurredOn >= addDays(today, -56)));
  const older = bestEfforts(runs).filter(
    (effort) => !efforts.some((recent) => recent.label === effort.label),
  );
  const resolved = heartRate.resolved;
  return {
    meaning:
      "This runner's own running, read from their logged runs and confirmed answers. weeks are calendar weeks, Monday first, newest first; the first is this week, still being run. recentWeeklyKm averages the four complete weeks before it: totals, every kind of run included. bestEfforts are the fastest stretch at each of Strava's benchmark distances (400 m to 50K) that was one unbroken effort, from the record alone: a whole steady run, one lap, laps run back to back (only when every lap is timed and they add up to the run's time), or one rep; part says which. A session run in pieces (intervals, hills, sprints, run-walk) or a run with a recovery lap never counts whole, and its reps are never joined: its total may hold the recoveries or leave them out. A stretch counts for a distance when it is that far and at most 5% further, its time scaled at its own pace; these are logged training, not race results. reps are the fastest rep at each distance the athlete runs reps over, at its own recorded distance and time, rested before and after: read interval paces from them, never as a race pace. predictions use Riegel's exponent and come only from an unrested effort of 3.5 to 230 minutes (Riegel's own range); a marathon prediction from a short distance is best-case. Each effort carries the effort the athlete reported for that run: 5 was all-out, anything less makes the time a floor. heartRate.basis 'estimated' is an age formula about ten beats either way. otherProgrammes are context: legLoad heavy means eight or more leg sets that day; runs are an older combined programme's own, withdrawn from the day this running programme starts, so leave them out of it.",

    today,
    weekday: WEEKDAY_NAMES[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7],
    goal: goal
      ? {
          ...goal,
          raceDistanceMetres: raceMetres(goal) ?? goal.raceDistanceMetres,
          runsPerWeek: entry?.sessionsPerWeek ?? intake?.sessionsPerWeek ?? null,
          runDays: (entry?.preferredDays.length
            ? entry.preferredDays
            : (intake?.preferredRunDays ?? [])
          ).map((day) => WEEKDAY_NAMES[day - 1]),
          longRunDay: goal.longRunDay ? WEEKDAY_NAMES[goal.longRunDay - 1] : null,
          minutesPerRun: entry?.minutesPerSession ?? intake?.minutesPerSession ?? null,
          experience: entry?.experience ?? intake?.experience ?? null,
          // The athlete's own race or time trial, unrested; outside Riegel's range it predicts nothing.
          predictions:
            evidence && predictsRaces({ seconds: evidence.timeSeconds, rep: false })
              ? predictions(evidence.distanceMetres, evidence.timeSeconds)
              : null,
        }
      : null,
    weeks,
    recentWeeklyKm:
      Math.round((complete.reduce((sum, week) => sum + week.km, 0) / complete.length) * 10) / 10,
    recentRunsPerWeek:
      Math.round((complete.reduce((sum, week) => sum + week.runs, 0) / complete.length) * 10) / 10,
    peakWeekKm: Math.max(0, ...weeks.map((week) => week.km)),
    longestRun30Days: longestRunWithin(runs, today, 30),
    bestEfforts: [...efforts, ...older].map((effort) => ({
      ...effort,
      recent: efforts.includes(effort),
      predictions: predictsRaces(effort) ? predictions(effort.metres, effort.seconds) : null,
    })),
    reps: fastestReps(runs.filter((run) => run.occurredOn >= addDays(today, -56))),
    mix: runMix(runs.filter((run) => run.occurredOn >= addDays(today, -56))),
    heartRate: resolved
      ? {
          max: resolved.max,
          basis: resolved.basis,
          since: resolved.on,
          resting: resolved.resting,
          method: resolved.method,
          zones: resolved.zones.map((zone) => ({ ...zone, feel: ZONE_FEEL[zone.zone] })),
        }
      : null,
    otherProgrammes: await otherProgrammes(db, profile.id, programmes),
  };
}

/**
 * What the runner's logs say about where they are now, for the running intake to start from
 * (ADR 0059): their usual week of the last four complete ones, their longest run of the last
 * month and their latest race or time trial of the last eight weeks (ADR 0062: never a training
 * run, however fast). Each is offered as the answer, clearly from the logs, and stays the
 * athlete's to change; nothing here is sent unless they keep it.
 */
export async function runningSnapshot(db: DbOrTx, userId: string, today: string) {
  const runs = await loggedRuns(db, userId, addDays(today, -BEST_EFFORT_DAYS), today);
  const complete = runningWeeks(runs, today, 5).slice(1);
  return {
    weeklyKm: Math.round((complete.reduce((sum, week) => sum + week.km, 0) / 4) * 10) / 10,
    runsPerWeek: Math.round(complete.reduce((sum, week) => sum + week.runs, 0) / 4),
    longest: longestRunWithin(runs, today, 30),
    effort: latestRaceOrTrial(runs.filter((run) => run.occurredOn >= addDays(today, -56))),
  };
}
