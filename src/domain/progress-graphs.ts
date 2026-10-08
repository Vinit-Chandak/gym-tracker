import { estimated1RM } from "./analytics";
import { daysBetween } from "./program-calendar";
import type { RecoveryReading } from "./recovery";
import { rangeSlots, slotIndex, type GraphRange, type Slot } from "./graph-range";
import { splitGroupOf } from "./muscle-split";
import { weekStart } from "./running";

/**
 * What each Progress graph draws, from the rows the server read (ADR 0042). Pure numbers here:
 * every rule about what counts, and what an average is taken over, can be tested without a
 * database or a browser.
 */

const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** An average and how many days it was taken over. */
export type LoggedMean = { mean: number | null; days: number };

/** The mean of what was recorded; nothing recorded is no average, never zero. */
function meanOf(values: readonly number[], places = 2): LoggedMean {
  if (values.length === 0) return { mean: null, days: 0 };
  return {
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, places),
    days: values.length,
  };
}

/** The last day a range has had so far: today, or the range's own end if that came first. */
export function lastDayOf(range: GraphRange, today: string): string {
  return range.to < today ? range.to : today;
}

/** How many days of a range have happened, its first and its last (or today) included. */
export function daysSoFar(range: GraphRange, today: string): number {
  return Math.max(0, daysBetween(range.from, lastDayOf(range, today)) + 1);
}

// ---------- Strength: volume by muscle group ----------

/** The groups Strength files exercises under, in the order its picker lists them. */
export const STRENGTH_GROUPS = ["chest", "back", "legs", "shoulders", "arms", "core"] as const;
export type StrengthGroup = (typeof STRENGTH_GROUPS)[number];
export type StrengthGroupChoice = StrengthGroup | "all";
export const STRENGTH_GROUP_CHOICES: readonly StrengthGroupChoice[] = ["all", ...STRENGTH_GROUPS];

/**
 * The one group an exercise is filed under (ADR 0043): its first primary muscle's, as the
 * exercise library files it, at the radar's six (`splitGroupOf`), so the split a friend sees and
 * this graph agree. One group each, as a training log gives each exercise one category, so a
 * group's volume is the volume of the exercises listed under it and the six add up to All. An
 * exercise naming no muscle the app knows is under All only.
 */
export function strengthGroupOf(primaryMuscles: readonly string[]): StrengthGroup | null {
  return (splitGroupOf(primaryMuscles)?.toLowerCase() as StrengthGroup | undefined) ?? null;
}

/** One exercise in one finished workout: its working sets, what they lifted, its muscles. */
export type StrengthRow = {
  sessionId: string;
  /** The workout's day in the account's time zone. */
  date: string;
  primaryMuscles: readonly string[];
  workingSets: number;
  /** Load × reps over its kg and lb working sets, in kilograms. */
  volumeKg: number;
};

export type GroupFigures = Record<StrengthGroupChoice, number>;

const noFigures = (): GroupFigures =>
  Object.fromEntries(STRENGTH_GROUP_CHOICES.map((group) => [group, 0])) as GroupFigures;

const roundFigures = (figures: GroupFigures): GroupFigures =>
  Object.fromEntries(
    Object.entries(figures).map(([group, value]) => [group, round(value)]),
  ) as GroupFigures;

export type StrengthBucket = Slot & {
  /** Load × reps in kilograms: every exercise's under All, each group's own exercises'. */
  volume: GroupFigures;
  /** Working sets, loaded or not: a bodyweight or timed set is work with no load to count. */
  sets: GroupFigures;
  /** Workouts in the bucket that trained each group (any group, under "all"). */
  workouts: GroupFigures;
  /** Where a group's work in the bucket came from one workout: that workout, so a tap opens it. */
  sessionId: Partial<Record<StrengthGroupChoice, string>>;
};

