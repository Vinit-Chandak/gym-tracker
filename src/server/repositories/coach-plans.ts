import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { ZodIssue } from "zod";

import {
  coachMemos,
  coachRequests,
  equipmentInstances,
  equipmentTypes,
  exerciseEquipmentOptions,
  exercises,
  gymAbsentEquipmentTypes,
  gyms,
  profiles,
  programExercises,
  sessionPlans,
  workoutSessions,
} from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { liftingAdherence } from "@/domain/analytics";
import { resolveExerciseAtGym } from "@/domain/equipment-resolution";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { allSlots, progress, slotStatus, type SlotRef } from "@/domain/schedule";
import {
  coachPlanSchema,
  PLAN_LIMITS,
  type CoachPlan,
  type StoredPlanExercise,
} from "@/domain/session-plan";
import { formatSet } from "@/domain/sets";
import type { PlanTrigger } from "@/domain/types";
import { fromDateTimeLocal } from "@/lib/time";
import { sessionHistories, type ComparablePerformance } from "@/server/queries/comparable";
import { getWarmupProtocol, sharedExercises } from "@/server/queries/reference";
import { parseDateRange } from "@/server/validation/date-range";

import { resolvePlannedDay } from "./availability";
import { getGym, listGyms } from "./gyms";
import { getRunTarget, getSchedule, type Schedule, type ScheduleDay } from "./schedule";
import { applyRule } from "./progression-rule";
import { readRecovery, readRuns, readWorkouts } from "./training-data";

/*
 * The house coach's side of the app.
 *
 * A Claude Code routine on the owner's subscription plans the next session of every account
 * that switched the coach on. It reads a planning context (everything a coach would want to
 * know about one athlete's next session, and nothing about anyone else), writes a plan, and
 * the app stores it against the exact programme slot and gym it was made for. Starting that
 * session consumes the plan; the deterministic rule stays the fallback everywhere else.
 */

/** Re-plans one account may ask for in a day: each one is a routine run on the owner's plan. */
export const REPLAN_DAILY_LIMIT = 3;
/** A request older than this without a plan counts as failed, so Today stops waiting. */
export const REQUEST_TIMEOUT_MINUTES = 15;
/** How far back the coach looks for recent training. */
const RECENT_DAYS = 14;
/** How many comparable performances each slot carries. */
const HISTORY_DEPTH = 3;

export class PlanValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "PlanValidationError";
  }
}

export class CoachRequestLimitError extends Error {
  constructor() {
    super(`You have asked the coach ${REPLAN_DAILY_LIMIT} times today. It plans again overnight.`);
    this.name = "CoachRequestLimitError";
  }
}

export type NextTrainingSlot = {
  cycleIndex: number;
  dayIndex: number;
  day: ScheduleDay;
};

/** The earliest pending lifting slot, which is what the coach plans. Rest and run-only days are skipped. */
export function nextTrainingSlot(schedule: Schedule): NextTrainingSlot | null {
  const lifting = new Map(
    schedule.days.filter((d) => d.includesLifting).map((d) => [d.dayIndex, d]),
  );
  for (const ref of allSlots(schedule.state)) {
    const day = lifting.get(ref.dayIndex);
    if (day && slotStatus(schedule.state, ref) === "pending") return { ...ref, day };
  }
  return null;
}

/** The gym a plan is made for when the athlete names none: the default real gym, else the first. */
export async function planningGym(db: DbOrTx, userId: string) {
  const real = (await listGyms(db, userId)).filter((g) => g.isActive && g.kind === "gym");
  return real.find((g) => g.isDefault) ?? real[0] ?? null;
}

export type DueUser = {
  userId: string;
  timeZone: string;
  gymId: string;
  gymName: string;
  slot: { cycleIndex: number; dayIndex: number; dayName: string };
};

/**
 * Accounts the nightly run should plan for: the coach is on, a programme is active with a
 * lifting slot still to do, and there is a gym to plan at. Reads each account under its own
 * Row Level Security, so nothing here sees across accounts.
 */
