import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  equipmentInstances,
  exercises,
  gyms,
  profiles,
  programDays,
  programExercises,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ProgressionSuggestion } from "@/domain/progression";
import { planTargets } from "@/domain/session-plan";
import {
  hasCheckIn,
  recoveryWarnings,
  type CheckIn,
  type RecoveryWarning,
} from "@/domain/recovery";
import type { LoadUnit, SetType, WarmupDrill } from "@/domain/types";
import { sessionHistories, type ComparablePerformance } from "@/server/queries/comparable";
import { getWarmupProtocol } from "@/server/queries/reference";

import { decideExercisesAtGym, resolvePlannedDay, type ExerciseDecision } from "./availability";
import { getGym } from "./gyms";
import { consumePlan, planForSession, releasePlan } from "./coach-plans";
import { applyRule } from "./progression-rule";

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

export class SetConflictError extends Error {
  constructor() {
    super(
      "This set changed on another device. Reopen the session, review the saved values, then retry.",
    );
    this.name = "SetConflictError";
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
  const [gym, [day]] = await Promise.all([
    getGym(db, userId, input.gymId),
    db
      .select({
        id: programDays.id,
        programId: programDays.programId,
        dayIndex: programDays.dayIndex,
      })
      .from(programDays)
      .where(and(eq(programDays.id, input.programDayId), eq(programDays.userId, userId)))
      .limit(1),
  ]);
  if (!gym || !gym.isActive) throw new SessionNotFoundError();
  if (!day) throw new SessionNotFoundError();

  // Resolving the day's machines and creating the session row need only what is known by now,
  // so they go out together; a resolution failure rolls the row back with the transaction.
  const [resolved, [session]] = await Promise.all([
    resolvePlannedDay(db, userId, input.gymId, input.programDayId, {
      id: gym.id,
      kind: gym.kind,
      name: gym.name,
    }),
    db
      .insert(workoutSessions)
      .values({
        userId,
        programId: day.programId,
        programDayId: day.id,
        gymId: input.gymId,
        cycleIndex: input.cycleIndex,
      })
      .returning({ id: workoutSessions.id }),
  ]);
  if (!resolved) throw new SessionNotFoundError();
  if (!session) throw new Error("Session insert returned no row");

  // The coach's plan for this slot, if it was made for this gym. From here the session owns
  // what the plan said: a substitution or a drop is written into the session's own rows.
  const plan = await consumePlan(db, userId, {
    programId: day.programId,
    ref: { cycleIndex: input.cycleIndex, dayIndex: day.dayIndex },
    gymId: input.gymId,
    sessionId: session.id,
  });
  const now = new Date();
  const values: (typeof workoutExercises.$inferInsert)[] = [];
  for (const item of resolved) {
    const r = item.decision.resolution;
    const substituted = r.status === "fallback";
    const entry = plan?.exercises.find((e) => e.slotId === item.programExerciseId) ?? null;
    const base = {
      userId,
      workoutSessionId: session.id,
      plannedProgramExerciseId: item.programExerciseId,
      orderIndex: values.length + 1,
      // The session takes its own copy of the plan's grouping. From here it is the
      // session's to change, and the programme template is never written back.
      supersetGroup: entry?.supersetGroup ?? item.supersetGroup,
    };
    if (entry?.action === "drop") {
      values.push({
        ...base,
        exerciseId: item.exercise.id,
        equipmentInstanceId: null,
        supersetGroup: null,
        skippedAt: now,
        notes: entry.note || "Left out by the coach's plan",
      });
      continue;
    }
    if (entry?.action === "substitute" && entry.exerciseId) {
      values.push({
        ...base,
        exerciseId: entry.exerciseId,
        equipmentInstanceId: entry.equipmentInstanceId,
        substitutionReason: `Coach plan: ${item.exercise.name} → ${entry.exerciseName}`,
      });
      continue;
    }
    values.push({
      ...base,
      exerciseId: substituted ? r.exercise.id : item.exercise.id,
      // A machine the plan names wins; otherwise the gym's own resolution.
      equipmentInstanceId:
        entry?.equipmentInstanceId ??
        (r.status === "direct" || r.status === "fallback"
          ? (r.equipmentInstance?.id ?? null)
          : null),
      substitutionReason: substituted
        ? `Fallback at ${gym.name}: ${item.exercise.name} → ${item.decision.resolvedExerciseName}`
        : null,
    });
  }
  for (const entry of plan?.exercises ?? []) {
    if (entry.slotId !== null || entry.action === "drop" || !entry.exerciseId) continue;
    values.push({
      userId,
      workoutSessionId: session.id,
      exerciseId: entry.exerciseId,
      equipmentInstanceId: entry.equipmentInstanceId,
      plannedProgramExerciseId: null,
      orderIndex: values.length + 1,
      supersetGroup: entry.supersetGroup,
      substitutionReason: "Added by the coach's plan",
    });
  }
  if (values.length > 0) await db.insert(workoutExercises).values(values);
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
  } | null;
  /** This workout's superset grouping. Seeded from the plan, then owned by the session. */
  supersetGroup: string | null;
  substitutionReason: string | null;
  notes: string | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  weightStep: number;
  sets: SessionSet[];
  previous: ComparablePerformance | null;
  /** The performance the suggestion was computed from (same slot first; a different machine only as a starting guess). */
  basis: ComparablePerformance | null;
  /** What the progression rule says to do next; null when nothing can be prescribed. */
  suggestion: ProgressionSuggestion | null;
  /** Sessions in a row below the one before, on the basis history. */
  regressionStreak: number;
  /** Present when the exercise still needs a machine choice at this gym. */
  decision: ExerciseDecision | null;
  /** The coach plan's line for this exercise, when the session started from one. */
  coachNote: string | null;
  /** Rest the coach asked for, in place of the programme's target. */
  coachRestSeconds: number | null;
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
  /** Recovery advice derived from the check-in; never changes a suggestion. */
  warnings: RecoveryWarning[];
  /** The coach plan this session started from, if any. */
  coachPlan: { summary: string; warmup: string[]; generatedAt: string } | null;
  exercises: SessionExercise[];
};

