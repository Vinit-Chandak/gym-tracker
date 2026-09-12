import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
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
  programDays,
  programExercises,
  programRuns,
  runs as runLogs,
  sessionPlans,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { liftingAdherence } from "@/domain/analytics";
import {
  reviewPlan,
  STRENGTH_COMPOUND_SLUGS,
  type PlanWarning,
  type ReviewExercise,
} from "@/domain/coach-review";
import { resolveExerciseAtGym } from "@/domain/equipment-resolution";
import type { ProgramPatch } from "@/domain/program-patch";
import { performanceScore } from "@/domain/progression";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { shinEscalations, volumeSpike } from "@/domain/running";
import { allSlots, progress, sessionsBehind, slotStatus, type SlotRef } from "@/domain/schedule";
import {
  coachPlanSchema,
  PLAN_LIMITS,
  runPlanLine,
  type CoachPlan,
  type PlanRun,
  type StoredPlanExercise,
} from "@/domain/session-plan";
import { formatSet, weightStepFor } from "@/domain/sets";
import type {
  CoachRequestInitiator,
  CoachRequestStatus,
  PlanTrigger,
  PrescriptionType,
} from "@/domain/types";
import { fromDateTimeLocal } from "@/lib/time";
import { ageOn } from "@/lib/units";
import { sessionHistories, type ComparablePerformance } from "@/server/queries/comparable";
import { getWarmupProtocol, sharedExercises } from "@/server/queries/reference";
import { parseDateRange } from "@/server/validation/date-range";

import { resolvePlannedDay } from "./availability";
import { getGym, listGyms } from "./gyms";
import {
  completedRunIdFor,
  getRunTarget,
  getSchedule,
  type Schedule,
  type ScheduleDay,
} from "./schedule";
import { applyRule } from "./progression-rule";
import { readRecovery, readWorkouts } from "./training-data";
import { readWeeklyTrainingVolume } from "./training-volume";

/*
 * The house coach's side of the app.
 *
 * A Claude Code routine on the owner's subscription plans the next session of every account
 * that switched the coach on. It reads a planning context (everything a coach would want to
 * know about one athlete's next session, and nothing about anyone else), writes a plan, and
 * the app stores it against the exact programme slot and gym it was made for. Starting that
 * session consumes the plan; the deterministic rule stays the fallback everywhere else.
 */

/**
 * Plans one account may ask the coach for in a day: each one is a routine run on the owner's
 * plan. Only the athlete's own asks are counted, so nothing the coach decides to do of its own
 * accord can spend them.
 */
export const REPLAN_DAILY_LIMIT = 3;
export { REQUEST_TIMEOUT_MINUTES } from "@/domain/coach-request";
import { REQUEST_TIMEOUT_MINUTES } from "@/domain/coach-request";
export const REQUEST_TIMEOUT_MESSAGE =
  "The coach did not return a plan before this request timed out. Please try again later.";
/** How far back the coach looks for recent training. */
const RECENT_DAYS = 14;
/**
 * How many comparable performances each slot carries. Enough to see a block's trend rather
 * than only the last session, which is what a decision to hold or deload rests on.
 */
const HISTORY_DEPTH = 8;
/** How many of the coach's own last plans it is shown, with what was actually done against them. */
const PLAN_REVIEW_DEPTH = 3;

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

/**
 * The earliest pending slot the coach plans: one that lifts, runs, or both. Only a rest day
 * is skipped, since there is nothing there to prescribe.
 */
/**
 * The next pending slot that runs after the one being planned, and how many training slots away
 * it is. An athlete with a race in their notes needs to know when their next run falls — and on
 * a day that already runs, what they need is the one after it, not this one again.
 */
export function nextRunningSlot(
  schedule: Schedule,
  after?: SlotRef,
): (NextTrainingSlot & { slotsAway: number }) | null {
  const training = new Map(
    schedule.days.filter((d) => d.includesLifting || d.includesRun).map((d) => [d.dayIndex, d]),
  );
  let slotsAway = 0;
  let reached = after === undefined;
  for (const ref of allSlots(schedule.state)) {
    const day = training.get(ref.dayIndex);
    if (!day || slotStatus(schedule.state, ref) !== "pending") continue;
    if (!reached) {
      if (ref.cycleIndex === after!.cycleIndex && ref.dayIndex === after!.dayIndex) reached = true;
      continue;
    }
    slotsAway += 1;
    if (day.includesRun) return { ...ref, day, slotsAway };
  }
  return null;
}

export function nextTrainingSlot(schedule: Schedule): NextTrainingSlot | null {
  const training = new Map(
    schedule.days.filter((d) => d.includesLifting || d.includesRun).map((d) => [d.dayIndex, d]),
  );
  for (const ref of allSlots(schedule.state)) {
    const day = training.get(ref.dayIndex);
    if (day && slotStatus(schedule.state, ref) === "pending") return { ...ref, day };
  }
  return null;
}

/**
 * The gym a plan is made for when the athlete names none: their default real gym, then any
 * real gym, and finally any active location at all, which is what a running day needs when
 * the only place on the account is Outdoor.
 */
export async function planningGym(db: DbOrTx, userId: string) {
  const active = (await listGyms(db, userId)).filter((g) => g.isActive);
  const real = active.filter((g) => g.kind === "gym");
  return (
    real.find((g) => g.isDefault) ?? real[0] ?? active.find((g) => g.isDefault) ?? active[0] ?? null
  );
}