export async function listDueUsers(db: Db): Promise<DueUser[]> {
  const enabled = await db
    .select({ id: profiles.id, timeZone: profiles.timeZone })
    .from(profiles)
    .where(eq(profiles.aiCoachEnabled, true))
    .orderBy(asc(profiles.createdAt))
    .limit(500);
  const due: DueUser[] = [];
  for (const account of enabled) {
    const entry = await withUser(
      db,
      account.id,
      async (tx) => {
        const [schedule, gym] = await Promise.all([
          getSchedule(tx, account.id),
          planningGym(tx, account.id),
        ]);
        if (!schedule || !gym) return null;
        const slot = nextTrainingSlot(schedule);
        if (!slot) return null;
        return {
          userId: account.id,
          timeZone: account.timeZone,
          gymId: gym.id,
          gymName: gym.name,
          slot: { cycleIndex: slot.cycleIndex, dayIndex: slot.dayIndex, dayName: slot.day.name },
        } satisfies DueUser;
      },
      { readOnly: true },
    );
    if (entry) due.push(entry);
  }
  return due;
}

function setLine(set: ComparablePerformance["sets"][number]): string {
  const base = formatSet(set);
  const type = set.setType === "working" ? "" : ` ${set.setType}`;
  return set.rir === null ? `${base}${type}` : `${base} @${set.rir} RIR${type}`;
}

function performanceSummary(p: ComparablePerformance) {
  return {
    performedAt: p.performedAt.toISOString(),
    gym: p.gymName,
    machine: p.equipmentInstanceName,
    sets: p.sets.map(setLine),
  };
}

export async function getCoachMemo(db: DbOrTx, userId: string) {
  const [row] = await db
    .select({
      overview: coachMemos.overview,
      userNotes: coachMemos.userNotes,
      overviewUpdatedAt: coachMemos.overviewUpdatedAt,
    })
    .from(coachMemos)
    .where(eq(coachMemos.userId, userId))
    .limit(1);
  return row ?? { overview: "", userNotes: "", overviewUpdatedAt: null };
}

export async function saveCoachNotes(db: DbOrTx, userId: string, userNotes: string): Promise<void> {
  await db
    .insert(coachMemos)
    .values({ userId, userNotes })
    .onConflictDoUpdate({ target: coachMemos.userId, set: { userNotes } });
}

async function saveCoachOverview(db: DbOrTx, userId: string, overview: string): Promise<void> {
  const now = new Date();
  await db
    .insert(coachMemos)
    .values({ userId, overview, overviewUpdatedAt: now })
    .onConflictDoUpdate({
      target: coachMemos.userId,
      set: { overview, overviewUpdatedAt: now },
    });
}

/**
 * Everything the coach needs to plan one athlete's next session at one gym, and nothing
 * about anyone else. Assembled from the same reads the app's own screens use, so the coach
 * sees the machines, the comparable history and the rule's own suggestion exactly as the
 * athlete would.
 */