const UBIQUITOUS = new Set(["barbell", "dumbbell", "bodyweight", "mobility"]);

/** Small read for check-in and pickers; never loads progression or previous workouts. */
export async function getSessionRecord(db: DbOrTx, userId: string, sessionId: string) {
  const [row] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getSessionDetail(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  options: { includeGuidance?: boolean } = {},
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

  const includeGuidance = options.includeGuidance !== false;
  const checkIn: CheckIn = {
    sleepHours: session.session.sleepHours,
    sleepQuality: session.session.sleepQuality,
    energy: session.session.energy,
    fatigue: session.session.fatigue,
    soreness: session.session.soreness,
    backPainPre: session.session.backPainPre,
    shinLeftPre: session.session.shinLeftPre,
    shinRightPre: session.session.shinRightPre,
  };
  const wantsWarnings = includeGuidance && hasCheckIn(checkIn);

  // Everything keyed by the session alone, in one round trip: the slots, their sets, the
  // rest-timer preference, the warm-up (from memory) and the previous check-in.
  const plannedExercise = alias(exercises, "planned_exercise");
  const [rows, setRows, [profile], warmup, previousCheck, coachPlan] = await Promise.all([
    db
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
          defaultRepMin: exercises.defaultRepMin,
          defaultRepMax: exercises.defaultRepMax,
          defaultRir: exercises.defaultRir,
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
      .leftJoin(
        programExercises,
        eq(programExercises.id, workoutExercises.plannedProgramExerciseId),
      )
      .leftJoin(plannedExercise, eq(plannedExercise.id, programExercises.exerciseId))
      .where(eq(workoutExercises.workoutSessionId, sessionId))
      .orderBy(asc(workoutExercises.orderIndex)),
    db
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
      .orderBy(asc(setLogs.setIndex)),
    db
      .select({ restTimerEnabled: profiles.restTimerEnabled })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    session.day?.warmupProtocolId
      ? getWarmupProtocol(db, session.day.warmupProtocolId)
      : Promise.resolve(null),
    wantsWarnings
      ? previousCheckIn(db, userId, session.session.startedAt, session.session.id)
      : Promise.resolve(null),
    includeGuidance ? planForSession(db, sessionId) : Promise.resolve(null),
  ]);
  // Plan entries by the slot they were written for; entries without a slot are the plan's
  // additions and are matched to the session's extra rows by exercise, in order.
  const planBySlot = new Map(
    (coachPlan?.exercises ?? []).filter((e) => e.slotId).map((e) => [e.slotId!, e]),
  );
  const planAdditions = (coachPlan?.exercises ?? []).filter((e) => e.slotId === null);

  const unresolved = includeGuidance
    ? rows.filter(
        (row) =>
          row.exercise.requiresEquipment &&
          !row.equipment &&
          !row.we.skippedAt &&
          !(session.gym.kind === "gym" && UBIQUITOUS.has(row.exercise.modality)),
      )
    : [];
  // History and machine decisions depend on the slots but not on each other.
  const [histories, decisions] = await Promise.all([
    includeGuidance
      ? sessionHistories(
          db,
          rows.map((row) => ({
            userId,
            exerciseId: row.exercise.id,
            loadPortability: row.exercise.loadPortability,
            equipmentInstanceId: row.equipment?.id ?? null,
            before: session.session.startedAt,
            excludeWorkoutExerciseId: row.we.id,
          })),
        )
      : Promise.resolve([]),
    decideExercisesAtGym(
      db,
      userId,
      session.gym.id,
      unresolved.map((row) => ({
        id: row.we.id,
        exercise: row.exercise,
        programExerciseId: row.we.plannedProgramExerciseId,
      })),
      session.gym,
    ),
  ]);
  const exerciseDetails: SessionExercise[] = [];
  for (const [index, row] of rows.entries()) {
    const rule = applyRule({
      planned: row.planned,
      exercise: row.exercise,
      equipment: row.equipment?.id ? row.equipment : null,
      slotLineageId: row.planned?.lineageId ?? null,
      history: histories[index]?.history ?? [],
      elsewhere: histories[index]?.elsewhere ?? null,
    });
    const { weightStep, previous, basisPerformance } = rule;
    const decision = decisions.get(row.we.id) ?? null;
    const entryIndex = row.we.plannedProgramExerciseId
      ? -1
      : planAdditions.findIndex((e) => e.exerciseId === row.exercise.id);
    const entry = row.we.plannedProgramExerciseId
      ? (planBySlot.get(row.we.plannedProgramExerciseId) ?? null)
      : entryIndex >= 0
        ? planAdditions.splice(entryIndex, 1)[0]!
        : null;
    // The coach's targets replace the rule's prefill; the rule's basis and history stay
    // visible, so the athlete can still see what the numbers were judged against.
    const suggestion: ProgressionSuggestion | null =
      entry && entry.action !== "drop" && entry.sets.length > 0
        ? {
            kind: "coach",
            basis: rule.basis,
            reason: entry.note || "Coach plan for today",
            advice: null,
            loadIncrement: weightStep,
            sets: planTargets(entry),
          }
        : rule.suggestion;
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
          }
        : null,
      supersetGroup: row.we.supersetGroup,
      substitutionReason: row.we.substitutionReason,
      notes: row.we.notes,
      completedAt: row.we.completedAt,
      skippedAt: row.we.skippedAt,
      weightStep,
      sets: setRows
        .filter((s) => s.workoutExerciseId === row.we.id)
        .map(({ workoutExerciseId: _ignored, ...set }) => set),
      previous,
      basis: basisPerformance,
      suggestion,
      regressionStreak: rule.regressionStreak,
      decision,
      coachNote: entry?.note || null,
      coachRestSeconds: entry?.restSeconds ?? null,
    });
  }

  const warnings = wantsWarnings ? recoveryWarnings(checkIn, previousCheck) : [];

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
    warnings,
    coachPlan: coachPlan
      ? {
          summary: coachPlan.summary,
          warmup: coachPlan.warmup,
          generatedAt: coachPlan.generatedAt.toISOString(),
        }
      : null,
    exercises: exerciseDetails,
  };
}

