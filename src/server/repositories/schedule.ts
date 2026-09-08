import { and, asc, eq } from "drizzle-orm";

import {
  exercises,
  programDays,
  programExercises,
  programRuns,
  programSlotEvents,
  programs,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  allSlots,
  nextPendingSlot,
  progress,
  projectedEndDate,
  sessionsBehind,
  slotFor,
  slotStatus,
  suggestion,
  type Progress,
  type ScheduleState,
  type SlotRef,
  type SlotStatus,
  type Suggestion,
} from "@/domain/schedule";
import type { PrescriptionType } from "@/domain/types";

export type ActiveProgram = {
  id: string;
  name: string;
  slug: string;
  startDate: string | null;
  weeks: number;
  startDayIndex: number;
};

export async function getActiveProgram(db: DbOrTx, userId: string): Promise<ActiveProgram | null> {
  const [row] = await db
    .select({
      id: programs.id,
      name: programs.name,
      slug: programs.slug,
      startDate: programs.startDate,
      weeks: programs.weeks,
      startDayIndex: programs.startDayIndex,
    })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  if (!row) return null;
  return { ...row, weeks: row.weeks ?? 8 };
}

export type ScheduleDay = {
  id: string;
  dayIndex: number;
  name: string;
  focus: string | null;
  includesLifting: boolean;
  includesRun: boolean;
  timeNote: string | null;
  effortNote: string | null;
  notes: string | null;
  warmupProtocolId: string | null;
};

export type Schedule = {
  program: ActiveProgram;
  days: ScheduleDay[];
  state: ScheduleState;
};

export async function getSchedule(db: DbOrTx, userId: string): Promise<Schedule | null> {
  const program = await getActiveProgram(db, userId);
  if (!program) return null;
  const days = await db
    .select({
      id: programDays.id,
      dayIndex: programDays.dayIndex,
      name: programDays.name,
      focus: programDays.focus,
      includesLifting: programDays.includesLifting,
      includesRun: programDays.includesRun,
      timeNote: programDays.timeNote,
      effortNote: programDays.effortNote,
      notes: programDays.notes,
      warmupProtocolId: programDays.warmupProtocolId,
    })
    .from(programDays)
    .where(eq(programDays.programId, program.id))
    .orderBy(asc(programDays.dayIndex));
  const events = await db
    .select({
      cycleIndex: programSlotEvents.cycleIndex,
      dayIndex: programSlotEvents.dayIndex,
      status: programSlotEvents.status,
    })
    .from(programSlotEvents)
    .where(eq(programSlotEvents.programId, program.id));
  return {
    program,
    days,
    state: {
      slots: days.map((d) => ({
        dayIndex: d.dayIndex,
        name: d.name,
        isRest: !d.includesLifting && !d.includesRun,
      })),
      cycles: program.weeks,
      startDayIndex: program.startDayIndex,
      events,
    },
  };
}

/** Records what happened to a slot. Returns false when the slot already had an event. */
export async function recordSlotEvent(
  db: DbOrTx,
  userId: string,
  programId: string,
  ref: SlotRef,
  status: SlotStatus,
  details: { occurredOn: string; workoutSessionId?: string | null; note?: string | null },
): Promise<boolean> {
  const inserted = await db
    .insert(programSlotEvents)
    .values({
      userId,
      programId,
      cycleIndex: ref.cycleIndex,
      dayIndex: ref.dayIndex,
      status,
      workoutSessionId: details.workoutSessionId ?? null,
      occurredOn: details.occurredOn,
      note: details.note ?? null,
    })
    .onConflictDoNothing({
      target: [
        programSlotEvents.programId,
        programSlotEvents.cycleIndex,
        programSlotEvents.dayIndex,
      ],
    })
    .returning({ id: programSlotEvents.id });
  return inserted.length > 0;
}

/** Completes every pending rest slot that comes before `ref` in the sequence. */
export async function completeRestSlotsBefore(
  db: DbOrTx,
  userId: string,
  schedule: Schedule,
  ref: SlotRef,
  occurredOn: string,
): Promise<number> {
  let count = 0;
  for (const candidate of allSlots(schedule.state)) {
    if (candidate.cycleIndex === ref.cycleIndex && candidate.dayIndex === ref.dayIndex) break;
    if (
      candidate.cycleIndex > ref.cycleIndex ||
      (candidate.cycleIndex === ref.cycleIndex && candidate.dayIndex > ref.dayIndex)
    ) {
      break;
    }
    const slot = slotFor(schedule.state, candidate);
    if (!slot?.isRest || slotStatus(schedule.state, candidate) !== "pending") continue;
    const inserted = await recordSlotEvent(
      db,
      userId,
      schedule.program.id,
      candidate,
      "completed",
      {
        occurredOn,
        note: "Rest day passed",
      },
    );
    if (inserted) count += 1;
  }
  return count;
}

/** The earliest cycle in which `dayIndex` is still pending, or null when none is. */
export function pendingCycleForDay(state: ScheduleState, dayIndex: number): number | null {
  for (const ref of allSlots(state)) {
    if (ref.dayIndex === dayIndex && slotStatus(state, ref) === "pending") return ref.cycleIndex;
  }
  return null;
}

export type PlannedExercisePreview = {
  programExerciseId: string;
  exerciseId: string;
  name: string;
  sets: number;
  prescriptionType: PrescriptionType;
  repMin: number | null;
  repMax: number | null;
  durationMinSeconds: number | null;
  durationMaxSeconds: number | null;
  perSide: boolean;
  rirMin: number | null;
  rirMax: number | null;
  supersetGroup: string | null;
};