export async function planningContext(
  db: DbOrTx,
  userId: string,
  options: { gymId?: string } = {},
) {
  const [[profile], schedule, memo] = await Promise.all([
    db
      .select({
        displayName: profiles.displayName,
        timeZone: profiles.timeZone,
        preferredUnit: profiles.preferredUnit,
        bodyWeightKg: profiles.bodyWeightKg,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    getSchedule(db, userId),
    getCoachMemo(db, userId),
  ]);
  if (!profile) throw new Error("Account unavailable");
  if (!schedule) return { reason: "no_programme" as const };
  const slot = nextTrainingSlot(schedule);
  if (!slot) return { reason: "programme_complete" as const };
  const gym = options.gymId
    ? await getGym(db, userId, options.gymId)
    : await planningGym(db, userId);
  if (!gym || !gym.isActive || gym.kind !== "gym") return { reason: "no_gym" as const };
  const day = slot.day;
  const today = todayInTimeZone(profile.timeZone);
  const recentRange = parseDateRange(
    { from: addDays(today, -RECENT_DAYS), to: today },
    profile.timeZone,
  );

  const [resolved, planned, machines, absent, warmup, runTarget, recent, runs, recovery, library] =
    await Promise.all([
      resolvePlannedDay(db, userId, gym.id, day.id, { id: gym.id, kind: gym.kind, name: gym.name }),
      db
        .select({ prescription: programExercises, exercise: exercises })
        .from(programExercises)
        .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
        .where(eq(programExercises.programDayId, day.id))
        .orderBy(asc(programExercises.orderIndex)),
      db
        .select({
          id: equipmentInstances.id,
          name: equipmentInstances.name,
          type: equipmentTypes.name,
          typeSlug: equipmentTypes.slug,
          unit: equipmentInstances.unit,
          loadIncrement: equipmentInstances.loadIncrement,
          notes: equipmentInstances.notes,
        })
        .from(equipmentInstances)
        .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentInstances.equipmentTypeId))
        .where(and(eq(equipmentInstances.gymId, gym.id), eq(equipmentInstances.isActive, true)))
        .orderBy(asc(equipmentInstances.name)),
      db
        .select({ name: equipmentTypes.name })
        .from(gymAbsentEquipmentTypes)
        .innerJoin(equipmentTypes, eq(equipmentTypes.id, gymAbsentEquipmentTypes.equipmentTypeId))
        .where(eq(gymAbsentEquipmentTypes.gymId, gym.id)),
      day.warmupProtocolId ? getWarmupProtocol(db, day.warmupProtocolId) : Promise.resolve(null),
      day.includesRun
        ? getRunTarget(db, schedule.program.id, slot.cycleIndex, day.dayOfWeek ?? 0)
        : Promise.resolve(null),
      readWorkouts(db, userId, recentRange, 0, 40),
      readRuns(db, userId, recentRange, 0, 40),
      readRecovery(db, userId, recentRange),
      libraryAtGym(db, userId, gym.id),
    ]);
  if (!resolved) return { reason: "no_gym" as const };

  // Comparable history for what will actually be done: the resolved exercise on the resolved machine.
  const histories = await sessionHistories(
    db,
    resolved.map((item) => {
      const r = item.decision.resolution;
      const exerciseId = r.status === "fallback" ? r.exercise.id : item.exercise.id;
      const row = planned.find((p) => p.exercise.id === exerciseId)?.exercise;
      return {
        userId,
        exerciseId,
        loadPortability:
          row?.loadPortability ??
          library.find((e) => e.id === exerciseId)?.loadPortability ??
          "global",
        equipmentInstanceId:
          r.status === "direct" || r.status === "fallback"
            ? (r.equipmentInstance?.id ?? null)
            : null,
        limit: HISTORY_DEPTH,
      };
    }),
  );

  const slots = resolved.map((item, index) => {
    const plannedRow = planned.find((p) => p.prescription.id === item.programExerciseId);
    const r = item.decision.resolution;
    const resolvedExercise =
      r.status === "fallback"
        ? library.find((e) => e.id === r.exercise.id)
        : library.find((e) => e.id === item.exercise.id);
    const machine =
      r.status === "direct" || r.status === "fallback"
        ? machines.find((m) => m.id === r.equipmentInstance?.id)
        : undefined;
    const history = histories[index]?.history ?? [];
    const rule = plannedRow
      ? applyRule({
          planned: plannedRow.prescription,
          exercise: {
            loadPortability: plannedRow.exercise.loadPortability,
            defaultLoadIncrement: plannedRow.exercise.defaultLoadIncrement,
            defaultRepMin: plannedRow.exercise.defaultRepMin,
            defaultRepMax: plannedRow.exercise.defaultRepMax,
            defaultRir: plannedRow.exercise.defaultRir,
          },
          equipment: machine
            ? { id: machine.id, unit: machine.unit, loadIncrement: machine.loadIncrement }
            : null,
          plannedProgramExerciseId: item.programExerciseId,
          history,
          elsewhere: histories[index]?.elsewhere ?? null,
        })
      : null;
    const p = plannedRow?.prescription;
    return {
      slotId: item.programExerciseId,
      order: index + 1,
      planned: { slug: plannedRow?.exercise.slug ?? null, name: item.exercise.name },
      prescription: p
        ? {
            sets: p.sets,
            type: p.prescriptionType,
            reps: p.prescriptionType === "reps" ? [p.repMin, p.repMax] : null,
            seconds:
              p.prescriptionType === "duration"
                ? [p.durationMinSeconds, p.durationMaxSeconds]
                : null,
            perSide: p.perSide,
            rir: [p.rirMin, p.rirMax],
            restSeconds: [p.restMinSeconds, p.restMaxSeconds],
            targetLoadNote: p.targetLoadNote,
            progressionNotes: p.progressionNotes,
            progressionRule: p.progressionRule,
            keyCue: p.keyCue,
            supersetGroup: p.supersetGroup,
          }
        : null,
      atThisGym: {
        status: r.status,
        exerciseSlug: resolvedExercise?.slug ?? null,
        exerciseName: item.decision.resolvedExerciseName,
        machine: machine ? { id: machine.id, name: machine.name, unit: machine.unit } : null,
        missing: item.decision.missingTypes.map((t) => t.name),
        fallbacks: item.decision.fallbackOptions
          .filter((f) => f.available)
          .map((f) => ({
            exerciseName: f.exerciseName,
            exerciseSlug: library.find((e) => e.id === f.exerciseId)?.slug ?? null,
            machine: f.equipmentInstanceId
              ? { id: f.equipmentInstanceId, name: f.equipmentInstanceName }
              : null,
          })),
      },
      weightStep: rule?.weightStep ?? null,
      history: history.map((h) => ({
        ...performanceSummary(h),
        sameSlot: h.plannedProgramExerciseId === item.programExerciseId,
      })),
      startingGuess: histories[index]?.elsewhere
        ? performanceSummary(histories[index]!.elsewhere!)
        : null,
      rule: rule?.suggestion
        ? {
            kind: rule.suggestion.kind,
            reason: rule.suggestion.reason,
            advice: rule.suggestion.advice,
            sets: rule.suggestion.sets.map((s) => ({
              setType: s.setType,
              weight: s.weight,
              reps: s.reps,
              durationSeconds: s.durationSeconds,
              rir: s.rir,
            })),
          }
        : null,
      regressionStreak: rule?.regressionStreak ?? 0,
    };
  });

  const state = progress(schedule.state);
  return {
    reason: null,
    generatedAt: new Date().toISOString(),
    athlete: {
      id: userId,
      name: profile.displayName,
      timeZone: profile.timeZone,
      unit: profile.preferredUnit,
      bodyWeightKg: profile.bodyWeightKg,
      today,
    },
    memo,
    programme: {
      id: schedule.program.id,
      name: schedule.program.name,
      weeks: schedule.program.weeks,
      startDate: schedule.program.startDate,
      progress: state,
      adherence: liftingAdherence(schedule),
    },
    slot: {
      cycleIndex: slot.cycleIndex,
      dayIndex: slot.dayIndex,
      programDayId: day.id,
      name: day.name,
      focus: day.focus,
      timeNote: day.timeNote,
      effortNote: day.effortNote,
      notes: day.notes,
      includesRun: day.includesRun,
      runTarget,
      warmupProtocol: warmup,
    },
    gym: {
      id: gym.id,
      name: gym.name,
      notes: gym.notes,
      machines: machines.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        unit: m.unit,
        loadIncrement: m.loadIncrement,
        notes: m.notes,
      })),
      knownAbsent: absent.map((a) => a.name),
    },
    exercises: slots,
    recent: {
      days: RECENT_DAYS,
      workouts: recent.workouts.map((w) => ({
        startedAt: w.startedAt.toISOString(),
        completedAt: w.completedAt?.toISOString() ?? null,
        day: w.day?.name ?? null,
        gym: w.gym.name,
        checkIn: {
          sleepHours: w.sleepHours,
          sleepQuality: w.sleepQuality,
          energy: w.energy,
          fatigue: w.fatigue,
          soreness: w.soreness,
          lowerBack: w.backPainPre,
          shinLeft: w.shinLeftPre,
          shinRight: w.shinRightPre,
        },
        bodyWeightKg: w.bodyWeightKg,
        notes: w.notes,
        exercises: w.exercises.map((e) => ({
          name: e.exercise.name,
          machine: e.equipment?.name ?? null,
          skipped: e.skippedAt !== null,
          substitution: e.substitutionReason,
          sets: e.sets.map(setLine),
        })),
      })),
      runs: runs.runs.map((r) => ({
        startedAt: r.startedAt.toISOString(),
        mode: r.mode,
        distanceMeters: r.distanceMeters,
        durationSeconds: r.durationSeconds,
        paceSecondsPerKm: r.averagePaceSecondsPerKm,
        rpe: r.rpe,
        shins: {
          pre: [r.shinLeftPre, r.shinRightPre],
          during: [r.shinLeftDuring, r.shinRightDuring],
          post: [r.shinLeftPost, r.shinRightPost],
        },
        notes: r.notes,
      })),
      recovery: recovery.map((d) => ({
        date: d.date,
        sleepHours: d.sleepHours,
        sleepQuality: d.sleepQuality,
        energy: d.energy,
        fatigue: d.fatigue,
        soreness: d.soreness,
        lowerBack: d.backPain,
        shinLeft: d.shinLeft,
        shinRight: d.shinRight,
        notes: d.notes,
      })),
    },
    library: library.map((e) => ({
      slug: e.slug,
      name: e.name,
      modality: e.modality,
      pattern: e.movementPattern,
      muscles: e.primaryMuscles,
      portability: e.loadPortability,
      defaults: { reps: [e.defaultRepMin, e.defaultRepMax], rir: e.defaultRir },
      atThisGym: e.available ? { machine: e.machine } : null,
    })),
    limits: PLAN_LIMITS,
  };
}