/** The last session before this one that recorded any check-in value. */
async function previousCheckIn(
  db: DbOrTx,
  userId: string,
  before: Date,
  excludeSessionId: string,
): Promise<CheckIn | null> {
  const [row] = await db
    .select({
      sleepHours: workoutSessions.sleepHours,
      sleepQuality: workoutSessions.sleepQuality,
      energy: workoutSessions.energy,
      fatigue: workoutSessions.fatigue,
      soreness: workoutSessions.soreness,
      backPainPre: workoutSessions.backPainPre,
      shinLeftPre: workoutSessions.shinLeftPre,
      shinRightPre: workoutSessions.shinRightPre,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        lt(workoutSessions.startedAt, before),
        ne(workoutSessions.id, excludeSessionId),
        or(
          isNotNull(workoutSessions.sleepHours),
          isNotNull(workoutSessions.backPainPre),
          isNotNull(workoutSessions.shinLeftPre),
          isNotNull(workoutSessions.shinRightPre),
        ),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);
  return row ?? null;
}

async function requireOpenSession(db: DbOrTx, userId: string, sessionId: string) {
  const [row] = await db
    .select({ id: workoutSessions.id, completedAt: workoutSessions.completedAt })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1)
    .for("update");
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
  expectedCompletedAt?: string | null;
  expectedExerciseId?: string;
  expectedEquipmentInstanceId?: string | null;
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
  const [sessionRow] = await db
    .select({ completedAt: workoutSessions.completedAt })
    .from(workoutExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .where(
      and(
        eq(workoutExercises.id, input.workoutExerciseId),
        eq(workoutExercises.userId, userId),
        eq(workoutSessions.userId, userId),
      ),
    )
    .limit(1)
    .for("update", { of: workoutSessions });
  if (!sessionRow) throw new SessionNotFoundError();
  if (sessionRow.completedAt) throw new SessionFinishedError();
  // Read identity and set values after the lock, including changes committed while we waited.
  const [unitRow] = await db
    .select({
      unit: equipmentInstances.unit,
      exerciseId: workoutExercises.exerciseId,
      equipmentInstanceId: workoutExercises.equipmentInstanceId,
      existing: setLogs,
    })
    .from(workoutExercises)
    .leftJoin(equipmentInstances, eq(equipmentInstances.id, workoutExercises.equipmentInstanceId))
    .leftJoin(
      setLogs,
      and(eq(setLogs.workoutExerciseId, workoutExercises.id), eq(setLogs.setIndex, input.setIndex)),
    )
    .where(
      and(eq(workoutExercises.id, input.workoutExerciseId), eq(workoutExercises.userId, userId)),
    )
    .limit(1);
  if (!unitRow) throw new SessionNotFoundError();
  if (
    (input.expectedExerciseId !== undefined && input.expectedExerciseId !== unitRow.exerciseId) ||
    (input.expectedEquipmentInstanceId !== undefined &&
      input.expectedEquipmentInstanceId !== unitRow.equipmentInstanceId)
  )
    throw new SetConflictError();
  const previous = unitRow.existing;
  if (
    input.expectedCompletedAt !== undefined &&
    (previous?.completedAt.toISOString() ?? null) !== input.expectedCompletedAt
  ) {
    if (
      previous &&
      previous.setType === input.setType &&
      previous.weight === input.weight &&
      previous.reps === input.reps &&
      previous.rir === input.rir &&
      previous.durationSeconds === input.durationSeconds
    )
      return previous;
    throw new SetConflictError();
  }
  const unit: LoadUnit = unitRow.unit ?? "kg";
  const now = new Date(Math.max(Date.now(), (previous?.completedAt.getTime() ?? 0) + 1));
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

export class SupersetGroupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupersetGroupError";
  }
}