export type StrengthGraph = {
  buckets: StrengthBucket[];
  totals: { volume: GroupFigures; sets: GroupFigures };
  /** Workouts in the range that trained each group. */
  workouts: GroupFigures;
  /**
   * Weeks with at least one finished workout. A week off is not a week of no volume for the
   * weekly average: the average is taken over the weeks that were trained.
   */
  weeksTrained: number;
};

type Sessions = Record<StrengthGroupChoice, Set<string>>;
const noSessions = (): Sessions =>
  Object.fromEntries(STRENGTH_GROUP_CHOICES.map((group) => [group, new Set<string>()])) as Sessions;
const countsOf = (sessions: Sessions): GroupFigures =>
  Object.fromEntries(
    STRENGTH_GROUP_CHOICES.map((group) => [group, sessions[group].size]),
  ) as GroupFigures;

/** Volume by muscle group, a bar per day, week or month (ADR 0043). */
export function strengthGraph(
  rows: readonly StrengthRow[],
  range: GraphRange,
  today: string,
): StrengthGraph {
  const buckets = rangeSlots(range, today).map((slot) => ({
    slot,
    volume: noFigures(),
    sets: noFigures(),
    sessions: noSessions(),
  }));
  const totals = { volume: noFigures(), sets: noFigures() };
  const sessions = noSessions();
  const weeks = new Set<string>();
  for (const row of rows) {
    const bucket = buckets[slotIndex(range, row.date)];
    if (!bucket || row.workingSets <= 0) continue;
    weeks.add(weekStart(row.date));
    const group = strengthGroupOf(row.primaryMuscles);
    for (const choice of group ? (["all", group] as const) : (["all"] as const)) {
      bucket.volume[choice] += row.volumeKg;
      bucket.sets[choice] += row.workingSets;
      totals.volume[choice] += row.volumeKg;
      totals.sets[choice] += row.workingSets;
      bucket.sessions[choice].add(row.sessionId);
      sessions[choice].add(row.sessionId);
    }
  }
  return {
    buckets: buckets.map(({ slot, volume, sets, sessions: held }) => ({
      ...slot,
      volume: roundFigures(volume),
      sets: roundFigures(sets),
      workouts: countsOf(held),
      sessionId: Object.fromEntries(
        STRENGTH_GROUP_CHOICES.flatMap((group) =>
          held[group].size === 1 ? [[group, [...held[group]][0]!]] : [],
        ),
      ),
    })),
    totals: { volume: roundFigures(totals.volume), sets: roundFigures(totals.sets) },
    workouts: countsOf(sessions),
    weeksTrained: weeks.size,
  };
}

// ---------- Strength: one exercise, session by session ----------