export type DueUser = {
  userId: string;
  timeZone: string;
  gymId: string;
  gymName: string;
  slot: {
    cycleIndex: number;
    dayIndex: number;
    dayName: string;
    /** What the day asks for, so a run-only day is obvious in the routine's log. */
    lifts: boolean;
    runs: boolean;
  };
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
          slot: {
            cycleIndex: slot.cycleIndex,
            dayIndex: slot.dayIndex,
            dayName: slot.day.name,
            lifts: slot.day.includesLifting,
            runs: slot.day.includesRun,
          },
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

export type PlanOutcome = {
  generatedAt: string;
  trigger: PlanTrigger;
  slot: { cycleIndex: number; dayIndex: number };
  gymName: string;
  status: string;
  summary: string;
  warnings: PlanWarning[];
  prescribed: {
    name: string;
    machine: string | null;
    action: string;
    targets: string;
    note: string;
    /**
     * What the entry named, so a plan can be compared with this one by identity rather than by
     * display name: the slot it answered, that slot's lineage (the only way to name it in a
     * proposal), the exercise the coach chose and the machine it chose for it.
     */
    slotId: string | null;
    lineageId: string | null;
    exerciseSlug: string;
    exerciseId: string;
    equipmentInstanceId: string | null;
  }[];
  run: string | null;
  /** What was actually done in the session that used the plan; null when it was never used. */
  performed: {
    startedAt: string;
    /** Null means this is unfinished work, not a completed plan outcome. */
    completedAt: string | null;
    exercises: {
      name: string;
      machine: string | null;
      exerciseId: string;
      equipmentInstanceId: string | null;
      skipped: boolean;
      sets: string;
    }[];
  } | null;
};

/**
 * The coach's own last plans, each with what the athlete actually did against it.
 *
 * Without this the coach cannot tell whether its last call worked: it would prescribe into
 * the dark every night, repeat a substitution nobody wanted, and never learn that four sets
 * became three. It is the difference between a coach and a generator.
 */
async function recentPlanOutcomes(
  db: DbOrTx,
  userId: string,
  limit: number,
): Promise<PlanOutcome[]> {
  // The latest plan for each of the last few slots, not the last few plans: a slot re-planned
  // three times would otherwise fill the coach's whole memory with one day's second thoughts.
  const recent = await db
    .select({ plan: sessionPlans, gymName: gyms.name })
    .from(sessionPlans)
    .innerJoin(gyms, eq(gyms.id, sessionPlans.gymId))
    .where(eq(sessionPlans.userId, userId))
    .orderBy(desc(sessionPlans.generatedAt))
    .limit(limit * 5);
  const seen = new Set<string>();
  const plans = recent
    .filter((row) => {
      const slot = `${row.plan.programId}:${row.plan.cycleIndex}:${row.plan.dayIndex}`;
      if (seen.has(slot)) return false;
      seen.add(slot);
      return true;
    })
    .slice(0, limit);
  if (plans.length === 0) return [];
  const sessionIds = plans
    .map((row) => row.plan.workoutSessionId)
    .filter((id): id is string => id !== null);
  // The slots of those sessions and their sets: two statements, grouped here, as elsewhere.
  const [slots, sets, sessions] = sessionIds.length
    ? await Promise.all([
        db
          .select({
            sessionId: workoutExercises.workoutSessionId,
            id: workoutExercises.id,
            name: exercises.name,
            exerciseId: workoutExercises.exerciseId,
            equipmentInstanceId: workoutExercises.equipmentInstanceId,
            machine: equipmentInstances.name,
            skippedAt: workoutExercises.skippedAt,
            orderIndex: workoutExercises.orderIndex,
          })
          .from(workoutExercises)
          .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
          .leftJoin(
            equipmentInstances,
            eq(equipmentInstances.id, workoutExercises.equipmentInstanceId),
          )
          .where(
            and(
              eq(workoutExercises.userId, userId),
              inArray(workoutExercises.workoutSessionId, sessionIds),
            ),
          )
          .orderBy(asc(workoutExercises.orderIndex)),
        db
          .select({
            workoutExerciseId: setLogs.workoutExerciseId,
            setIndex: setLogs.setIndex,
            setType: setLogs.setType,
            weight: setLogs.weight,
            unit: setLogs.unit,
            reps: setLogs.reps,
            rir: setLogs.rir,
            durationSeconds: setLogs.durationSeconds,
            distanceMeters: setLogs.distanceMeters,
          })
          .from(setLogs)
          .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
          .where(
            and(eq(setLogs.userId, userId), inArray(workoutExercises.workoutSessionId, sessionIds)),
          )
          .orderBy(asc(setLogs.setIndex)),
        db
          .select({
            id: workoutSessions.id,
            startedAt: workoutSessions.startedAt,
            completedAt: workoutSessions.completedAt,
          })
          .from(workoutSessions)
          .where(inArray(workoutSessions.id, sessionIds)),
      ])
    : [[], [], []];

  return plans.map(({ plan, gymName }) => {
    const sessionId = plan.workoutSessionId;
    const session = sessions.find((row) => row.id === sessionId);
    return {
      generatedAt: plan.generatedAt.toISOString(),
      trigger: plan.trigger,
      slot: { cycleIndex: plan.cycleIndex, dayIndex: plan.dayIndex },
      gymName,
      status: plan.status,
      summary: plan.summary,
      warnings: plan.warnings,
      prescribed: plan.exercises.map((entry) => ({
        name: entry.exerciseName,
        machine: entry.equipmentInstanceName,
        slotId: entry.slotId,
        lineageId: entry.slotLineageId,
        exerciseSlug: entry.exerciseSlug,
        exerciseId: entry.exerciseId,
        equipmentInstanceId: entry.equipmentInstanceId,
        action: entry.action,
        // Written the way performances are, so the two can be read against each other: the load
        // in the unit it was planned in, and the effort it was asked for.
        targets:
          entry.action === "drop"
            ? "left out"
            : entry.sets.length === 0
              ? "by the rule"
              : entry.sets
                  .map((set, index) =>
                    setLine({
                      setIndex: index + 1,
                      setType: set.setType,
                      weight: set.weight,
                      unit: entry.unit ?? "kg",
                      reps: set.reps,
                      rir: set.rir,
                      durationSeconds: set.durationSeconds,
                      distanceMeters: set.distanceMeters,
                    }),
                  )
                  .join(", "),
        note: entry.note,
      })),
      run: plan.run ? runPlanLine(plan.run) : null,
      performed:
        sessionId && session
          ? {
              startedAt: session.startedAt.toISOString(),
              completedAt: session.completedAt?.toISOString() ?? null,
              exercises: slots
                .filter((slot) => slot.sessionId === sessionId)
                .map((slot) => ({
                  name: slot.name,
                  machine: slot.machine,
                  exerciseId: slot.exerciseId,
                  equipmentInstanceId: slot.equipmentInstanceId,
                  skipped: slot.skippedAt !== null,
                  // With the RIR, as everywhere else the coach reads performances: whether a
                  // plan worked is judged against the effort it asked for, not the reps alone.
                  sets: sets
                    .filter((set) => set.workoutExerciseId === slot.id)
                    .map((set) => setLine({ ...set, distanceMeters: set.distanceMeters ?? null }))
                    .join(", "),
                })),
            }
          : null,
    };
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
  const [[profile], schedule, memo, pendingAsk] = await Promise.all([
    db
      .select({
        displayName: profiles.displayName,
        timeZone: profiles.timeZone,
        preferredUnit: profiles.preferredUnit,
        bodyWeightKg: profiles.bodyWeightKg,
        heightCm: profiles.heightCm,
        dateOfBirth: profiles.dateOfBirth,
        sex: profiles.sex,
        trainingGoal: profiles.trainingGoal,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    getSchedule(db, userId),
    getCoachMemo(db, userId),
    pendingRequest(db, userId),
  ]);
  if (!profile) throw new Error("Account unavailable");
  if (!schedule) return { reason: "no_programme" as const };
  const slot = nextTrainingSlot(schedule);
  if (!slot) return { reason: "programme_complete" as const };
  const day = slot.day;
  const nextRun = nextRunningSlot(schedule, slot);
  const gym = options.gymId
    ? await getGym(db, userId, options.gymId)
    : await planningGym(db, userId);
  // A day that lifts needs a real gym with machines; a running day can be anywhere active.
  if (!gym || !gym.isActive || (day.includesLifting && gym.kind !== "gym"))
    return { reason: "no_gym" as const };
  const snapshot = new Date();
  const today = todayInTimeZone(profile.timeZone, snapshot);
  const recentRange = parseDateRange(
    { from: addDays(today, -RECENT_DAYS), to: today },
    profile.timeZone,
  );

  const [
    resolved,
    planned,
    machines,
    absent,
    warmup,
    runTarget,
    plannedRun,
    recent,
    runRows,
    recovery,
    library,
    lastPlans,
    trainingVolume,
  ] = await Promise.all([
    day.includesLifting
      ? resolvePlannedDay(db, userId, gym.id, day.id, {
          id: gym.id,
          kind: gym.kind,
          name: gym.name,
        })
      : Promise.resolve([]),
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
    // The programme's own run row for this slot, so a planned run can be logged against it.
    day.includesRun
      ? db
          .select({ id: programRuns.id })
          .from(programRuns)
          .where(
            and(
              eq(programRuns.programId, schedule.program.id),
              eq(programRuns.weekIndex, slot.cycleIndex),
              eq(programRuns.dayOfWeek, day.dayOfWeek ?? 0),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    readWorkouts(db, userId, { ...recentRange, end: snapshot }, 0, 40, {
      completedOnly: true,
      completedBy: snapshot,
    }),
    // A bounded narrative sample only; full workload is aggregated separately below.
    db
      .select()
      .from(runLogs)
      .where(and(eq(runLogs.userId, userId), lt(runLogs.startedAt, snapshot)))
      .orderBy(desc(runLogs.startedAt), desc(runLogs.id))
      .limit(41),
    readRecovery(db, userId, recentRange),
    libraryAtGym(db, userId, gym.id),
    recentPlanOutcomes(db, userId, PLAN_REVIEW_DEPTH),
    readWeeklyTrainingVolume(db, userId, profile.timeZone, snapshot, 4),
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
        before: snapshot,
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
            defaultPrescriptionType: plannedRow.exercise.defaultPrescriptionType,
            defaultRepMin: plannedRow.exercise.defaultRepMin,
            defaultRepMax: plannedRow.exercise.defaultRepMax,
            defaultDurationMinSeconds: plannedRow.exercise.defaultDurationMinSeconds,
            defaultDurationMaxSeconds: plannedRow.exercise.defaultDurationMaxSeconds,
            defaultDistanceMinMeters: plannedRow.exercise.defaultDistanceMinMeters,
            defaultDistanceMaxMeters: plannedRow.exercise.defaultDistanceMaxMeters,
            defaultRir: plannedRow.exercise.defaultRir,
          },
          equipment: machine
            ? { id: machine.id, unit: machine.unit, loadIncrement: machine.loadIncrement }
            : null,
          preferredUnit: profile.preferredUnit === "lb" ? "lb" : "kg",
          slotLineageId: plannedRow.prescription.lineageId,
          history,
          elsewhere: histories[index]?.elsewhere ?? null,
        })
      : null;
    const p = plannedRow?.prescription;
    return {
      slotId: item.programExerciseId,
      /** The slot's identity across programme versions; what a proposal names. */
      lineageId: plannedRow?.prescription.lineageId ?? null,
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
            /** Carries and sled work are prescribed in metres, not in reps. */
            meters:
              p.prescriptionType === "distance" ? [p.distanceMinMeters, p.distanceMaxMeters] : null,
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
        sameSlot: h.plannedSlotLineageId === plannedRow?.prescription.lineageId,
        // One number per session, comparable within this slot: estimated 1RM where the sets
        // allow one, else total reps, else seconds. A trend, rather than three loose sessions.
        score: Math.round(performanceScore(h.sets) * 10) / 10,
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
  const runHistory = runRows.slice(0, 40).map((run) => ({
    startedAt: run.startedAt.toISOString(),
    startedOn: todayInTimeZone(profile.timeZone, run.startedAt),
    mode: run.mode,
    // What was logged, not a tenth of a kilometre: the coach reads these to judge one run.
    distanceKm: Math.round(run.distanceMeters / 10) / 100,
    durationMinutes: Math.round(run.durationSeconds / 60),
    paceSecondsPerKm: run.averagePaceSecondsPerKm,
    rpe: run.rpe,
    shins: {
      pre: [run.shinLeftPre, run.shinRightPre],
      during: [run.shinLeftDuring, run.shinRightDuring],
      post: [run.shinLeftPost, run.shinRightPost],
    },
    programRunId: run.programRunId,
    notes: run.notes,
  }));
  const weeks = trainingVolume.map((week) => ({ weekStart: week.weekStart, ...week.running }));
  const [thisWeek, lastWeek] = weeks;
  return {
    reason: null,
    generatedAt: snapshot.toISOString(),
    athlete: {
      id: userId,
      name: profile.displayName,
      timeZone: profile.timeZone,
      unit: profile.preferredUnit,
      bodyWeightKg: profile.bodyWeightKg,
      heightCm: profile.heightCm,
      // Sent as years rather than a birth date: the coach is planning training, and the date
      // itself would be one more identifying detail in a payload that does not need it.
      age: profile.dateOfBirth === null ? null : ageOn(profile.dateOfBirth, today),
      sex: profile.sex,
      goal: profile.trainingGoal,
      today,
    },
    memo,
    /**
     * The athlete's own ask, when one is waiting for this gym: their words about today, read from
     * the same place as everything else rather than relayed through the run's fire payload.
     * `reason` is null when they asked without saying anything.
     */
    request:
      pendingAsk && pendingAsk.gymId === gym.id
        ? {
            id: pendingAsk.id,
            reason: pendingAsk.reason,
            requestedAt: pendingAsk.requestedAt.toISOString(),
          }
        : null,
    programme: {
      id: schedule.program.id,
      name: schedule.program.name,
      weeks: schedule.program.weeks,
      startDate: schedule.program.startDate,
      progress: state,
      adherence: liftingAdherence(schedule),
      /**
       * Slots behind the programme's own one-a-day pace, not calendar days: the app never fixes
       * a date to a future slot, and the athlete trains the next one whenever they get to it.
       */
      slotsBehind: schedule.program.startDate
        ? sessionsBehind(schedule.state, schedule.program.startDate, today)
        : 0,
      /** The next run after the one being planned, in training slots from it. */
      nextRun: nextRun
        ? {
            cycleIndex: nextRun.cycleIndex,
            dayIndex: nextRun.dayIndex,
            dayName: nextRun.day.name,
            slotsAway: nextRun.slotsAway,
            alsoLifts: nextRun.day.includesLifting,
          }
        : null,
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
      includesLifting: day.includesLifting,
      includesRun: day.includesRun,
      runTarget,
      /** Pass this back as the plan's `run.programRunId` so the logged run counts for the block. */
      programRunId: plannedRun[0]?.id ?? null,
      warmupProtocol: warmup,
    },
    gym: {
      id: gym.id,
      name: gym.name,
      /**
       * Whether this is the gym the athlete trains at by default. A plan asked for at another
       * gym must read the machines here rather than what the memo remembers about the usual one.
       */
      isDefault: gym.isDefault,
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
      from: recentRange.from,
      to: recentRange.to,
      workoutsHasMore: recent.hasMore,
      runsHasMore:
        runRows.length > 40 &&
        todayInTimeZone(profile.timeZone, runRows[40]!.startedAt) >= recentRange.from,
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
      runs: runHistory.filter(
        (run) => run.startedOn >= recentRange.from && run.startedOn <= recentRange.to,
      ),
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
    /**
     * Running load, whatever the day is. A lifting plan is decided partly by what the legs
     * have been doing, and the shin rule from the athlete's history depends on the trend
     * rather than on one run.
     */
    running: {
      weeks,
      spike: thisWeek && lastWeek ? volumeSpike(thisWeek, lastWeek) : null,
      shinEscalations: shinEscalations(runRows),
      history: runHistory.slice(0, 8),
      historyHasMore: runRows.length > 8,
    },
    /** Working sets by muscle for the last four weeks, newest first. */
    volume: trainingVolume.map((week) => ({ weekStart: week.weekStart, ...week.lifting })),
    /** Exact aggregate coverage; incomplete workouts are counted separately from completed work. */
    volumeCoverage: trainingVolume.map((week) => ({ weekStart: week.weekStart, ...week.coverage })),
    /** The coach's own last plans, and what was actually done against each. */
    lastPlans,
    library: library.map((e) => ({
      slug: e.slug,
      name: e.name,
      modality: e.modality,
      pattern: e.movementPattern,
      muscles: e.primaryMuscles,
      portability: e.loadPortability,
      /** What one set of it counts, so the coach prescribes a carry in metres, not in reps. */
      measure: e.defaultPrescriptionType,
      defaults: {
        reps: [e.defaultRepMin, e.defaultRepMax],
        seconds: [e.defaultDurationMinSeconds, e.defaultDurationMaxSeconds],
        meters: [e.defaultDistanceMinMeters, e.defaultDistanceMaxMeters],
        rir: e.defaultRir,
      },
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
  defaultPrescriptionType: PrescriptionType;
  defaultRepMin: number | null;
  defaultRepMax: number | null;
  defaultDurationMinSeconds: number | null;
  defaultDurationMaxSeconds: number | null;
  defaultDistanceMinMeters: number | null;
  defaultDistanceMaxMeters: number | null;
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
      defaultPrescriptionType: e.defaultPrescriptionType,
      defaultRepMin: e.defaultRepMin,
      defaultRepMax: e.defaultRepMax,
      defaultDurationMinSeconds: e.defaultDurationMinSeconds,
      defaultDurationMaxSeconds: e.defaultDurationMaxSeconds,
      defaultDistanceMinMeters: e.defaultDistanceMinMeters,
      defaultDistanceMaxMeters: e.defaultDistanceMaxMeters,
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

  if (input.requestId) {
    // The caller's transaction holds this row through acceptance. A timeout or failure
    // callback cannot race this result into a different terminal state.
    const [request] = await db
      .select()
      .from(coachRequests)
      .where(and(eq(coachRequests.id, input.requestId), eq(coachRequests.userId, userId)))
      .limit(1)
      .for("update");
    if (
      !request ||
      request.status !== "requested" ||
      request.trigger !== "replan" ||
      input.trigger !== "replan" ||
      request.gymId !== input.gymId.toLowerCase() ||
      request.requestedAt.getTime() < Date.now() - REQUEST_TIMEOUT_MINUTES * 60_000
    ) {
      throw new PlanValidationError("This request is no longer valid for this plan.", [
        {
          path: "requestId",
          message: "Use the athlete's pending, unexpired request for this gym.",
        },
      ]);
    }
  }

  const [schedule, gym, [profile]] = await Promise.all([
    getSchedule(db, userId),
    getGym(db, userId, input.gymId),
    db
      .select({ preferredUnit: profiles.preferredUnit })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
  ]);
  if (!schedule) throw new PlanValidationError("No active programme.");
  const ref: SlotRef = input.slot;
  const day = schedule.days.find((d) => d.dayIndex === ref.dayIndex);
  const exists = allSlots(schedule.state).some(
    (s) => s.cycleIndex === ref.cycleIndex && s.dayIndex === ref.dayIndex,
  );
  if (!day || !exists || !(day.includesLifting || day.includesRun))
    throw new PlanValidationError("The slot is not a training day of the programme.");
  // A lifting day needs a gym with machines; a running day only needs somewhere to be.
  if (!gym || !gym.isActive || (day.includesLifting && gym.kind !== "gym"))
    throw new PlanValidationError("The gym is not one of the athlete's active locations.");
  if (slotStatus(schedule.state, ref) !== "pending")
    throw new PlanValidationError("The slot is no longer pending; plan the next one.");
  if (!day.includesLifting && plan.exercises.length > 0)
    throw new PlanValidationError("That day has no lifting, so it takes a run and nothing else.");
  if (!day.includesRun && plan.run)
    throw new PlanValidationError("That day has no run in the programme.");
  // The two halves of a day are answered separately, so a day whose run is still to come and
  // comes back without one is half a plan: the athlete is told what to lift and left to guess
  // the rest. A run already logged needs nothing more said about it.
  if (day.includesRun && !plan.run && !(await completedRunIdFor(db, schedule.program.id, ref)))
    throw new PlanValidationError("That day's run is still to come, so the plan needs a run.");

  const [daySlots, machines, visible, programRun] = await Promise.all([
    db
      .select({
        id: programExercises.id,
        lineageId: programExercises.lineageId,
        sets: programExercises.sets,
      })
      .from(programExercises)
      .where(eq(programExercises.programDayId, day.id)),
    db
      .select({
        id: equipmentInstances.id,
        name: equipmentInstances.name,
        unit: equipmentInstances.unit,
        loadIncrement: equipmentInstances.loadIncrement,
      })
      .from(equipmentInstances)
      .where(and(eq(equipmentInstances.gymId, gym.id), eq(equipmentInstances.isActive, true))),
    plan.exercises.length > 0
      ? db
          .select({
            id: exercises.id,
            slug: exercises.slug,
            name: exercises.name,
            loadPortability: exercises.loadPortability,
            defaultLoadIncrement: exercises.defaultLoadIncrement,
          })
          .from(exercises)
          .where(
            and(
              eq(exercises.isActive, true),
              inArray(
                exercises.slug,
                plan.exercises.map((e) => e.exerciseSlug),
              ),
            ),
          )
      : Promise.resolve([]),
    plan.run?.programRunId
      ? db
          .select({ id: programRuns.id })
          .from(programRuns)
          .where(
            and(
              eq(programRuns.id, plan.run.programRunId),
              eq(programRuns.programId, schedule.program.id),
              eq(programRuns.weekIndex, ref.cycleIndex),
              eq(programRuns.dayOfWeek, day.dayOfWeek ?? 0),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  const slotById = new Map(daySlots.map((slot) => [slot.id, slot]));
  const issues: { path: string; message: string }[] = [];
  if (plan.run?.programRunId && programRun.length === 0)
    issues.push({
      path: "run.programRunId",
      message: "That planned run does not belong to this occurrence.",
    });

  const stored: StoredPlanExercise[] = plan.exercises.map((entry, index) => {
    const exercise = visible.find((e) => e.slug === entry.exerciseSlug);
    if (!exercise)
      issues.push({
        path: `exercises.${index}.exerciseSlug`,
        message: `Unknown exercise "${entry.exerciseSlug}".`,
      });
    if (entry.slotId && !slotById.has(entry.slotId))
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
      unit: machine?.unit ?? (profile?.preferredUnit === "lb" ? "lb" : "kg"),
      slotLineageId: entry.slotId ? (slotById.get(entry.slotId)?.lineageId ?? null) : null,
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

  const warnings = await reviewStoredPlan(db, userId, {
    exercises: stored,
    run: plan.run,
    plannedSets: daySlots.reduce((total, slot) => total + slot.sets, 0),
    unchangedSets: daySlots.reduce((total, slot) => {
      const entry = stored.find((entry) => entry.slotId === slot.id);
      return (
        total + (!entry || (entry.action !== "drop" && entry.sets.length === 0) ? slot.sets : 0)
      );
    }, 0),
    machines,
    library: visible,
    unit: profile?.preferredUnit ?? "kg",
  });

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
      run: plan.run,
      warnings,
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
      .where(
        and(
          eq(coachRequests.id, input.requestId),
          eq(coachRequests.userId, userId),
          eq(coachRequests.status, "requested"),
        ),
      );
  }
  return row;
}

/**
 * Reads a validated plan against the loads that were last managed, so anything startling
 * travels with the plan and is shown beside it. Never blocks: the coach decides, the app
 * only says what it noticed.
 */
async function reviewStoredPlan(
  db: DbOrTx,
  userId: string,
  input: {
    exercises: readonly StoredPlanExercise[];
    run: PlanRun | null;
    plannedSets: number;
    unchangedSets: number;
    machines: readonly { id: string; loadIncrement: number | null; unit: string }[];
    library: readonly {
      id: string;
      slug: string;
      loadPortability: "global" | "equipment_specific" | "context_dependent";
      defaultLoadIncrement: number | null;
    }[];
    unit: string;
  },
): Promise<PlanWarning[]> {
  const doing = input.exercises.filter((entry) => entry.action !== "drop" && entry.exerciseId);
  const [histories, lastRun] = await Promise.all([
    doing.length > 0
      ? sessionHistories(
          db,
          doing.map((entry) => ({
            userId,
            exerciseId: entry.exerciseId,
            loadPortability:
              input.library.find((e) => e.id === entry.exerciseId)?.loadPortability ?? "global",
            equipmentInstanceId: entry.equipmentInstanceId,
            limit: 1,
          })),
        )
      : Promise.resolve([]),
    input.run
      ? db
          .select({ durationSeconds: runLogs.durationSeconds })
          .from(runLogs)
          .where(eq(runLogs.userId, userId))
          .orderBy(desc(runLogs.startedAt))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const review: ReviewExercise[] = doing.map((entry, index) => {
    const machine = input.machines.find((m) => m.id === entry.equipmentInstanceId);
    const library = input.library.find((e) => e.id === entry.exerciseId);
    const previous = histories[index]?.history[0];
    const weights = (previous?.sets ?? [])
      .filter((set) => set.setType !== "warmup" && set.weight !== null)
      .map((set) => set.weight as number);
    return {
      name: entry.exerciseName,
      entry,
      lastWorkingWeight: weights.length > 0 ? Math.max(...weights) : null,
      weightStep: weightStepFor({
        equipmentLoadIncrement: machine?.loadIncrement ?? null,
        exerciseDefaultIncrement: library?.defaultLoadIncrement ?? null,
      }),
      isStrengthCompound: STRENGTH_COMPOUND_SLUGS.has(entry.exerciseSlug),
      unit: machine?.unit ?? input.unit,
    };
  });
  return reviewPlan({
    exercises: [
      ...review,
      // Drops carry no targets but still count towards "how much of the day is left out".
      ...input.exercises
        .filter((entry) => entry.action === "drop")
        .map((entry) => ({
          name: entry.exerciseName,
          entry,
          lastWorkingWeight: null,
          weightStep: null,
          isStrengthCompound: false,
          unit: input.unit,
        })),
    ],
    plannedSets: input.plannedSets,
    unchangedSets: input.unchangedSets,
    run: {
      planned: input.run,
      lastDurationMinutes: lastRun[0] ? Math.round(lastRun[0].durationSeconds / 60) : null,
    },
  });
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

/**
 * Whether one of today's rows spends an ask.
 *
 * Only the athlete's own asks count: a nightly run, a plan the coach refreshes on its own and
 * the coach's record of what it tried are the system's work, and charging those to the athlete
 * would quietly take away asks they never made. Nor does an ask that never became a run — the
 * owner's allowance gone for the day, a routine that would not take the app's token — since
 * the athlete got nothing for it and the failure is the app's to explain, not theirs to pay
 * for. A run that started and then failed or timed out did happen, and is counted.
 */
function spendsAnAsk(request: {
  initiatedBy: CoachRequestInitiator;
  status: CoachRequestStatus;
  routineSessionId: string | null;
}): boolean {
  if (request.initiatedBy !== "athlete") return false;
  return !(request.status === "failed" && request.routineSessionId === null);
}

/** How many plans the athlete has asked for today, of the three a day they may have. */
export async function countRequestsToday(
  db: DbOrTx,
  userId: string,
  timeZone: string,
): Promise<number> {
  const rows = await db
    .select({
      initiatedBy: coachRequests.initiatedBy,
      status: coachRequests.status,
      routineSessionId: coachRequests.routineSessionId,
    })
    .from(coachRequests)
    .where(
      and(
        eq(coachRequests.userId, userId),
        eq(coachRequests.initiatedBy, "athlete"),
        gte(coachRequests.requestedAt, startOfToday(timeZone)),
      ),
    );
  return rows.filter(spendsAnAsk).length;
}

/** Records that the athlete asked for a plan. The caller fires the routine and reports back. */
export async function createCoachRequest(
  db: DbOrTx,
  userId: string,
  input: { gymId: string; reason: string | null; timeZone: string },
): Promise<CoachRequest> {
  await reconcileExpiredCoachRequests(db, userId);
  if ((await countRequestsToday(db, userId, input.timeZone)) >= REPLAN_DAILY_LIMIT)
    throw new CoachRequestLimitError();
  const [row] = await db
    .insert(coachRequests)
    .values({ userId, gymId: input.gymId, reason: input.reason, initiatedBy: "athlete" })
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

/**
 * Persist expired requests before reading waiting/failure state. Conditional updates make
 * repeated reconciliation safe and preserve a result that was already accepted. This never
 * dispatches a routine or retries work; the future batch reconciler can call the same helper.
 */
export async function reconcileExpiredCoachRequests(
  db: DbOrTx,
  userId: string,
  now = new Date(),
): Promise<number> {
  const expired = await db
    .update(coachRequests)
    .set({ status: "failed", error: REQUEST_TIMEOUT_MESSAGE, completedAt: now })
    .where(
      and(
        eq(coachRequests.userId, userId),
        eq(coachRequests.status, "requested"),
        lt(coachRequests.requestedAt, new Date(now.getTime() - REQUEST_TIMEOUT_MINUTES * 60_000)),
      ),
    )
    .returning({ id: coachRequests.id });
  return expired.length;
}

/** A pending re-plan. Reconcile with the same instant before assembling current status. */
export async function pendingRequest(
  db: DbOrTx,
  userId: string,
  now = new Date(),
): Promise<CoachRequest | null> {
  const since = new Date(now.getTime() - REQUEST_TIMEOUT_MINUTES * 60_000);
  const [row] = await db
    .select()
    .from(coachRequests)
    .where(
      and(
        eq(coachRequests.userId, userId),
        eq(coachRequests.trigger, "replan"),
        eq(coachRequests.status, "requested"),
        gte(coachRequests.requestedAt, since),
      ),
    )
    .orderBy(desc(coachRequests.requestedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Records what happened when the coach tried to plan for this athlete.
 *
 * A re-plan already leaves a row when the athlete asks for one. A nightly run left nothing at
 * all, so a night the coach could not plan looked exactly like a night it was never asked:
 * Today simply had no plan and said nothing. Every attempt now lands here, and the failures
 * are what Settings and Today can point at.
 */
export async function recordAttempt(
  db: DbOrTx,
  userId: string,
  input: {
    trigger: PlanTrigger;
    gymId?: string | null;
    status: "planned" | "failed";
    error?: string | null;
    routineSessionId?: string | null;
    routineSessionUrl?: string | null;
  },
): Promise<CoachRequest> {
  const [row] = await db
    .insert(coachRequests)
    .values({
      userId,
      gymId: input.gymId ?? null,
      trigger: input.trigger,
      // The coach's own record of a run it made. Never the athlete's ask, so it never counts
      // against their daily allowance, whichever kind of planning it was.
      initiatedBy: "coach",
      status: input.status,
      error: input.error?.slice(0, 500) ?? null,
      routineSessionId: input.routineSessionId ?? null,
      routineSessionUrl: input.routineSessionUrl ?? null,
      completedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Attempt insert returned no row");
  return row;
}

/** Everything the coach has tried lately, newest first, for the AI coach screen. */
export async function recentAttempts(
  db: DbOrTx,
  userId: string,
  limit = 10,
): Promise<(CoachRequest & { gymName: string | null })[]> {
  const rows = await db
    .select({ request: coachRequests, gymName: gyms.name })
    .from(coachRequests)
    .leftJoin(gyms, eq(gyms.id, coachRequests.gymId))
    .where(eq(coachRequests.userId, userId))
    .orderBy(desc(coachRequests.requestedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.request, gymName: row.gymName }));
}

/**
 * The last failure, when nothing has succeeded since. This is what Today shows instead of
 * silence when the coach could not plan.
 */
export async function lastFailure(db: DbOrTx, userId: string): Promise<CoachRequest | null> {
  const [row] = await db
    .select()
    .from(coachRequests)
    .where(and(eq(coachRequests.userId, userId), ne(coachRequests.status, "requested")))
    .orderBy(desc(coachRequests.requestedAt))
    .limit(1);
  return row && row.status === "failed" ? row : null;
}

/**
 * Drops the plan waiting for a slot that has just been skipped or marked done. Without this
 * a plan for a slot nobody will train stays active forever, and the unique index would keep
 * a later plan for the same slot out.
 */
export async function voidPlanForSlot(
  db: DbOrTx,
  userId: string,
  programId: string,
  ref: SlotRef,
): Promise<void> {
  await db
    .update(sessionPlans)
    .set({ status: "void" })
    .where(
      and(
        eq(sessionPlans.userId, userId),
        eq(sessionPlans.programId, programId),
        eq(sessionPlans.cycleIndex, ref.cycleIndex),
        eq(sessionPlans.dayIndex, ref.dayIndex),
        eq(sessionPlans.status, "active"),
      ),
    );
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
  /** The last thing the coach tried, when it failed and nothing has succeeded since. */
  failure: CoachRequest | null;
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
  const now = new Date();
  await reconcileExpiredCoachRequests(db, userId, now);
  const since = new Date(now.getTime() - REQUEST_TIMEOUT_MINUTES * 60_000);
  const dayStart = startOfToday(input.timeZone);
  const pendingFilter = and(
    eq(coachRequests.trigger, "replan"),
    eq(coachRequests.status, "requested"),
    gte(coachRequests.requestedAt, since),
  );
  const latestOutcome = db
    .select({ id: coachRequests.id })
    .from(coachRequests)
    .where(and(eq(coachRequests.userId, userId), ne(coachRequests.status, "requested")))
    .orderBy(desc(coachRequests.requestedAt))
    .limit(1);
  // One joined plan read and one bounded request read replace five statements. Requests
  // contain today's quota, any pending re-plan spanning midnight, and the latest outcome.
  const [[planRow], requests] = await Promise.all([
    db
      .select({ plan: sessionPlans, gymName: gyms.name })
      .from(sessionPlans)
      .leftJoin(gyms, eq(gyms.id, sessionPlans.gymId))
      .leftJoin(workoutSessions, eq(workoutSessions.id, sessionPlans.workoutSessionId))
      .where(
        and(
          eq(sessionPlans.userId, userId),
          eq(sessionPlans.programId, input.programId),
          eq(sessionPlans.cycleIndex, input.ref.cycleIndex),
          eq(sessionPlans.dayIndex, input.ref.dayIndex),
          or(
            eq(sessionPlans.status, "active"),
            and(
              eq(sessionPlans.status, "consumed"),
              isNull(workoutSessions.completedAt),
              sql`${workoutSessions.id} is not null`,
            ),
          ),
        ),
      )
      // A plan that arrived after the session started cannot be the one being trained, and the
      // athlete is mid-workout: show them what they are actually doing, newest otherwise.
      .orderBy(
        sql`case when ${sessionPlans.status} = 'consumed' then 0 else 1 end`,
        desc(sessionPlans.generatedAt),
      )
      .limit(1),
    db
      .select()
      .from(coachRequests)
      .where(
        and(
          eq(coachRequests.userId, userId),
          or(
            and(eq(coachRequests.initiatedBy, "athlete"), gte(coachRequests.requestedAt, dayStart)),
            pendingFilter,
            inArray(coachRequests.id, latestOutcome),
          ),
        ),
      )
      .orderBy(desc(coachRequests.requestedAt)),
  ]);
  const plan = planRow?.plan ?? null;
  const pending =
    requests.find(
      (request) =>
        request.trigger === "replan" &&
        request.status === "requested" &&
        request.requestedAt >= since,
    ) ?? null;
  const used = requests.filter(
    (request) => request.requestedAt >= dayStart && spendsAnAsk(request),
  ).length;
  const outcome = requests.find((request) => request.status !== "requested");
  const failure = outcome?.status === "failed" ? outcome : null;
  return {
    enabled: input.enabled,
    plan: plan ? { ...plan, gymName: planRow?.gymName ?? "another gym" } : null,
    matchesGym: plan !== null && input.gymId !== null && plan.gymId === input.gymId,
    pending,
    failure: plan === null && pending === null ? failure : null,
    requestsLeft: Math.max(0, REPLAN_DAILY_LIMIT - used),
  };
}

export type PlannedRunToday = {
  planId: string;
  run: PlanRun;
  summary: string;
  /** The day the run belongs to, so the log screen can say which one it is. */
  dayName: string;
};

/**
 * The run the coach planned for the next training slot, for the screen that logs one. The
 * plan is not consumed by logging a run: a run day usually lifts as well, and the lifting
 * session is what uses the plan.
 */
export async function plannedRunForToday(
  db: DbOrTx,
  userId: string,
  knownSchedule?: Schedule | null,
): Promise<PlannedRunToday | null> {
  const schedule = knownSchedule === undefined ? await getSchedule(db, userId) : knownSchedule;
  if (!schedule) return null;
  const slot = nextTrainingSlot(schedule);
  if (!slot || !slot.day.includesRun) return null;
  const plan = await activePlanForSlot(db, userId, schedule.program.id, slot);
  if (!plan?.run) return null;
  return { planId: plan.id, run: plan.run, summary: plan.summary, dayName: slot.day.name };
}

/**
 * Moves the coach's waiting plans onto the version of the programme that has just replaced
 * theirs.
 *
 * A revision rewrites every slot, so a plan written against the old rows names ids that no
 * longer exist. It is still the plan the athlete was given for today, though, and approving a
 * change to next week is no reason to lose it: each slot keeps its lineage across versions, so
 * the plan is re-pointed by lineage rather than thrown away.
 *
 * What the change itself touched is the exception. A slot the patch adjusted, substituted or
 * removed follows the new programme instead — the athlete approved those numbers a moment ago,
 * and the plan was written against the old ones. The same goes for a run the patch retargeted.
 * A plan left with nothing of its own to say is voided, as it was before.
 */
export async function carryPlansToRevision(
  db: DbOrTx,
  userId: string,
  input: { fromProgramId: string; toProgramId: string; patch: ProgramPatch },
): Promise<void> {
  const plans = await db
    .select()
    .from(sessionPlans)
    .where(
      and(
        eq(sessionPlans.userId, userId),
        eq(sessionPlans.programId, input.fromProgramId),
        eq(sessionPlans.status, "active"),
      ),
    );
  if (plans.length === 0) return;

  const changed = new Set(
    input.patch.operations.flatMap((operation) =>
      "lineageId" in operation ? [operation.lineageId] : [],
    ),
  );
  const retargetedRuns = new Set(
    input.patch.operations.flatMap((operation) =>
      operation.op === "run" ? [`${operation.weekIndex}:${operation.dayOfWeek}`] : [],
    ),
  );
  const [days, slots, oldRuns, newRuns] = await Promise.all([
    db
      .select({ id: programDays.id, dayIndex: programDays.dayIndex })
      .from(programDays)
      .where(eq(programDays.programId, input.toProgramId)),
    db
      .select({ id: programExercises.id, lineageId: programExercises.lineageId })
      .from(programExercises)
      .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
      .where(eq(programDays.programId, input.toProgramId)),
    db
      .select({ id: programRuns.id, week: programRuns.weekIndex, day: programRuns.dayOfWeek })
      .from(programRuns)
      .where(eq(programRuns.programId, input.fromProgramId)),
    db
      .select({ id: programRuns.id, week: programRuns.weekIndex, day: programRuns.dayOfWeek })
      .from(programRuns)
      .where(eq(programRuns.programId, input.toProgramId)),
  ]);
  const dayByIndex = new Map(days.map((day) => [day.dayIndex, day.id]));
  const slotByLineage = new Map(slots.map((slot) => [slot.lineageId, slot.id]));
  const occurrenceOfOldRun = new Map(oldRuns.map((run) => [run.id, `${run.week}:${run.day}`]));
  const newRunByOccurrence = new Map(newRuns.map((run) => [`${run.week}:${run.day}`, run.id]));

  for (const plan of plans) {
    const programDayId = dayByIndex.get(plan.dayIndex);
    const exercises = programDayId
      ? plan.exercises.flatMap((entry) => {
          if (entry.slotId === null) return [entry];
          const lineageId = entry.slotLineageId;
          if (lineageId === null || changed.has(lineageId)) return [];
          const slotId = slotByLineage.get(lineageId);
          return slotId ? [{ ...entry, slotId }] : [];
        })
      : [];
    const occurrence = plan.run?.programRunId
      ? occurrenceOfOldRun.get(plan.run.programRunId)
      : undefined;
    const run =
      plan.run === null || !programDayId
        ? null
        : plan.run.programRunId === null
          ? plan.run
          : occurrence && !retargetedRuns.has(occurrence)
            ? { ...plan.run, programRunId: newRunByOccurrence.get(occurrence) ?? null }
            : null;
    if (!programDayId || (exercises.length === 0 && run === null)) {
      await db.update(sessionPlans).set({ status: "void" }).where(eq(sessionPlans.id, plan.id));
      continue;
    }
    await db
      .update(sessionPlans)
      .set({ programId: input.toProgramId, programDayId, exercises, run })
      .where(eq(sessionPlans.id, plan.id));
  }
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