const SUPERSET_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** This workout's exercises with their grouping, in the order they are performed. */
async function sessionGroupRows(db: DbOrTx, userId: string, sessionId: string) {
  return db
    .select({ id: workoutExercises.id, supersetGroup: workoutExercises.supersetGroup })
    .from(workoutExercises)
    .where(
      and(eq(workoutExercises.workoutSessionId, sessionId), eq(workoutExercises.userId, userId)),
    )
    .orderBy(asc(workoutExercises.orderIndex));
}

/**
 * A superset needs at least two exercises, so a group left with one member is no longer a
 * group. This runs after every change rather than being checked at each call site, which
 * keeps "at most one group per exercise, at least two exercises per group" true by
 * construction — including after a member is skipped, substituted or removed.
 */
async function pruneLoneSupersets(db: DbOrTx, userId: string, sessionId: string): Promise<void> {
  const rows = await sessionGroupRows(db, userId, sessionId);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.supersetGroup) counts.set(row.supersetGroup, (counts.get(row.supersetGroup) ?? 0) + 1);
  }
  const lonely = [...counts].filter(([, n]) => n < 2).map(([group]) => group);
  if (lonely.length === 0) return;
  await db
    .update(workoutExercises)
    .set({ supersetGroup: null })
    .where(
      and(
        eq(workoutExercises.workoutSessionId, sessionId),
        eq(workoutExercises.userId, userId),
        inArray(workoutExercises.supersetGroup, lonely),
      ),
    );
}