/** One working set of the exercise being drawn, with the workout it was in. */
export type ExerciseSetRow = {
  sessionId: string;
  date: string;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

/** A set as the readout names it: "100 kg × 6". */
export type SetFigure = { weight: number | null; reps: number | null };

/** What one workout did with the exercise: its best by each measure, and the set behind it. */
export type ExerciseSession = {
  date: string;
  sessionId: string;
  e1rm: number | null;
  e1rmSet: SetFigure | null;
  maxWeight: number | null;
  /** The most reps done at the heaviest load. */
  maxWeightReps: number | null;
  maxReps: number | null;
  /** The heaviest load the most reps were done with. */
  maxRepsWeight: number | null;
  /** The best single set by load × reps. */
  maxVolume: number | null;
  maxVolumeSet: SetFigure | null;
  maxSeconds: number | null;
  maxMetres: number | null;
};

/**
 * The measures an exercise is drawn by, in the order they are offered. Average RIR and total
 * reps are not among them (ADR 0042): neither says whether the lift is going anywhere.
 */
export const EXERCISE_MEASURES = [
  "e1rm",
  "maxWeight",
  "maxReps",
  "maxVolume",
  "maxSeconds",
  "maxMetres",
] as const;
export type ExerciseMeasure = (typeof EXERCISE_MEASURES)[number];

const better = (value: number | null, best: number | null) =>
  value !== null && (best === null || value > best);

/**
 * Each workout's bests, oldest first. A load of nothing is a bodyweight set: it has reps, and
 * no weight or volume to speak of. Estimated 1RM is Epley's, on barbell and dumbbell sets of
 * 1–10 reps, through the one function the rest of the app uses.
 */
export function exerciseSessions(
  rows: readonly ExerciseSetRow[],
  modality: string,
  unit: string,
): ExerciseSession[] {
  const sessions = new Map<string, ExerciseSession>();
  for (const row of rows) {
    const session = sessions.get(row.sessionId) ?? {
      date: row.date,
      sessionId: row.sessionId,
      e1rm: null,
      e1rmSet: null,
      maxWeight: null,
      maxWeightReps: null,
      maxReps: null,
      maxRepsWeight: null,
      maxVolume: null,
      maxVolumeSet: null,
      maxSeconds: null,
      maxMetres: null,
    };
    const weight = row.weight !== null && row.weight > 0 ? row.weight : null;
    const reps = row.reps !== null && row.reps > 0 ? row.reps : null;
    const e1rm = estimated1RM(weight, reps, modality, unit);
    if (better(e1rm, session.e1rm)) {
      session.e1rm = e1rm;
      session.e1rmSet = { weight, reps };
    }
    if (better(weight, session.maxWeight)) {
      session.maxWeight = weight;
      session.maxWeightReps = reps;
    } else if (
      weight !== null &&
      weight === session.maxWeight &&
      better(reps, session.maxWeightReps)
    )
      session.maxWeightReps = reps;
    if (better(reps, session.maxReps)) {
      session.maxReps = reps;
      session.maxRepsWeight = weight;
    } else if (reps !== null && reps === session.maxReps && better(weight, session.maxRepsWeight))
      session.maxRepsWeight = weight;
    const volume = weight !== null && reps !== null ? round(weight * reps) : null;
    if (better(volume, session.maxVolume)) {
      session.maxVolume = volume;
      session.maxVolumeSet = { weight, reps };
    }
    const seconds =
      row.durationSeconds !== null && row.durationSeconds > 0 ? row.durationSeconds : null;
    if (better(seconds, session.maxSeconds)) session.maxSeconds = seconds;
    const metres =
      row.distanceMeters !== null && row.distanceMeters > 0 ? row.distanceMeters : null;
    if (better(metres, session.maxMetres)) session.maxMetres = metres;
    sessions.set(row.sessionId, session);
  }
  return [...sessions.values()];
}

/** The measures a series has anything to draw for, in the order they are offered. */
export function measuresWithData(sessions: readonly ExerciseSession[]): ExerciseMeasure[] {
  return EXERCISE_MEASURES.filter((measure) =>
    sessions.some((session) => session[measure] !== null),
  );
}

// ---------- Running ----------

export type RunInput = {
  id: string;
  /** The run's day, frozen when it was saved. */
  date: string;
  environment: "outdoor" | "treadmill";
  metres: number;
  seconds: number;
};

export type RunPoint = RunInput & {
  /** Seconds per kilometre; none without distance. */ pace: number | null;
};

export type RunBucket = Slot & {
  metres: number;
  seconds: number;
  runs: number;
  /** The bucket's one run, where it holds exactly one, so a tap can open it. */
  runId: string | null;
};

export type RunningGraph = {
  buckets: RunBucket[];
  /** Every run in the range, oldest first, for pace. */
  points: RunPoint[];
  totals: { metres: number; seconds: number; runs: number };
};

const paceOf = (metres: number, seconds: number) =>
  metres > 0 && seconds > 0 ? round((seconds * 1000) / metres) : null;

export function runningGraph(
  runs: readonly RunInput[],
  range: GraphRange,
  today: string,
): RunningGraph {
  const buckets = rangeSlots(range, today).map((slot) => ({
    ...slot,
    metres: 0,
    seconds: 0,
    runs: 0,
    ids: [] as string[],
  }));
  const points: RunPoint[] = [];
  const totals = { metres: 0, seconds: 0, runs: 0 };
  for (const run of runs) {
    const bucket = buckets[slotIndex(range, run.date)];
    if (!bucket) continue;
    bucket.metres += run.metres;
    bucket.seconds += run.seconds;
    bucket.runs += 1;
    bucket.ids.push(run.id);
    totals.metres += run.metres;
    totals.seconds += run.seconds;
    totals.runs += 1;
    points.push({ ...run, pace: paceOf(run.metres, run.seconds) });
  }
  return {
    buckets: buckets.map(({ ids, ...bucket }) => ({
      ...bucket,
      runId: ids.length === 1 ? ids[0]! : null,
    })),
    points,
    totals,
  };
}

/**
 * The average pace of a set of runs: their time over their distance, so a long run counts for
 * as many kilometres as it covered. Runs without a distance are left out, not counted as zero.
 */
export function averagePace(
  points: readonly Pick<RunPoint, "metres" | "seconds">[],
): number | null {
  const timed = points.filter((point) => point.metres > 0 && point.seconds > 0);
  const metres = timed.reduce((sum, point) => sum + point.metres, 0);
  const seconds = timed.reduce((sum, point) => sum + point.seconds, 0);
  return paceOf(metres, seconds);
}

// ---------- Food ----------

/** One logged day: what its foods came to. */
export type FoodDayInput = { date: string; kcal: number; protein: number };

export type FoodBucket = Slot & {
  /** The bucket's average per logged day; none when nothing was logged. */
  kcal: number | null;
  kcalDays: number;
  protein: number | null;
  proteinDays: number;
  /** The last day in the bucket with anything logged, which a tap opens. */
  lastDay: string | null;
};

export type FoodGraph = {
  buckets: FoodBucket[];
  kcal: LoggedMean;
  protein: LoggedMean;
  /** Days the range has had so far, for "24 of 30 days logged". */
  days: number;
};

/**
 * A day counts toward an average once something on it adds up to more than zero; a day with
 * nothing logged is not a day of eating nothing (ADR 0042). A day logged in part still counts:
 * what it holds is what was recorded.
 */
export function foodGraph(
  days: readonly FoodDayInput[],
  range: GraphRange,
  today: string,
): FoodGraph {
  const buckets = rangeSlots(range, today).map((slot) => ({
    slot,
    kcal: [] as number[],
    protein: [] as number[],
    lastDay: null as string | null,
  }));
  const kcal: number[] = [];
  const protein: number[] = [];
  for (const day of days) {
    const bucket = buckets[slotIndex(range, day.date)];
    if (!bucket) continue;
    if (day.kcal > 0) {
      bucket.kcal.push(day.kcal);
      kcal.push(day.kcal);
    }
    if (day.protein > 0) {
      bucket.protein.push(day.protein);
      protein.push(day.protein);
    }
    if ((day.kcal > 0 || day.protein > 0) && (!bucket.lastDay || day.date > bucket.lastDay))
      bucket.lastDay = day.date;
  }
  return {
    buckets: buckets.map((bucket) => {
      const k = meanOf(bucket.kcal, 1);
      const p = meanOf(bucket.protein, 1);
      return {
        ...bucket.slot,
        kcal: k.mean,
        kcalDays: k.days,
        protein: p.mean,
        proteinDays: p.days,
        lastDay: bucket.lastDay,
      };
    }),
    kcal: meanOf(kcal, 1),
    protein: meanOf(protein, 1),
    days: daysSoFar(range, today),
  };
}

// ---------- Recovery ----------

/** What the check-in asks and Recovery draws. Energy is no longer asked, so it is not drawn. */
export const RECOVERY_MEASURES = ["sleepHours", "sleepQuality", "fatigue", "soreness"] as const;
export type RecoveryMeasure = (typeof RECOVERY_MEASURES)[number];

type MeasureValues = Record<RecoveryMeasure, number | null>;

/** A day's answers: each the mean of that day's readings that gave one. */
export type RecoveryDay = {
  date: string;
  values: MeasureValues;
  readings: number;
  /** The workouts the day's check-ins were given in. */
  sessionIds: string[];
};

/**
 * One value per measure per day. Two check-ins on one day (two workouts) are one day, not two:
 * otherwise a day trained twice would weigh twice in every average. A blank answer stays blank
 * and is left out of its day; zero hours of sleep is an answer, and is kept.
 */
export function recoveryDays(readings: readonly RecoveryReading[]): RecoveryDay[] {
  const days = new Map<string, { readings: RecoveryReading[] }>();
  for (const reading of readings) {
    const day = days.get(reading.date) ?? { readings: [] };
    day.readings.push(reading);
    days.set(reading.date, day);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      values: Object.fromEntries(
        RECOVERY_MEASURES.map((measure) => [
          measure,
          meanOf(
            day.readings.flatMap((reading) =>
              reading[measure] === null ? [] : [reading[measure]!],
            ),
          ).mean,
        ]),
      ) as MeasureValues,
      readings: day.readings.length,
      sessionIds: [
        ...new Set(
          day.readings.flatMap((reading) => (reading.sessionId ? [reading.sessionId] : [])),
        ),
      ],
    }));
}

