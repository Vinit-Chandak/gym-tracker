import { and, asc, eq, gte, isNotNull, lt, lte, ne, sql } from "drizzle-orm";

import {
  equipmentInstances,
  exercises,
  foodEntries,
  gyms,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ExerciseSetRow, FoodDayInput, StrengthRow } from "@/domain/progress-graphs";
import {
  LOAD_UNITS,
  type ExerciseModality,
  type LoadUnit,
  type PrescriptionType,
} from "@/domain/types";
import type { DateRange } from "@/server/validation/date-range";

/**
 * What Progress's graphs read (ADR 0042): counts and bests per workout rather than every
 * workout, slot and set, so a graph over every year of an account costs a few thousand small
 * rows and never stops at a sample.
 */

/** A workout's day in the account's time zone, as `YYYY-MM-DD`. */
const workoutDay = (timeZone: string) =>
  sql<string>`to_char(${workoutSessions.startedAt} at time zone ${timeZone}, 'YYYY-MM-DD')`;

/** Finished workouts' working sets of one account inside a window. */
const workingSetsOf = (userId: string, window: Pick<DateRange, "start" | "end"> | null) =>
  and(
    eq(workoutSessions.userId, userId),
    eq(workoutExercises.userId, userId),
    eq(setLogs.userId, userId),
    isNotNull(workoutSessions.completedAt),
    ne(setLogs.setType, "warmup"),
    window ? gte(workoutSessions.startedAt, window.start) : undefined,
    window ? lt(workoutSessions.startedAt, window.end) : undefined,
  );

/** Each exercise of each finished workout in the window: its working sets and its muscles. */
export async function readStrengthRows(
  db: DbOrTx,
  userId: string,
  timeZone: string,
  window: DateRange,
): Promise<StrengthRow[]> {
  const rows = await db
    .select({
      sessionId: workoutSessions.id,
      date: workoutDay(timeZone),
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      workingSets: sql<number>`count(*)::int`,
    })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(workingSetsOf(userId, window))
    // Both keys are primary keys: the day and the muscles follow from them.
    .groupBy(workoutSessions.id, exercises.id)
    .orderBy(asc(workoutSessions.startedAt));
  return rows.map((row) => ({
    ...row,
    secondaryMuscles: row.secondaryMuscles ?? [],
    workingSets: Number(row.workingSets),
  }));
}

/**
 * One exercise's loads on one machine in one unit: a series. A movement whose load means the
 * same everywhere is one series across gyms; one bound to its machine is a series per machine,
 * and a machine nobody recorded is a series of its own session only, because nothing says the
 * next one was the same machine. The id is the one `performanceSeries` gave, so a link made
 * before still names its series.
 */
export type ExerciseSeriesOption = {
  id: string;
  exerciseId: string;
  name: string;
  machine: string;
  unit: LoadUnit;
  modality: ExerciseModality;
  /** Counted in reps, seconds or metres. */
  measure: PrescriptionType;
  /** Finished workouts it was in inside the window being drawn, and ever. */
  sessionsInRange: number;
  sessions: number;
  lastAt: string;
};

const MACHINE_KEY = sql<string>`case when ${exercises.loadPortability} = 'global' then 'global' else coalesce(${workoutExercises.equipmentInstanceId}::text, 'unknown:' || ${workoutExercises.id}::text) end`;

/**
 * Every series ever logged, whatever the window: the picker does not change with the span. An
 * exercise's own page asks for its own series only.
 */