export type PlanningContext = Awaited<ReturnType<typeof planningContext>>;

type LibraryEntry = {
  id: string;
  slug: string;
  name: string;
  modality: (typeof exercises.$inferSelect)["modality"];
  movementPattern: string;
  primaryMuscles: (typeof exercises.$inferSelect)["primaryMuscles"];
  loadPortability: (typeof exercises.$inferSelect)["loadPortability"];
  defaultRepMin: number | null;
  defaultRepMax: number | null;
  defaultRir: number | null;
  available: boolean;
  machine: { id: string; name: string } | null;
};

/** The exercises the athlete can pick from, each resolved at the gym so a substitution names a real machine. */
async function libraryAtGym(db: DbOrTx, userId: string, gymId: string): Promise<LibraryEntry[]> {
  const [shared, own, gym, equipment, absentRows] = await Promise.all([
    sharedExercises(db),
    db.select().from(exercises).where(eq(exercises.userId, userId)),
    db.select({ kind: gyms.kind }).from(gyms).where(eq(gyms.id, gymId)).limit(1),
    db
      .select({
        id: equipmentInstances.id,
        gymId: equipmentInstances.gymId,
        equipmentTypeId: equipmentInstances.equipmentTypeId,
        name: equipmentInstances.name,
        isActive: equipmentInstances.isActive,
      })
      .from(equipmentInstances)
      .where(eq(equipmentInstances.gymId, gymId)),
    db
      .select({ equipmentTypeId: gymAbsentEquipmentTypes.equipmentTypeId })
      .from(gymAbsentEquipmentTypes)
      .where(eq(gymAbsentEquipmentTypes.gymId, gymId)),
  ]);
  const rows = [...shared, ...own].filter((e) => e.isActive);
  const options = rows.length
    ? await db
        .select({
          exerciseId: exerciseEquipmentOptions.exerciseId,
          equipmentTypeId: exerciseEquipmentOptions.equipmentTypeId,
          equipmentInstanceId: exerciseEquipmentOptions.equipmentInstanceId,
          preferenceRank: exerciseEquipmentOptions.preferenceRank,
        })
        .from(exerciseEquipmentOptions)
        .where(
          and(
            inArray(
              exerciseEquipmentOptions.exerciseId,
              rows.map((e) => e.id),
            ),
            or(
              isNull(exerciseEquipmentOptions.equipmentInstanceId),
              inArray(
                exerciseEquipmentOptions.equipmentInstanceId,
                equipment.map((i) => i.id),
              ),
            ),
          ),
        )
    : [];
  const kind = gym[0]?.kind ?? "gym";
  const absent = new Set(absentRows.map((a) => a.equipmentTypeId));
  return rows.map((e) => {
    const resolution = resolveExerciseAtGym({
      exercise: { id: e.id, modality: e.modality, requiresEquipment: e.requiresEquipment },
      gym: { id: gymId, kind },
      preferredEquipmentInstanceId: null,
      options,
      fallbacks: [],
      gymEquipment: equipment,
      absentEquipmentTypeIds: absent,
    });
    const available = resolution.status === "direct";
    const machine =
      resolution.status === "direct" && resolution.equipmentInstance
        ? { id: resolution.equipmentInstance.id, name: resolution.equipmentInstance.name }
        : null;
    return {
      id: e.id,
      slug: e.slug,
      name: e.name,
      modality: e.modality,
      movementPattern: e.movementPattern,
      primaryMuscles: e.primaryMuscles,
      loadPortability: e.loadPortability,
      defaultRepMin: e.defaultRepMin,
      defaultRepMax: e.defaultRepMax,
      defaultRir: e.defaultRir,
      available,
      machine,
    };
  });
}

