import { and, asc, count, desc, eq, isNotNull, isNull, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  equipmentInstances,
  exercises,
  gyms,
  profiles,
  programDays,
  programExercises,
  setLogs,
  warmupProtocols,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { weightStepFor } from "@/domain/sets";
import type { LoadUnit, SetType, WarmupDrill } from "@/domain/types";
import {
  previousComparablePerformance,
  type ComparablePerformance,
} from "@/server/queries/comparable";

import { decideExerciseAtGym, resolvePlannedDay, type ExerciseDecision } from "./availability";
import { getGym } from "./gyms";

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

export class SessionFinishedError extends Error {
  constructor() {
    super("This session is already finished.");
    this.name = "SessionFinishedError";
  }
}

export class SessionHasSetsError extends Error {
  constructor() {
    super("This session has logged sets, so it cannot be discarded. Finish it instead.");
    this.name = "SessionHasSetsError";
  }
}

export type SessionSummary = {
  id: string;
  gymId: string;
  gymName: string;
  programDayId: string | null;
  dayName: string | null;
  cycleIndex: number | null;
  startedAt: Date;
  completedAt: Date | null;
  exerciseCount: number;
  setCount: number;
};

function summarySelection() {
  return {
    id: workoutSessions.id,
    gymId: workoutSessions.gymId,
    gymName: gyms.name,
    programDayId: workoutSessions.programDayId,
    dayName: programDays.name,
    cycleIndex: workoutSessions.cycleIndex,
    startedAt: workoutSessions.startedAt,
    completedAt: workoutSessions.completedAt,
    exerciseCount: sql<number>`(
      select count(*) from workout_exercises we where we.workout_session_id = workout_sessions.id
    )::int`,
    setCount: sql<number>`(
      select count(*) from set_logs sl
      join workout_exercises we on we.id = sl.workout_exercise_id
      where we.workout_session_id = workout_sessions.id
    )::int`,
  };
}

/** The one session started but not finished, if any. */
export async function getInProgressSession(
  db: DbOrTx,
  userId: string,
): Promise<SessionSummary | null> {
  const [row] = await db
    .select(summarySelection())
    .from(workoutSessions)
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .leftJoin(programDays, eq(programDays.id, workoutSessions.programDayId))
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.completedAt)))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);
  return row ?? null;
}

/** Finished sessions, newest first. */
export async function listSessions(
  db: DbOrTx,
  userId: string,
  limit = 50,
): Promise<SessionSummary[]> {
  return db
    .select(summarySelection())
    .from(workoutSessions)
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .leftJoin(programDays, eq(programDays.id, workoutSessions.programDayId))
    .where(and(eq(workoutSessions.userId, userId), isNotNull(workoutSessions.completedAt)))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit);
}

export type StartPlannedInput = {
  gymId: string;
  programDayId: string;
  cycleIndex: number;
};

/**
 * Starts a planned session: creates the session and one workout exercise per planned slot,
 * pre-resolved for the gym (direct machine, fallback, or left open for a decision).
 */
export async function startPlannedSession(
  db: DbOrTx,
  userId: string,
  input: StartPlannedInput,
): Promise<{ sessionId: string }> {
  const gym = await getGym(db, userId, input.gymId);
  if (!gym || !gym.isActive) throw new SessionNotFoundError();
  const [day] = await db
    .select({ id: programDays.id, programId: programDays.programId })
    .from(programDays)
    .where(and(eq(programDays.id, input.programDayId), eq(programDays.userId, userId)))
    .limit(1);
  if (!day) throw new SessionNotFoundError();

  const resolved = await resolvePlannedDay(db, userId, input.gymId, input.programDayId);
  if (!resolved) throw new SessionNotFoundError();

  const [session] = await db
    .insert(workoutSessions)
    .values({
      userId,
      programId: day.programId,
      programDayId: day.id,
      gymId: input.gymId,
      cycleIndex: input.cycleIndex,
    })
    .returning({ id: workoutSessions.id });
  if (!session) throw new Error("Session insert returned no row");

  if (resolved.length > 0) {
    await db.insert(workoutExercises).values(
      resolved.map((item, index) => {
        const r = item.decision.resolution;
        const substituted = r.status === "fallback";
        return {
          userId,
          workoutSessionId: session.id,
          exerciseId: substituted ? r.exercise.id : item.exercise.id,
          equipmentInstanceId:
            r.status === "direct" || r.status === "fallback"
              ? (r.equipmentInstance?.id ?? null)
              : null,
          plannedProgramExerciseId: item.programExerciseId,
          orderIndex: index + 1,
          substitutionReason: substituted
            ? `Fallback at ${gym.name}: ${item.exercise.name} → ${item.decision.resolvedExerciseName}`
            : null,
        };
      }),
    );
  }
  return { sessionId: session.id };
}