export type SupersetInput = {
  sessionId: string;
  /** An existing group to edit, or null to create one. */
  group: string | null;
  workoutExerciseIds: string[];
};

/**
 * Creates or edits one superset for this workout only.
 *
 * The exercises and their sets are untouched: this writes a label on the workout's own
 * rows and never on `program_exercises`, so a grouping change here cannot alter the
 * programme or any other session. Membership is replaced wholesale, so sending the same
 * request twice leaves exactly one group rather than two.
 */
export async function saveSupersetGroup(
  db: DbOrTx,
  userId: string,
  input: SupersetInput,
): Promise<{ group: string }> {
  // Locks the session, so two requests arriving together cannot each mint a new label.
  await requireOpenSession(db, userId, input.sessionId);
  const rows = await sessionGroupRows(db, userId, input.sessionId);
  const inWorkout = new Set(rows.map((row) => row.id));
  const members = [...new Set(input.workoutExerciseIds)];
  if (members.length < 2) throw new SupersetGroupError("A superset needs at least two exercises.");
  if (members.some((id) => !inWorkout.has(id)))
    throw new SupersetGroupError("Those exercises are not all in this workout.");

  const existing = new Set(
    rows.map((row) => row.supersetGroup).filter((group): group is string => group !== null),
  );
  let group = input.group;
  if (group === null) {
    const letter = [...SUPERSET_LETTERS].find((l) => !existing.has(`Superset ${l}`));
    if (!letter)
      throw new SupersetGroupError("This workout already has as many supersets as it can hold.");
    group = `Superset ${letter}`;
  } else if (!existing.has(group)) {
    throw new SupersetGroupError("That superset is no longer part of this workout.");
  }

  // Everyone currently in the group leaves it, then the chosen members join. An exercise
  // named here also leaves whichever other group it was in: a row holds one label.
  await db
    .update(workoutExercises)
    .set({ supersetGroup: null })
    .where(
      and(
        eq(workoutExercises.workoutSessionId, input.sessionId),
        eq(workoutExercises.userId, userId),
        eq(workoutExercises.supersetGroup, group),
      ),
    );
  await db
    .update(workoutExercises)
    .set({ supersetGroup: group })
    .where(
      and(
        eq(workoutExercises.workoutSessionId, input.sessionId),
        eq(workoutExercises.userId, userId),
        inArray(workoutExercises.id, members),
      ),
    );
  await pruneLoneSupersets(db, userId, input.sessionId);
  return { group };
}

/** Drops a superset. Membership goes; the exercises and every logged set stay. */
export async function removeSupersetGroup(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  group: string,
): Promise<void> {
  await requireOpenSession(db, userId, sessionId);
  await db
    .update(workoutExercises)
    .set({ supersetGroup: null })
    .where(
      and(
        eq(workoutExercises.workoutSessionId, sessionId),
        eq(workoutExercises.userId, userId),
        eq(workoutExercises.supersetGroup, group),
      ),
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
      // The day's position in the cycle, fetched with the update rather than after it.
      // Plain SQL on purpose: the updated row is addressed by its table name here.
      dayIndex: sql<number | null>`(
        select d.day_index from program_days d where d.id = workout_sessions.program_day_id
      )`,
    });
  if (!row) throw new SessionNotFoundError();
  return { ...row, dayIndex: row.dayIndex ?? null };
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
  // An empty session gives its plan back, so starting again at the same gym still uses it.
  await releasePlan(db, userId, sessionId);
  await db
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
}