export type StorePlanInput = {
  slot: { cycleIndex: number; dayIndex: number };
  gymId: string;
  trigger: PlanTrigger;
  requestId?: string | null;
  routineSessionUrl?: string | null;
  model?: string | null;
  plan: unknown;
};

export type StoredPlan = typeof sessionPlans.$inferSelect;

function describeIssues(issues: readonly ZodIssue[]) {
  return issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/**
 * Validates and stores a plan. Structure only: the slot must still be pending, the gym must
 * be the athlete's, every exercise must be one they can see, every machine must stand at that
 * gym, every slot id must belong to the day. What the plan prescribes is the coach's call.
 */
export async function storePlan(
  db: DbOrTx,
  userId: string,
  input: StorePlanInput,
): Promise<StoredPlan> {
  const parsed = coachPlanSchema.safeParse(input.plan);
  if (!parsed.success)
    throw new PlanValidationError("The plan is not valid.", describeIssues(parsed.error.issues));
  const plan: CoachPlan = parsed.data;

  const [schedule, gym] = await Promise.all([
    getSchedule(db, userId),
    getGym(db, userId, input.gymId),
  ]);
  if (!schedule) throw new PlanValidationError("No active programme.");
  if (!gym || !gym.isActive || gym.kind !== "gym")
    throw new PlanValidationError("The gym is not one of the athlete's active gyms.");
  const ref: SlotRef = input.slot;
  const day = schedule.days.find((d) => d.dayIndex === ref.dayIndex);
  const exists = allSlots(schedule.state).some(
    (s) => s.cycleIndex === ref.cycleIndex && s.dayIndex === ref.dayIndex,
  );
  if (!day || !exists || !day.includesLifting)
    throw new PlanValidationError("The slot is not a lifting day of the programme.");
  if (slotStatus(schedule.state, ref) !== "pending")
    throw new PlanValidationError("The slot is no longer pending; plan the next one.");

  const [daySlots, machines, visible] = await Promise.all([
    db
      .select({ id: programExercises.id })
      .from(programExercises)
      .where(eq(programExercises.programDayId, day.id)),
    db
      .select({ id: equipmentInstances.id, name: equipmentInstances.name })
      .from(equipmentInstances)
      .where(and(eq(equipmentInstances.gymId, gym.id), eq(equipmentInstances.isActive, true))),
    db
      .select({ id: exercises.id, slug: exercises.slug, name: exercises.name })
      .from(exercises)
      .where(
        and(
          eq(exercises.isActive, true),
          inArray(
            exercises.slug,
            plan.exercises.map((e) => e.exerciseSlug),
          ),
        ),
      ),
  ]);
  const slotIds = new Set(daySlots.map((s) => s.id));
  const issues: { path: string; message: string }[] = [];
  const stored: StoredPlanExercise[] = plan.exercises.map((entry, index) => {
    const exercise = visible.find((e) => e.slug === entry.exerciseSlug);
    if (!exercise)
      issues.push({
        path: `exercises.${index}.exerciseSlug`,
        message: `Unknown exercise "${entry.exerciseSlug}".`,
      });
    if (entry.slotId && !slotIds.has(entry.slotId))
      issues.push({
        path: `exercises.${index}.slotId`,
        message: "Not a slot of the day being planned.",
      });
    const machine = entry.equipmentInstanceId
      ? machines.find((m) => m.id === entry.equipmentInstanceId)
      : null;
    if (entry.equipmentInstanceId && !machine)
      issues.push({
        path: `exercises.${index}.equipmentInstanceId`,
        message: `No active machine with that id at ${gym.name}.`,
      });
    return {
      ...entry,
      exerciseId: exercise?.id ?? "",
      exerciseName: exercise?.name ?? entry.exerciseSlug,
      equipmentInstanceName: machine?.name ?? null,
    };
  });
  const seenSlots = new Set<string>();
  for (const [index, entry] of stored.entries()) {
    if (!entry.slotId) continue;
    if (seenSlots.has(entry.slotId))
      issues.push({ path: `exercises.${index}.slotId`, message: "The same slot appears twice." });
    seenSlots.add(entry.slotId);
  }
  if (issues.length > 0)
    throw new PlanValidationError("The plan names things this account does not have.", issues);

  await db
    .update(sessionPlans)
    .set({ status: "superseded" })
    .where(
      and(
        eq(sessionPlans.programId, schedule.program.id),
        eq(sessionPlans.cycleIndex, ref.cycleIndex),
        eq(sessionPlans.dayIndex, ref.dayIndex),
        eq(sessionPlans.status, "active"),
      ),
    );
  const [row] = await db
    .insert(sessionPlans)
    .values({
      userId,
      programId: schedule.program.id,
      programDayId: day.id,
      cycleIndex: ref.cycleIndex,
      dayIndex: ref.dayIndex,
      gymId: gym.id,
      trigger: input.trigger,
      requestId: input.requestId ?? null,
      summary: plan.summary,
      warmup: plan.warmup,
      exercises: stored,
      model: input.model ?? null,
      routineSessionUrl: input.routineSessionUrl ?? null,
    })
    .returning();
  if (!row) throw new Error("Plan insert returned no row");
  if (plan.memo !== undefined) await saveCoachOverview(db, userId, plan.memo);
  if (input.requestId) {
    await db
      .update(coachRequests)
      .set({ status: "planned", completedAt: new Date() })
      .where(and(eq(coachRequests.id, input.requestId), eq(coachRequests.userId, userId)));
  }
  return row;
}

/** The plan waiting for one slot, if any. */
export async function activePlanForSlot(
  db: DbOrTx,
  userId: string,
  programId: string,
  ref: SlotRef,
): Promise<StoredPlan | null> {
  const [row] = await db
    .select()
    .from(sessionPlans)
    .where(
      and(
        eq(sessionPlans.userId, userId),
        eq(sessionPlans.programId, programId),
        eq(sessionPlans.cycleIndex, ref.cycleIndex),
        eq(sessionPlans.dayIndex, ref.dayIndex),
        eq(sessionPlans.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Hands the slot's plan to a session that is starting at the plan's gym, and records which
 * session used it. A session at another gym leaves the plan waiting, so a re-plan can replace it.
 */
export async function consumePlan(
  db: DbOrTx,
  userId: string,
  target: { programId: string; ref: SlotRef; gymId: string; sessionId: string },
): Promise<StoredPlan | null> {
  const plan = await activePlanForSlot(db, userId, target.programId, target.ref);
  if (!plan || plan.gymId !== target.gymId) return null;
  const [row] = await db
    .update(sessionPlans)
    .set({ status: "consumed", consumedAt: new Date(), workoutSessionId: target.sessionId })
    .where(eq(sessionPlans.id, plan.id))
    .returning();
  return row ?? null;
}

/**
 * Gives a plan back when the session that took it is discarded. Only while no newer plan
 * has taken the slot: exactly one plan may wait for a slot.
 */
export async function releasePlan(db: DbOrTx, userId: string, sessionId: string): Promise<void> {
  const [taken] = await db
    .select()
    .from(sessionPlans)
    .where(
      and(
        eq(sessionPlans.userId, userId),
        eq(sessionPlans.workoutSessionId, sessionId),
        eq(sessionPlans.status, "consumed"),
      ),
    )
    .limit(1);
  if (!taken) return;
  const waiting = await activePlanForSlot(db, userId, taken.programId, taken);
  await db
    .update(sessionPlans)
    .set(
      waiting
        ? { workoutSessionId: null }
        : { status: "active", consumedAt: null, workoutSessionId: null },
    )
    .where(eq(sessionPlans.id, taken.id));
}

/** The plan a session was started with, for the session view. */
export async function planForSession(db: DbOrTx, sessionId: string): Promise<StoredPlan | null> {
  const [row] = await db
    .select()
    .from(sessionPlans)
    .where(eq(sessionPlans.workoutSessionId, sessionId))
    .orderBy(desc(sessionPlans.consumedAt))
    .limit(1);
  return row ?? null;
}

export type CoachRequest = typeof coachRequests.$inferSelect;

/** Start of the athlete's civil day, for counting today's requests. */
function startOfToday(timeZone: string): Date {
  return fromDateTimeLocal(`${todayInTimeZone(timeZone)}T00:00`, timeZone) ?? new Date(0);
}

export async function countRequestsToday(
  db: DbOrTx,
  userId: string,
  timeZone: string,
): Promise<number> {
  const rows = await db
    .select({ id: coachRequests.id })
    .from(coachRequests)
    .where(
      and(eq(coachRequests.userId, userId), gte(coachRequests.requestedAt, startOfToday(timeZone))),
    );
  return rows.length;
}

/** Records that the athlete asked for a plan. The caller fires the routine and reports back. */
export async function createCoachRequest(
  db: DbOrTx,
  userId: string,
  input: { gymId: string; reason: string | null; timeZone: string },
): Promise<CoachRequest> {
  if ((await countRequestsToday(db, userId, input.timeZone)) >= REPLAN_DAILY_LIMIT)
    throw new CoachRequestLimitError();
  const [row] = await db
    .insert(coachRequests)
    .values({ userId, gymId: input.gymId, reason: input.reason })
    .returning();
  if (!row) throw new Error("Request insert returned no row");
  return row;
}

export async function recordRoutineRun(
  db: DbOrTx,
  userId: string,
  requestId: string,
  run: { sessionId: string; sessionUrl: string },
): Promise<void> {
  await db
    .update(coachRequests)
    .set({ routineSessionId: run.sessionId, routineSessionUrl: run.sessionUrl })
    .where(and(eq(coachRequests.id, requestId), eq(coachRequests.userId, userId)));
}

export async function markRequestFailed(
  db: DbOrTx,
  userId: string,
  requestId: string,
  error: string,
): Promise<boolean> {
  const rows = await db
    .update(coachRequests)
    .set({ status: "failed", error: error.slice(0, 500), completedAt: new Date() })
    .where(
      and(
        eq(coachRequests.id, requestId),
        eq(coachRequests.userId, userId),
        eq(coachRequests.status, "requested"),
      ),
    )
    .returning({ id: coachRequests.id });
  return rows.length > 0;
}

/** A request the coach has not answered yet, unless it is old enough to count as lost. */
export async function pendingRequest(db: DbOrTx, userId: string): Promise<CoachRequest | null> {
  const since = new Date(Date.now() - REQUEST_TIMEOUT_MINUTES * 60_000);
  const [row] = await db
    .select()
    .from(coachRequests)
    .where(
      and(
        eq(coachRequests.userId, userId),
        eq(coachRequests.status, "requested"),
        gte(coachRequests.requestedAt, since),
      ),
    )
    .orderBy(desc(coachRequests.requestedAt))
    .limit(1);
  return row ?? null;
}

export async function latestPlan(db: DbOrTx, userId: string): Promise<StoredPlan | null> {
  const [row] = await db
    .select()
    .from(sessionPlans)
    .where(eq(sessionPlans.userId, userId))
    .orderBy(desc(sessionPlans.generatedAt))
    .limit(1);
  return row ?? null;
}

export type TodayCoachState = {
  enabled: boolean;
  /** The plan for the suggested slot, whichever gym it was made for. */
  plan: (StoredPlan & { gymName: string }) | null;
  /** Whether that plan was made for the gym the athlete is about to train at. */
  matchesGym: boolean;
  pending: CoachRequest | null;
  requestsLeft: number;
};

/** What Today shows about the coach for the suggested slot. */
export async function todayCoachState(
  db: DbOrTx,
  userId: string,
  input: {
    enabled: boolean;
    timeZone: string;
    programId: string;
    ref: SlotRef;
    gymId: string | null;
  },
): Promise<TodayCoachState> {
  const [plan, pending, used] = await Promise.all([
    activePlanForSlot(db, userId, input.programId, input.ref),
    pendingRequest(db, userId),
    countRequestsToday(db, userId, input.timeZone),
  ]);
  const planGym = plan ? await getGym(db, userId, plan.gymId) : null;
  return {
    enabled: input.enabled,
    plan: plan ? { ...plan, gymName: planGym?.name ?? "another gym" } : null,
    matchesGym: plan !== null && input.gymId !== null && plan.gymId === input.gymId,
    pending,
    requestsLeft: Math.max(0, REPLAN_DAILY_LIMIT - used),
  };
}

/** Plans an account no longer needs, e.g. after its programme changed. Kept for history. */
export async function voidPlansForProgram(
  db: DbOrTx,
  userId: string,
  programId: string,
): Promise<void> {
  await db
    .update(sessionPlans)
    .set({ status: "void" })
    .where(
      and(
        eq(sessionPlans.userId, userId),
        eq(sessionPlans.programId, programId),
        eq(sessionPlans.status, "active"),
      ),
    );
}

/** Whether a session already exists for the plan's slot, which Today uses to hide a stale plan. */
export async function sessionExistsForSlot(
  db: DbOrTx,
  userId: string,
  programDayId: string,
  cycleIndex: number,
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql`1` })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.programDayId, programDayId),
        eq(workoutSessions.cycleIndex, cycleIndex),
      ),
    )
    .limit(1);
  return row !== undefined;
}