export async function startAdHocSession(
  db: DbOrTx,
  userId: string,
  input: { gymId: string },
): Promise<{ sessionId: string }> {
  const gym = await getGym(db, userId, input.gymId);
  if (!gym || !gym.isActive) throw new SessionNotFoundError();
  const [session] = await db
    .insert(workoutSessions)
    .values({ userId, gymId: input.gymId })
    .returning({ id: workoutSessions.id });
  if (!session) throw new Error("Session insert returned no row");
  return { sessionId: session.id };
}

export type SessionSet = {
  id: string;
  setIndex: number;
  setType: SetType;
  weight: number | null;
  unit: LoadUnit;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
  completedAt: Date;
};

export type SessionExercise = {
  id: string;
  orderIndex: number;
  exercise: {
    id: string;
    name: string;
    slug: string;
    modality: typeof exercises.$inferSelect.modality;
    loadPortability: typeof exercises.$inferSelect.loadPortability;
    requiresEquipment: boolean;
  };
  equipment: { id: string; name: string; unit: LoadUnit } | null;
  planned: {
    programExerciseId: string;
    plannedExerciseName: string;
    sets: number;
    prescriptionType: typeof programExercises.$inferSelect.prescriptionType;
    repMin: number | null;
    repMax: number | null;
    durationMinSeconds: number | null;
    durationMaxSeconds: number | null;
    perSide: boolean;
    rirMin: number | null;
    rirMax: number | null;
    restMinSeconds: number | null;
    restMaxSeconds: number | null;
    targetLoadNote: string | null;
    progressionNotes: string | null;
    keyCue: string | null;
    supersetGroup: string | null;
  } | null;
  substitutionReason: string | null;
  notes: string | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  weightStep: number;
  sets: SessionSet[];
  previous: ComparablePerformance | null;
  /** Present when the exercise still needs a machine choice at this gym. */
  decision: ExerciseDecision | null;
};

export type SessionDetail = {
  id: string;
  gym: { id: string; name: string; kind: typeof gyms.$inferSelect.kind };
  day: { id: string; name: string; focus: string | null; includesRun: boolean } | null;
  cycleIndex: number | null;
  startedAt: Date;
  completedAt: Date | null;
  bodyWeightKg: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  fatigue: number | null;
  soreness: number | null;
  backPainPre: number | null;
  shinLeftPre: number | null;
  shinRightPre: number | null;
  warmupCompleted: boolean;
  notes: string | null;
  warmup: { name: string; drills: WarmupDrill[] } | null;
  restTimerEnabled: boolean;
  exercises: SessionExercise[];
};

const UBIQUITOUS = new Set(["barbell", "dumbbell", "bodyweight", "mobility"]);