export async function listDayExercises(
  db: DbOrTx,
  programDayId: string,
): Promise<PlannedExercisePreview[]> {
  return db
    .select({
      programExerciseId: programExercises.id,
      exerciseId: exercises.id,
      name: exercises.name,
      sets: programExercises.sets,
      prescriptionType: programExercises.prescriptionType,
      repMin: programExercises.repMin,
      repMax: programExercises.repMax,
      durationMinSeconds: programExercises.durationMinSeconds,
      durationMaxSeconds: programExercises.durationMaxSeconds,
      perSide: programExercises.perSide,
      rirMin: programExercises.rirMin,
      rirMax: programExercises.rirMax,
      supersetGroup: programExercises.supersetGroup,
    })
    .from(programExercises)
    .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
    .where(eq(programExercises.programDayId, programDayId))
    .orderBy(asc(programExercises.orderIndex));
}

export type RunTarget = {
  durationMinMinutes: number;
  durationMaxMinutes: number;
  rpeMin: number | null;
  rpeMax: number | null;
  paceNote: string | null;
  progressionNote: string | null;
  shinRule: string | null;
  comment: string | null;
};

export async function getRunTarget(
  db: DbOrTx,
  programId: string,
  cycleIndex: number,
  dayOfWeek: number,
): Promise<RunTarget | null> {
  const [row] = await db
    .select({
      durationMinMinutes: programRuns.durationMinMinutes,
      durationMaxMinutes: programRuns.durationMaxMinutes,
      rpeMin: programRuns.rpeMin,
      rpeMax: programRuns.rpeMax,
      paceNote: programRuns.paceNote,
      progressionNote: programRuns.progressionNote,
      shinRule: programRuns.shinRule,
      comment: programRuns.comment,
    })
    .from(programRuns)
    .where(
      and(
        eq(programRuns.programId, programId),
        eq(programRuns.weekIndex, cycleIndex),
        eq(programRuns.dayOfWeek, dayOfWeek),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type DayStatus = {
  day: ScheduleDay;
  cycleIndex: number;
  status: SlotStatus | "pending" | "not_in_programme";
};

export type TodayPlan = {
  program: ActiveProgram;
  today: string;
  progress: Progress;
  behind: number;
  projectedEnd: string | null;
  /** null once the programme is complete. */
  suggestion: Suggestion | null;
  suggestedDay: ScheduleDay | null;
  suggestedExercises: PlannedExercisePreview[];
  /** The training day offered when the suggested slot is a rest day. */
  nextTrainingDay: (ScheduleDay & { cycleIndex: number }) | null;
  runTarget: RunTarget | null;
  /** Every day of the current cycle with its status, for "choose another day". */
  cycleDays: DayStatus[];
};

/** Everything the Today screen needs to show the planned day. */
export async function getTodayPlan(
  db: DbOrTx,
  userId: string,
  timeZone: string,
): Promise<TodayPlan | null> {
  const schedule = await getSchedule(db, userId);
  if (!schedule) return null;
  const today = todayInTimeZone(timeZone);
  const state = schedule.state;
  const next = suggestion(state);
  const suggestedDay = next
    ? (schedule.days.find((d) => d.dayIndex === next.slot.dayIndex) ?? null)
    : null;
  const suggestedExercises = suggestedDay ? await listDayExercises(db, suggestedDay.id) : [];
  const nextTrainingRef = next?.nextTrainingSlot ?? null;
  const nextTrainingDay = nextTrainingRef
    ? (schedule.days.find((d) => d.dayIndex === nextTrainingRef.dayIndex) ?? null)
    : null;
  const currentCycle = next?.slot.cycleIndex ?? nextPendingSlot(state)?.cycleIndex ?? state.cycles;
  const runTarget =
    next && suggestedDay?.includesRun
      ? await getRunTarget(
          db,
          schedule.program.id,
          next.slot.cycleIndex,
          await dayOfWeekFor(db, suggestedDay.id),
        )
      : null;
  const cycleDays: DayStatus[] = schedule.days.map((day) => {
    const ref = { cycleIndex: currentCycle, dayIndex: day.dayIndex };
    const exists = allSlots(state).some(
      (s) => s.cycleIndex === ref.cycleIndex && s.dayIndex === ref.dayIndex,
    );
    return {
      day,
      cycleIndex: currentCycle,
      status: exists ? slotStatus(state, ref) : "not_in_programme",
    };
  });
  const startDate = schedule.program.startDate ?? today;
  return {
    program: schedule.program,
    today,
    progress: progress(state),
    behind: sessionsBehind(state, startDate, today),
    projectedEnd: projectedEndDate(state, today),
    suggestion: next,
    suggestedDay,
    suggestedExercises,
    nextTrainingDay:
      nextTrainingDay && nextTrainingRef
        ? { ...nextTrainingDay, cycleIndex: nextTrainingRef.cycleIndex }
        : null,
    runTarget,
    cycleDays,
  };
}

async function dayOfWeekFor(db: DbOrTx, programDayId: string): Promise<number> {
  const [row] = await db
    .select({ dayOfWeek: programDays.dayOfWeek })
    .from(programDays)
    .where(eq(programDays.id, programDayId))
    .limit(1);
  return row?.dayOfWeek ?? 0;
}