export async function readExerciseSeriesOptions(
  db: DbOrTx,
  userId: string,
  window: DateRange,
  exerciseId?: string,
): Promise<ExerciseSeriesOption[]> {
  const rows = await db
    .select({
      exerciseId: workoutExercises.exerciseId,
      name: exercises.name,
      modality: exercises.modality,
      measure: exercises.defaultPrescriptionType,
      machineKey: MACHINE_KEY,
      unit: setLogs.unit,
      machineName: sql<string | null>`max(${equipmentInstances.name})`,
      gymName: sql<string | null>`max(${gyms.name})`,
      sessionsInRange: sql<number>`count(distinct ${workoutSessions.id}) filter (where ${workoutSessions.startedAt} >= ${window.start} and ${workoutSessions.startedAt} < ${window.end})::int`,
      sessions: sql<number>`count(distinct ${workoutSessions.id})::int`,
      lastAt: sql<string>`max(${workoutSessions.startedAt})`,
    })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(equipmentInstances, eq(equipmentInstances.id, workoutExercises.equipmentInstanceId))
    .leftJoin(
      gyms,
      eq(gyms.id, sql`coalesce(${equipmentInstances.gymId}, ${workoutSessions.gymId})`),
    )
    .where(
      and(
        workingSetsOf(userId, null),
        exerciseId ? eq(workoutExercises.exerciseId, exerciseId) : undefined,
      ),
    )
    .groupBy(
      workoutExercises.exerciseId,
      exercises.name,
      exercises.modality,
      exercises.defaultPrescriptionType,
      MACHINE_KEY,
      setLogs.unit,
    );
  return rows
    .map((row) => ({
      id: `${row.exerciseId}:${row.machineKey}:${row.unit}`,
      exerciseId: row.exerciseId,
      name: row.name,
      machine:
        row.machineKey === "global"
          ? "Across gyms"
          : `${
              row.machineKey.startsWith("unknown:")
                ? "Unrecorded machine (this session only)"
                : (row.machineName ?? "Machine")
            }${row.gymName ? ` · ${row.gymName}` : ""}`,
      unit: row.unit,
      modality: row.modality,
      measure: row.measure,
      sessionsInRange: Number(row.sessionsInRange),
      sessions: Number(row.sessions),
      lastAt: new Date(row.lastAt).toISOString(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || b.sessions - a.sessions);
}

/** A lift an estimated 1RM can be drawn for: free weights, counted in reps, in kg or lb. */
const isLift = (option: ExerciseSeriesOption) =>
  option.measure === "reps" &&
  (option.modality === "barbell" || option.modality === "dumbbell") &&
  (option.unit === "kg" || option.unit === "lb");

/**
 * The series a graph opens on: the one the URL names, else, of what was done in the span, the
 * free-weight lift done most often (the trend most worth opening on: a carry or a plank is
 * done as often and says less), else whatever was done most often, else the one done last.
 */
export function pickSeries(
  options: readonly ExerciseSeriesOption[],
  wanted: string | undefined,
): ExerciseSeriesOption | null {
  return (
    options.find((option) => option.id === wanted) ??
    [...options].sort(
      (a, b) =>
        Number(b.sessionsInRange > 0) - Number(a.sessionsInRange > 0) ||
        Number(isLift(b)) - Number(isLift(a)) ||
        b.sessionsInRange - a.sessionsInRange ||
        b.lastAt.localeCompare(a.lastAt),
    )[0] ??
    null
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A series id taken apart: `exercise:machine:unit`, the machine itself possibly `unknown:slot`. */
export function parseSeriesId(
  id: string,
): { exerciseId: string; machineKey: string; unit: LoadUnit } | null {
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const exerciseId = parts[0]!;
  const unit = parts.at(-1)!;
  const machineKey = parts.slice(1, -1).join(":");
  const machineOk =
    machineKey === "global" ||
    UUID.test(machineKey) ||
    (machineKey.startsWith("unknown:") && UUID.test(machineKey.slice(8)));
  return UUID.test(exerciseId) && machineOk && (LOAD_UNITS as readonly string[]).includes(unit)
    ? { exerciseId, machineKey, unit: unit as LoadUnit }
    : null;
}

/** The working sets of one series inside the window, oldest workout first. */
export async function readExerciseSetRows(
  db: DbOrTx,
  userId: string,
  timeZone: string,
  window: DateRange,
  seriesId: string,
): Promise<ExerciseSetRow[]> {
  const key = parseSeriesId(seriesId);
  if (!key) return [];
  const machine =
    key.machineKey === "global"
      ? undefined
      : key.machineKey.startsWith("unknown:")
        ? eq(workoutExercises.id, key.machineKey.slice(8))
        : eq(workoutExercises.equipmentInstanceId, key.machineKey);
  const rows = await db
    .select({
      sessionId: workoutSessions.id,
      date: workoutDay(timeZone),
      weight: setLogs.weight,
      reps: setLogs.reps,
      durationSeconds: setLogs.durationSeconds,
      distanceMeters: setLogs.distanceMeters,
    })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .where(
      and(
        workingSetsOf(userId, window),
        eq(workoutExercises.exerciseId, key.exerciseId),
        eq(setLogs.unit, key.unit),
        machine,
      ),
    )
    .orderBy(asc(workoutSessions.startedAt), asc(workoutSessions.id), asc(setLogs.setIndex));
  return rows.map((row) => ({
    ...row,
    weight: row.weight === null ? null : Number(row.weight),
    distanceMeters: row.distanceMeters === null ? null : Number(row.distanceMeters),
  }));
}

/**
 * What each logged day came to, in kcal and in grams of protein, the way the Food tab adds a
 * day up: each entry scaled to its amount and rounded to the tenth, a protein nobody recorded
 * counted as none. Days with nothing logged are absent, never zero.
 */
export async function readFoodDayTotals(
  db: DbOrTx,
  userId: string,
  window: Pick<DateRange, "from" | "to">,
): Promise<FoodDayInput[]> {
  const rows = await db
    .select({
      date: foodEntries.eatenOn,
      kcal: sql<number>`sum(round(${foodEntries.kcal} * ${foodEntries.amount} / ${foodEntries.portionAmount}, 1))::float8`,
      protein: sql<number>`sum(round(coalesce(${foodEntries.proteinG}, 0) * ${foodEntries.amount} / ${foodEntries.portionAmount}, 1))::float8`,
    })
    .from(foodEntries)
    .where(
      and(
        eq(foodEntries.userId, userId),
        gte(foodEntries.eatenOn, window.from),
        lte(foodEntries.eatenOn, window.to),
      ),
    )
    .groupBy(foodEntries.eatenOn)
    .orderBy(asc(foodEntries.eatenOn));
  return rows.map((row) => ({
    date: row.date,
    kcal: Math.round(Number(row.kcal) * 10) / 10,
    protein: Math.round(Number(row.protein) * 10) / 10,
  }));
}