export async function getSessionDetail(
  db: DbOrTx,
  userId: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const [session] = await db
    .select({
      session: workoutSessions,
      gym: { id: gyms.id, name: gyms.name, kind: gyms.kind },
      day: {
        id: programDays.id,
        name: programDays.name,
        focus: programDays.focus,
        includesRun: programDays.includesRun,
        warmupProtocolId: programDays.warmupProtocolId,
      },
    })
    .from(workoutSessions)
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .leftJoin(programDays, eq(programDays.id, workoutSessions.programDayId))
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  if (!session) return null;

  const plannedExercise = alias(exercises, "planned_exercise");
  const rows = await db
    .select({
      we: workoutExercises,
      exercise: {
        id: exercises.id,
        name: exercises.name,
        slug: exercises.slug,
        modality: exercises.modality,
        loadPortability: exercises.loadPortability,
        requiresEquipment: exercises.requiresEquipment,
        defaultLoadIncrement: exercises.defaultLoadIncrement,
      },
      equipment: {
        id: equipmentInstances.id,
        name: equipmentInstances.name,
        unit: equipmentInstances.unit,
        loadIncrement: equipmentInstances.loadIncrement,
      },
      planned: programExercises,
      plannedExerciseName: plannedExercise.name,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(equipmentInstances, eq(equipmentInstances.id, workoutExercises.equipmentInstanceId))
    .leftJoin(programExercises, eq(programExercises.id, workoutExercises.plannedProgramExerciseId))
    .leftJoin(plannedExercise, eq(plannedExercise.id, programExercises.exerciseId))
    .where(eq(workoutExercises.workoutSessionId, sessionId))
    .orderBy(asc(workoutExercises.orderIndex));

  const setRows = rows.length
    ? await db
        .select({
          id: setLogs.id,
          workoutExerciseId: setLogs.workoutExerciseId,
          setIndex: setLogs.setIndex,
          setType: setLogs.setType,
          weight: setLogs.weight,
          unit: setLogs.unit,
          reps: setLogs.reps,
          rir: setLogs.rir,
          durationSeconds: setLogs.durationSeconds,
          completedAt: setLogs.completedAt,
        })
        .from(setLogs)
        .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
        .where(eq(workoutExercises.workoutSessionId, sessionId))
        .orderBy(asc(setLogs.setIndex))
    : [];

  const [profile] = await db
    .select({ restTimerEnabled: profiles.restTimerEnabled })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  const warmup = session.day?.warmupProtocolId
    ? ((
        await db
          .select({ name: warmupProtocols.name, drills: warmupProtocols.drills })
          .from(warmupProtocols)
          .where(eq(warmupProtocols.id, session.day.warmupProtocolId))
          .limit(1)
      )[0] ?? null)
    : null;

  const exerciseDetails: SessionExercise[] = [];
  for (const row of rows) {
    const previous = await previousComparablePerformance(db, {
      userId,
      exerciseId: row.exercise.id,
      loadPortability: row.exercise.loadPortability,
      equipmentInstanceId: row.equipment?.id ?? null,
      before: session.session.startedAt,
      excludeWorkoutExerciseId: row.we.id,
    });
    const needsMachine =
      row.exercise.requiresEquipment &&
      !row.equipment &&
      !(session.gym.kind === "gym" && UBIQUITOUS.has(row.exercise.modality));
    const decision =
      needsMachine && !row.we.skippedAt
        ? await decideExerciseAtGym(
            db,
            userId,
            session.gym.id,
            row.exercise.id,
            row.we.plannedProgramExerciseId,
          )
        : null;
    exerciseDetails.push({
      id: row.we.id,
      orderIndex: row.we.orderIndex,
      exercise: {
        id: row.exercise.id,
        name: row.exercise.name,
        slug: row.exercise.slug,
        modality: row.exercise.modality,
        loadPortability: row.exercise.loadPortability,
        requiresEquipment: row.exercise.requiresEquipment,
      },
      equipment: row.equipment?.id
        ? { id: row.equipment.id, name: row.equipment.name, unit: row.equipment.unit }
        : null,
      planned: row.planned
        ? {
            programExerciseId: row.planned.id,
            plannedExerciseName: row.plannedExerciseName ?? row.exercise.name,
            sets: row.planned.sets,
            prescriptionType: row.planned.prescriptionType,
            repMin: row.planned.repMin,
            repMax: row.planned.repMax,
            durationMinSeconds: row.planned.durationMinSeconds,
            durationMaxSeconds: row.planned.durationMaxSeconds,
            perSide: row.planned.perSide,
            rirMin: row.planned.rirMin,
            rirMax: row.planned.rirMax,
            restMinSeconds: row.planned.restMinSeconds,
            restMaxSeconds: row.planned.restMaxSeconds,
            targetLoadNote: row.planned.targetLoadNote,
            progressionNotes: row.planned.progressionNotes,
            keyCue: row.planned.keyCue,
            supersetGroup: row.planned.supersetGroup,
          }
        : null,
      substitutionReason: row.we.substitutionReason,
      notes: row.we.notes,
      completedAt: row.we.completedAt,
      skippedAt: row.we.skippedAt,
      weightStep: weightStepFor({
        equipmentLoadIncrement: row.equipment?.loadIncrement ?? null,
        exerciseDefaultIncrement: row.exercise.defaultLoadIncrement,
      }),
      sets: setRows
        .filter((s) => s.workoutExerciseId === row.we.id)
        .map(({ workoutExerciseId: _ignored, ...set }) => set),
      previous,
      decision,
    });
  }

  return {
    id: session.session.id,
    gym: session.gym,
    day: session.day?.id
      ? {
          id: session.day.id,
          name: session.day.name,
          focus: session.day.focus,
          includesRun: session.day.includesRun,
        }
      : null,
    cycleIndex: session.session.cycleIndex,
    startedAt: session.session.startedAt,
    completedAt: session.session.completedAt,
    bodyWeightKg: session.session.bodyWeightKg,
    sleepHours: session.session.sleepHours,
    sleepQuality: session.session.sleepQuality,
    energy: session.session.energy,
    fatigue: session.session.fatigue,
    soreness: session.session.soreness,
    backPainPre: session.session.backPainPre,
    shinLeftPre: session.session.shinLeftPre,
    shinRightPre: session.session.shinRightPre,
    warmupCompleted: session.session.warmupCompleted,
    notes: session.session.notes,
    warmup,
    restTimerEnabled: profile?.restTimerEnabled ?? false,
    exercises: exerciseDetails,
  };
}

async function requireOpenSession(db: DbOrTx, userId: string, sessionId: string) {
  const [row] = await db
    .select({ id: workoutSessions.id, completedAt: workoutSessions.completedAt })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  if (!row) throw new SessionNotFoundError();
  if (row.completedAt) throw new SessionFinishedError();
  return row;
}

async function sessionIdOfExercise(
  db: DbOrTx,
  userId: string,
  workoutExerciseId: string,
): Promise<string> {
  const [row] = await db
    .select({ sessionId: workoutExercises.workoutSessionId })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.id, workoutExerciseId), eq(workoutExercises.userId, userId)))
    .limit(1);
  if (!row) throw new SessionNotFoundError();
  return row.sessionId;
}