export type RecoveryBucket = Slot & {
  /** Each measure's average over the bucket's days that gave one. */
  values: MeasureValues;
  days: Record<RecoveryMeasure, number>;
  readings: number;
  /** The bucket's one workout check-in, where it holds exactly one, so a tap can open it. */
  sessionId: string | null;
};

export type RecoveryGraph = {
  buckets: RecoveryBucket[];
  summary: Record<RecoveryMeasure, LoggedMean>;
  /** Check-ins in the range, every reading counted. */
  checkIns: number;
};

export function recoveryGraph(
  readings: readonly RecoveryReading[],
  range: GraphRange,
  today: string,
): RecoveryGraph {
  const inRange = readings.filter((reading) => slotIndex(range, reading.date) >= 0);
  const days = recoveryDays(inRange);
  const buckets = rangeSlots(range, today).map((slot) => ({
    slot,
    days: [] as RecoveryDay[],
  }));
  for (const day of days) buckets[slotIndex(range, day.date)]?.days.push(day);
  const measureMeans = (list: readonly RecoveryDay[]) =>
    Object.fromEntries(
      RECOVERY_MEASURES.map((measure) => [
        measure,
        meanOf(list.flatMap((day) => (day.values[measure] === null ? [] : [day.values[measure]!]))),
      ]),
    ) as Record<RecoveryMeasure, LoggedMean>;
  return {
    buckets: buckets.map(({ slot, days: held }) => {
      const means = measureMeans(held);
      const sessions = [...new Set(held.flatMap((day) => day.sessionIds))];
      return {
        ...slot,
        values: Object.fromEntries(
          RECOVERY_MEASURES.map((measure) => [measure, means[measure].mean]),
        ) as MeasureValues,
        days: Object.fromEntries(
          RECOVERY_MEASURES.map((measure) => [measure, means[measure].days]),
        ) as Record<RecoveryMeasure, number>,
        readings: held.reduce((sum, day) => sum + day.readings, 0),
        sessionId:
          sessions.length === 1 && held.reduce((sum, day) => sum + day.readings, 0) === 1
            ? sessions[0]!
            : null,
      };
    }),
    summary: measureMeans(days),
    checkIns: inRange.length,
  };
}

/** The earliest of some dates, for "All": where a graph's first record is. */
export function earliestOf(dates: Iterable<string>): string | null {
  let earliest: string | null = null;
  for (const date of dates) if (earliest === null || date < earliest) earliest = date;
  return earliest;
}