export type CheckInInput = {
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  fatigue: number | null;
  soreness: number | null;
  backPainPre: number | null;
  shinLeftPre: number | null;
  shinRightPre: number | null;
};

export async function saveCheckIn(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  input: CheckInInput,
): Promise<void> {
  await requireOpenSession(db, userId, sessionId);
  await db
    .update(workoutSessions)
    .set(input)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
}

export async function setWarmupCompleted(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  completed: boolean,
): Promise<void> {
  await requireOpenSession(db, userId, sessionId);
  await db
    .update(workoutSessions)
    .set({ warmupCompleted: completed })
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
}

export type LogSetInput = {
  workoutExerciseId: string;
  setIndex: number;
  setType: SetType;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
};

/** Creates or replaces one set. Raw values are stored exactly as entered. */
export async function logSet(db: DbOrTx, userId: string, input: LogSetInput): Promise<SessionSet> {
  const sessionId = await sessionIdOfExercise(db, userId, input.workoutExerciseId);
  await requireOpenSession(db, userId, sessionId);
  const [unitRow] = await db
    .select({ unit: equipmentInstances.unit })
    .from(workoutExercises)
    .leftJoin(equipmentInstances, eq(equipmentInstances.id, workoutExercises.equipmentInstanceId))
    .where(eq(workoutExercises.id, input.workoutExerciseId))
    .limit(1);
  const unit: LoadUnit = unitRow?.unit ?? "kg";
  const now = new Date();
  const [row] = await db
    .insert(setLogs)
    .values({
      userId,
      workoutExerciseId: input.workoutExerciseId,
      setIndex: input.setIndex,
      setType: input.setType,
      weight: input.weight,
      unit,
      reps: input.reps,
      rir: input.rir,
      durationSeconds: input.durationSeconds,
      completedAt: now,
    })
    .onConflictDoUpdate({
      target: [setLogs.workoutExerciseId, setLogs.setIndex],
      set: {
        setType: input.setType,
        weight: input.weight,
        unit,
        reps: input.reps,
        rir: input.rir,
        durationSeconds: input.durationSeconds,
        completedAt: now,
      },
    })
    .returning({
      id: setLogs.id,
      setIndex: setLogs.setIndex,
      setType: setLogs.setType,
      weight: setLogs.weight,
      unit: setLogs.unit,
      reps: setLogs.reps,
      rir: setLogs.rir,
      durationSeconds: setLogs.durationSeconds,
      completedAt: setLogs.completedAt,
    });
  if (!row) throw new Error("Set insert returned no row");
  return row;
}

export async function deleteSet(
  db: DbOrTx,
  userId: string,
  workoutExerciseId: string,
  setIndex: number,
): Promise<void> {
  const sessionId = await sessionIdOfExercise(db, userId, workoutExerciseId);
  await requireOpenSession(db, userId, sessionId);
  await db
    .delete(setLogs)
    .where(
      and(
        eq(setLogs.userId, userId),
        eq(setLogs.workoutExerciseId, workoutExerciseId),
        eq(setLogs.setIndex, setIndex),
      ),
    );
}

export async function setExerciseCompleted(
  db: DbOrTx,
  userId: string,
  workoutExerciseId: string,
  completed: boolean,
): Promise<void> {
  const sessionId = await sessionIdOfExercise(db, userId, workoutExerciseId);
  await requireOpenSession(db, userId, sessionId);
  await db
    .update(workoutExercises)
    .set({ completedAt: completed ? new Date() : null, skippedAt: null })
    .where(and(eq(workoutExercises.id, workoutExerciseId), eq(workoutExercises.userId, userId)));
}

export async function skipExercise(
  db: DbOrTx,
  userId: string,
  workoutExerciseId: string,
  reason: string | null,
): Promise<void> {
  const sessionId = await sessionIdOfExercise(db, userId, workoutExerciseId);
  await requireOpenSession(db, userId, sessionId);
  await db
    .update(workoutExercises)
    .set({ skippedAt: new Date(), completedAt: null, notes: reason })
    .where(and(eq(workoutExercises.id, workoutExerciseId), eq(workoutExercises.userId, userId)));
}

export class ExerciseHasSetsError extends Error {
  constructor() {
    super("Sets are already logged for this exercise. Delete them before changing the exercise.");
    this.name = "ExerciseHasSetsError";
  }
}

export type SubstituteInput = {
  workoutExerciseId: string;
  exerciseId: string;
  equipmentInstanceId: string | null;
  reason: string | null;
};

/** Swaps the exercise or machine of a slot that has no sets yet. */
export async function substituteExercise(
  db: DbOrTx,
  userId: string,
  input: SubstituteInput,
): Promise<void> {
  const sessionId = await sessionIdOfExercise(db, userId, input.workoutExerciseId);
  await requireOpenSession(db, userId, sessionId);
  const [existing] = await db
    .select({ n: count() })
    .from(setLogs)
    .where(eq(setLogs.workoutExerciseId, input.workoutExerciseId));
  if ((existing?.n ?? 0) > 0) throw new ExerciseHasSetsError();
  await db
    .update(workoutExercises)
    .set({
      exerciseId: input.exerciseId,
      equipmentInstanceId: input.equipmentInstanceId,
      substitutionReason: input.reason,
      skippedAt: null,
      completedAt: null,
    })
    .where(
      and(eq(workoutExercises.id, input.workoutExerciseId), eq(workoutExercises.userId, userId)),
    );
}

export async function addExerciseToSession(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  input: { exerciseId: string; equipmentInstanceId: string | null },
): Promise<{ workoutExerciseId: string }> {
  await requireOpenSession(db, userId, sessionId);
  const [last] = await db
    .select({ maxOrder: max(workoutExercises.orderIndex) })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutSessionId, sessionId));
  const [row] = await db
    .insert(workoutExercises)
    .values({
      userId,
      workoutSessionId: sessionId,
      exerciseId: input.exerciseId,
      equipmentInstanceId: input.equipmentInstanceId,
      orderIndex: (last?.maxOrder ?? 0) + 1,
    })
    .returning({ id: workoutExercises.id });
  if (!row) throw new Error("Workout exercise insert returned no row");
  return { workoutExerciseId: row.id };
}

export type FinishInput = { notes: string | null; bodyWeightKg: number | null };

export type FinishedSession = {
  id: string;
  programId: string | null;
  programDayId: string | null;
  dayIndex: number | null;
  cycleIndex: number | null;
};

export async function finishSession(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  input: FinishInput,
): Promise<FinishedSession> {
  await requireOpenSession(db, userId, sessionId);
  const [row] = await db
    .update(workoutSessions)
    .set({ completedAt: new Date(), notes: input.notes, bodyWeightKg: input.bodyWeightKg })
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .returning({
      id: workoutSessions.id,
      programId: workoutSessions.programId,
      programDayId: workoutSessions.programDayId,
      cycleIndex: workoutSessions.cycleIndex,
    });
  if (!row) throw new SessionNotFoundError();
  let dayIndex: number | null = null;
  if (row.programDayId) {
    const [day] = await db
      .select({ dayIndex: programDays.dayIndex })
      .from(programDays)
      .where(eq(programDays.id, row.programDayId))
      .limit(1);
    dayIndex = day?.dayIndex ?? null;
  }
  return { ...row, dayIndex };
}

/** Deletes a session that has no sets. */
export async function discardSession(db: DbOrTx, userId: string, sessionId: string): Promise<void> {
  await requireOpenSession(db, userId, sessionId);
  const [sets] = await db
    .select({ n: count() })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
    .where(eq(workoutExercises.workoutSessionId, sessionId));
  if ((sets?.n ?? 0) > 0) throw new SessionHasSetsError();
  await db
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
}
