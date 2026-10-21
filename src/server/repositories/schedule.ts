import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { exercises, programExercises, programRuns, programSlotEvents, programs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ActivitySport } from "@/domain/activity";
import { cycleCount } from "@/domain/cycle-repeat";
import type { PrintedSession } from "@/domain/session-print";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  allSlots,
  finishedOn,
  isRestSlot,
  missedSlots,
  nextPendingSlot,
  partStatus,
  pendingParts,
  pickUpFromToday,
  progress,
  projectedEndDate,
  sessionsBehind,
  slotFinishedOn,
  slotFor,
  slotParts,
  slotStatus,
  suggestion,
  type Progress,
  type ScheduleState,
  type SlotEvent,
  type SlotRef,
  type SlotStatus,
  type Suggestion,
} from "@/domain/schedule";
import type { CycleRepeat, ExerciseModality, PrescriptionType, SlotPart } from "@/domain/types";
import { sharedWarmupProtocols } from "@/server/queries/reference";

import { skipSlotOccurrences } from "./occurrences";
import { readSlotPrints } from "./session-prints";

export type ActiveProgram = {
  splitFromProgramId?: string | null;
  id: string;
  sport?: ActivitySport;
  /** The lineage across versions: what an occurrence belongs to, rather than one version. */
  familyId: string;
  name: string;
  slug: string;
  startDate: string | null;
  endDate: string | null;
  weeks: number;
  /** How the cycle repeats; null for a programme that predates the choice. */
  repeats: CycleRepeat | null;
  /** How many cycles the weeks hold: "Cycle 3 of 14". */
  cycles: number;
  startDayIndex: number;
  notes: string | null;
};

export async function getActiveProgram(
  db: DbOrTx,
  userId: string,
  sport: ActivitySport = "strength",
): Promise<ActiveProgram | null> {
  const [row] = await db
    .select({
      id: programs.id,
      sport: programs.sport,
      splitFromProgramId: programs.splitFromProgramId,
      familyId: programs.familyId,
      name: programs.name,
      slug: programs.slug,
      startDate: programs.startDate,
      endDate: programs.endDate,
      weeks: programs.weeks,
      repeats: programs.repeats,
      startDayIndex: programs.startDayIndex,
      notes: programs.notes,
      dayCount: sql<number>`(select count(*)::int from program_days d where d.program_id = programs.id)`,
    })
    .from(programs)
    .where(
      and(eq(programs.userId, userId), eq(programs.sport, sport), eq(programs.status, "active")),
    )
    .limit(1);
  if (!row) return null;
  const { dayCount, ...program } = row;
  const weeks = row.weeks ?? 8;
  return {
    ...program,
    weeks,
    cycles: row.sport === "strength" ? cycleCount(weeks, dayCount, row.repeats) : weeks,
  };
}

export type ScheduleDay = {
  id: string;
  dayOfWeek: number | null;
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
  /**
   * The days "Pick up from today" skipped, rather than the athlete one at a time, which Plan's
   * week stands where the calendar put them (ADR 0058). Absent from a schedule built by hand.
   */
  pickedUp?: SlotRef[];
};

/** The note "Pick up from today" leaves on each day it skips (ADR 0051). */
export const PICKED_UP_FROM_TODAY = "Picked up from today";

/**
 * The active programme with its days and slot events, in one statement. The days and events
 * come back as JSON built by Postgres, so nothing waits for the programme id to come back before
 * asking for them. Row Level Security applies inside the subqueries exactly as it would outside.
 */
export async function getSchedule(
  db: DbOrTx,
  userId: string,
  sport: ActivitySport = "strength",
): Promise<Schedule | null> {
  const [row] = await db
    .select({
      id: programs.id,
      sport: programs.sport,
      familyId: programs.familyId,
      name: programs.name,
      slug: programs.slug,
      startDate: programs.startDate,
      endDate: programs.endDate,
      weeks: programs.weeks,
      repeats: programs.repeats,
      startDayIndex: programs.startDayIndex,
      notes: programs.notes,
      // Plain SQL on purpose: inside a select list Drizzle drops table qualifiers (see listGyms).
      days: sql<ScheduleDay[]>`coalesce((
        select json_agg(json_build_object(
          'id', d.id,
          'dayOfWeek', d.day_of_week,
          'dayIndex', d.day_index,
          'name', d.name,
          'focus', d.focus,
          'includesLifting', d.includes_lifting,
          'includesRun', d.includes_run,
          'timeNote', d.time_note,
          'effortNote', d.effort_note,
          'notes', d.notes,
          'warmupProtocolId', d.warmup_protocol_id
        ) order by d.day_index)
        from program_days d where d.program_id = programs.id
      ), '[]'::json)`,
      events: sql<SlotEvent[]>`coalesce((
        select json_agg(json_build_object(
          'cycleIndex', e.cycle_index,
          'dayIndex', e.day_index,
          'part', e.part,
          'status', e.status,
          'occurredOn', e.occurred_on
        ))
        from program_slot_events e where e.program_id = programs.id
      ), '[]'::json)`,
      pickedUp: sql<SlotRef[]>`coalesce((
        select json_agg(json_build_object('cycleIndex', e.cycle_index, 'dayIndex', e.day_index))
        from program_slot_events e
        where e.program_id = programs.id and e.part = 'session' and e.status = 'skipped'
          and e.note = ${PICKED_UP_FROM_TODAY}
      ), '[]'::json)`,
    })
    .from(programs)
    .where(
      and(eq(programs.userId, userId), eq(programs.sport, sport), eq(programs.status, "active")),
    )
    .limit(1);
  if (!row) return null;
  const program: ActiveProgram = {
    id: row.id,
    sport: row.sport,
    familyId: row.familyId,
    name: row.name,
    slug: row.slug,
    startDate: row.startDate,
    endDate: row.endDate,
    weeks: row.weeks ?? 8,
    repeats: row.repeats,
    cycles: cycleCount(row.weeks ?? 8, row.days.length, row.repeats),
    startDayIndex: row.startDayIndex,
    notes: row.notes,
  };
  return {
    program,
    days: row.days.map((day) => ({ ...day, includesRun: false })),
    state: {
      slots: row.days.map((d) => ({
        dayIndex: d.dayIndex,
        name: d.name,
        includesLifting: d.includesLifting,
        includesRun: false,
        dayOfWeek: d.dayOfWeek,
      })),
      cycles: program.cycles,
      repeats: program.repeats,
      startDayIndex: program.startDayIndex,
      events: row.events.filter((event) => event.part === "session"),
    },
    pickedUp: row.pickedUp,
  };
}

/** Where a slot's part is answered: one event each, for good. */
const SLOT_PART = [
  programSlotEvents.programId,
  programSlotEvents.cycleIndex,
  programSlotEvents.dayIndex,
  programSlotEvents.part,
];

/**
 * Records what happened to one part of a slot: the workout, or the run. Returns false when
 * that part already had an answer that stands, so finishing a session twice, or logging a
 * second run against one planned run, changes nothing.
 *
 * A skip is the one answer that gives way, and only to a completion: a day trained after all
 * was done. That is how a skipped day picked from "Train another day" is recorded once its
 * workout is finished. Nothing is taken back when the workout starts, so one discarded before
 * a set leaves the day skipped, with the reason given for skipping it, rather than putting it
 * back in front of the sequence.
 */
export async function recordSlotEvent(
  db: DbOrTx,
  userId: string,
  programId: string,
  ref: SlotRef,
  part: SlotPart,
  status: SlotStatus,
  details: {
    occurredOn: string;
    workoutSessionId?: string | null;
    runId?: string | null;
    note?: string | null;
  },
): Promise<boolean> {
  const answer = {
    status,
    workoutSessionId: details.workoutSessionId ?? null,
    runId: details.runId ?? null,
    occurredOn: details.occurredOn,
    note: details.note ?? null,
  };
  const insert = db.insert(programSlotEvents).values({
    userId,
    programId,
    cycleIndex: ref.cycleIndex,
    dayIndex: ref.dayIndex,
    part,
    ...answer,
  });
  const written = await (
    status === "completed"
      ? insert.onConflictDoUpdate({
          target: SLOT_PART,
          set: answer,
          setWhere: eq(programSlotEvents.status, "skipped"),
        })
      : insert.onConflictDoNothing({ target: SLOT_PART })
  ).returning({ id: programSlotEvents.id });
  return written.length > 0;
}

/**
 * Skips one half of a slot on purpose, from Today or "Pick up from today": the workout, or the
 * run (owner, 12 October 2026).
 *
 * A day's run is answered on its occurrences, not beside them (`withDerivedRunEvents`), so
 * skipping it skips each of its sessions still owed: Skipped on Today, on the programme and in
 * the coach's adherence alike, never owed in one and skipped in another. Each can still be
 * logged, which replaces the skip on the day too. Only a day whose run has no occurrence at
 * all, from before occurrences, records the skip on the day itself. The workout half has no
 * occurrence, and skipping it never touches the day's run.
 */
export async function skipSlotPart(
  db: DbOrTx,
  userId: string,
  program: Pick<ActiveProgram, "id" | "familyId">,
  ref: SlotRef,
  part: SlotPart,
  details: { occurredOn: string; note?: string | null },
): Promise<void> {
  if (part === "run") {
    const skipped = await skipSlotOccurrences(
      db,
      userId,
      { familyId: program.familyId, cycleIndex: ref.cycleIndex, cycleDayIndex: ref.dayIndex },
      details,
    );
    if (skipped !== null) return;
  }
  await recordSlotEvent(db, userId, program.id, ref, part, "skipped", details);
}

/**
 * Takes back the skip on a slot's session, so the day is owed again.
 *
 * Training a skipped day does not need it: finishing its workout replaces the skip (see
 * `recordSlotEvent`), and the app no longer takes the skip back when such a workout starts.
 */
export async function reopenSkippedSession(
  db: DbOrTx,
  userId: string,
  programId: string,
  ref: SlotRef,
): Promise<void> {
  await db
    .delete(programSlotEvents)
    .where(
      and(
        eq(programSlotEvents.userId, userId),
        eq(programSlotEvents.programId, programId),
        eq(programSlotEvents.cycleIndex, ref.cycleIndex),
        eq(programSlotEvents.dayIndex, ref.dayIndex),
        eq(programSlotEvents.part, "session"),
        eq(programSlotEvents.status, "skipped"),
      ),
    );
}

/**
 * The note on a rest day a workout's start passed. It names the workout, which is what lets a
 * discard give back exactly the rest days that start passed and no others: nothing else ties a
 * rest day's event to a session, and `workout_session_id` is kept for the slot a session trained.
 */
function restPassedBy(sessionId: string): string {
  return `Rest day passed by workout ${sessionId}`;
}

/**
 * Completes every pending rest slot that comes before `ref` in the sequence, in one statement.
 * `passedBy` is the workout whose start passes them, so that discarding it can give them back.
 */
export async function completeRestSlotsBefore(
  db: DbOrTx,
  userId: string,
  schedule: Schedule,
  ref: SlotRef,
  occurredOn: string,
  passedBy?: string,
): Promise<number> {
  const pendingRest: SlotRef[] = [];
  for (const candidate of allSlots(schedule.state)) {
    if (candidate.cycleIndex === ref.cycleIndex && candidate.dayIndex === ref.dayIndex) break;
    if (
      candidate.cycleIndex > ref.cycleIndex ||
      (candidate.cycleIndex === ref.cycleIndex && candidate.dayIndex > ref.dayIndex)
    ) {
      break;
    }
    const slot = slotFor(schedule.state, candidate);
    if (!slot || !isRestSlot(slot) || slotStatus(schedule.state, candidate) !== "pending") continue;
    pendingRest.push(candidate);
  }
  if (pendingRest.length === 0) return 0;
  const inserted = await db
    .insert(programSlotEvents)
    .values(
      pendingRest.map((slot) => ({
        userId,
        programId: schedule.program.id,
        cycleIndex: slot.cycleIndex,
        dayIndex: slot.dayIndex,
        part: "session" as const,
        status: "completed" as const,
        workoutSessionId: null,
        occurredOn,
        note: passedBy ? restPassedBy(passedBy) : "Rest day passed",
      })),
    )
    .onConflictDoNothing({ target: SLOT_PART })
    .returning({ id: programSlotEvents.id });
  return inserted.length;
}

/**
 * Gives back the rest days a workout's start passed, when that workout is discarded before
 * anything was trained: they were passed only because it was about to be, so without it they
 * are as they were. Looked for in every version of the athlete's programmes, so a revision that
 * copied them onto a new version gives those copies back too.
 */
export async function returnRestDaysPassedBy(
  db: DbOrTx,
  userId: string,
  sessionId: string,
): Promise<void> {
  await db.delete(programSlotEvents).where(
    and(
      eq(programSlotEvents.userId, userId),
      // By programme, so the slot index is what finds them rather than a scan of every event.
      inArray(
        programSlotEvents.programId,
        db.select({ id: programs.id }).from(programs).where(eq(programs.userId, userId)),
      ),
      eq(programSlotEvents.part, "session"),
      eq(programSlotEvents.status, "completed"),
      eq(programSlotEvents.note, restPassedBy(sessionId)),
    ),
  );
}

/**
 * The earliest cycle in which `dayIndex` still has something to do, or null when none has.
 * Narrow it to one part to answer for that half of the day alone — skipping the run of a day
 * whose workout is already logged has to find that same day, not the next cycle's.
 */
export function pendingCycleForDay(
  state: ScheduleState,
  dayIndex: number,
  part?: SlotPart,
): number | null {
  for (const ref of allSlots(state)) {
    if (ref.dayIndex !== dayIndex) continue;
    if (part === undefined) {
      if (pendingParts(state, ref).length > 0) return ref.cycleIndex;
      continue;
    }
    // The part has to be one the day actually asks for: a day that only runs is never
    // answered by a session event, however pending that event would otherwise look.
    const slot = slotFor(state, ref);
    if (!slot || !slotParts(slot).includes(part)) continue;
    if (partStatus(state, ref, part) === "pending") return ref.cycleIndex;
  }
  return null;
}

export type PlannedExercisePreview = {
  programExerciseId: string;
  exerciseId: string;
  name: string;
  /** What the movement is done with, for the equipment's glyph; null when it is not known. */
  modality: ExerciseModality | null;
  sets: number;
  prescriptionType: PrescriptionType;
  repMin: number | null;
  repMax: number | null;
  durationMinSeconds: number | null;
  durationMaxSeconds: number | null;
  distanceMinMeters: number | null;
  distanceMaxMeters: number | null;
  perSide: boolean;
  rirMin: number | null;
  rirMax: number | null;
  supersetGroup: string | null;
};

function plannedExerciseSelection() {
  return {
    programExerciseId: programExercises.id,
    exerciseId: exercises.id,
    name: exercises.name,
    modality: exercises.modality,
    sets: programExercises.sets,
    prescriptionType: programExercises.prescriptionType,
    repMin: programExercises.repMin,
    repMax: programExercises.repMax,
    durationMinSeconds: programExercises.durationMinSeconds,
    durationMaxSeconds: programExercises.durationMaxSeconds,
    distanceMinMeters: programExercises.distanceMinMeters,
    distanceMaxMeters: programExercises.distanceMaxMeters,
    perSide: programExercises.perSide,
    rirMin: programExercises.rirMin,
    rirMax: programExercises.rirMax,
    supersetGroup: programExercises.supersetGroup,
  };
}

export async function listDayExercises(
  db: DbOrTx,
  programDayId: string,
): Promise<PlannedExercisePreview[]> {
  return db
    .select(plannedExerciseSelection())
    .from(programExercises)
    .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
    .where(eq(programExercises.programDayId, programDayId))
    .orderBy(asc(programExercises.orderIndex));
}

/**
 * The planned exercises for several days at once, grouped by day. One statement rather
 * than one per day: choosing a day means comparing them, and a seven-day cycle would
 * otherwise cost seven round trips to draw one screen.
 */
export async function listExercisesByDay(
  db: DbOrTx,
  programDayIds: readonly string[],
): Promise<Map<string, PlannedExercisePreview[]>> {
  const byDay = new Map<string, PlannedExercisePreview[]>();
  if (programDayIds.length === 0) return byDay;
  const rows = await db
    .select({ programDayId: programExercises.programDayId, ...plannedExerciseSelection() })
    .from(programExercises)
    .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
    .where(inArray(programExercises.programDayId, [...programDayIds]))
    .orderBy(asc(programExercises.orderIndex));
  for (const { programDayId, ...exercise } of rows) {
    const list = byDay.get(programDayId);
    if (list) list.push(exercise);
    else byDay.set(programDayId, [exercise]);
  }
  return byDay;
}

export type RunTarget = {
  id: string;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  distanceMinKm: number | null;
  distanceMaxKm: number | null;
  rpeMin: number | null;
  rpeMax: number | null;
  paceNote: string | null;
  progressionNote: string | null;
  stopRule: string | null;
  comment: string | null;
};

function runTargetSelection() {
  return {
    id: programRuns.id,
    durationMinMinutes: programRuns.durationMinMinutes,
    durationMaxMinutes: programRuns.durationMaxMinutes,
    distanceMinKm: programRuns.distanceMinKm,
    distanceMaxKm: programRuns.distanceMaxKm,
    rpeMin: programRuns.rpeMin,
    rpeMax: programRuns.rpeMax,
    paceNote: programRuns.paceNote,
    progressionNote: programRuns.progressionNote,
    stopRule: programRuns.stopRule,
    comment: programRuns.comment,
  };
}

export async function getRunTarget(
  db: DbOrTx,
  programId: string,
  cycleIndex: number,
  dayOfWeek: number,
): Promise<RunTarget | null> {
  const [row] = await db
    .select(runTargetSelection())
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

/** Every planned run of one cycle, by the weekday it falls on. */
export async function listRunTargets(
  db: DbOrTx,
  programId: string,
  cycleIndex: number,
): Promise<Map<number, RunTarget>> {
  const rows = await db
    .select({ dayOfWeek: programRuns.dayOfWeek, ...runTargetSelection() })
    .from(programRuns)
    .where(and(eq(programRuns.programId, programId), eq(programRuns.weekIndex, cycleIndex)));
  return new Map(rows.map(({ dayOfWeek, ...run }) => [dayOfWeek, run]));
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
  /** The day the programme was finished on, once it is; null while it is still going. */
  finishedOn: string | null;
  /** null once the programme is complete. */
  suggestion: Suggestion | null;
  suggestedDay: ScheduleDay | null;
  suggestedExercises: PlannedExercisePreview[];
  /** The training day offered when the suggested slot is a rest day. */
  nextTrainingDay: (ScheduleDay & { cycleIndex: number }) | null;
  /**
   * The lifting half of the offered day. The run half is not here: it is answered by its own
   * occurrence, which Today reads directly, and a second copy of that fact projected through
   * this type only went stale (plan §2.3).
   */
  sessionStatus: SlotStatus | "pending";
  /**
   * The workout that did the offered day's lifting, once it has and the day still owes its run:
   * the day's print draws it as the workout does (`readSlotPrints`). Null until then.
   */
  sessionPrint: PrintedSession | null;
  /**
   * The programme day finished today, when there is one: the day offered is then the next one,
   * not today's. With its cycle, so Today can still show the endurance it logged.
   */
  finishedToday: (ScheduleDay & { cycleIndex: number }) | null;
  /** Training days the calendar has passed with something still owed, oldest first. */
  missed: { cycleIndex: number; dayIndex: number; name: string }[];
  /** The day "Pick up from today" would resume at: the calendar's day for today. */
  pickUpDay: (ScheduleDay & { cycleIndex: number }) | null;
  /** Every day of the current cycle with its status, for "choose another day". */
  cycleDays: DayStatus[];
};

/**
 * Everything the Today screen needs to show the planned day. A caller that has already read the
 * schedule in this transaction passes it, so it is not read twice.
 */
export async function getTodayPlan(
  db: DbOrTx,
  userId: string,
  timeZone: string,
  knownSchedule?: Schedule | null,
): Promise<TodayPlan | null> {
  const schedule = knownSchedule === undefined ? await getSchedule(db, userId) : knownSchedule;
  if (!schedule) return null;
  const today = todayInTimeZone(timeZone);
  const state = schedule.state;
  const next = suggestion(state);
  const suggestedDay = next
    ? (schedule.days.find((d) => d.dayIndex === next.slot.dayIndex) ?? null)
    : null;
  const sessionStatus = next ? partStatus(state, next.slot, "session") : "pending";
  const [suggestedExercises, printed] = await Promise.all([
    suggestedDay ? listDayExercises(db, suggestedDay.id) : [],
    next && suggestedDay?.includesLifting && sessionStatus === "completed"
      ? readSlotPrints(db, userId, schedule.program.id, next.slot.cycleIndex, next.slot.dayIndex)
      : null,
  ]);
  const nextTrainingRef = next?.nextTrainingSlot ?? null;
  const nextTrainingDay = nextTrainingRef
    ? (schedule.days.find((d) => d.dayIndex === nextTrainingRef.dayIndex) ?? null)
    : null;
  const currentCycle = next?.slot.cycleIndex ?? nextPendingSlot(state)?.cycleIndex ?? state.cycles;
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
  const finishedRef = slotFinishedOn(state, today);
  const dayOf = (ref: SlotRef) => schedule.days.find((d) => d.dayIndex === ref.dayIndex) ?? null;
  const finishedDay = finishedRef ? dayOf(finishedRef) : null;
  const resumeAt = pickUpFromToday(state, startDate, today).resumeAt;
  const resumeDay = resumeAt ? dayOf(resumeAt) : null;
  return {
    program: schedule.program,
    today,
    progress: progress(state),
    behind: sessionsBehind(state, startDate, today),
    projectedEnd: projectedEndDate(state, today, finishedRef !== null),
    finishedOn: finishedOn(state),
    missed: missedSlots(state, startDate, today).map((ref) => ({
      ...ref,
      name: dayOf(ref)?.name ?? `Day ${ref.dayIndex}`,
    })),
    pickUpDay: resumeAt && resumeDay ? { ...resumeDay, cycleIndex: resumeAt.cycleIndex } : null,
    suggestion: next,
    suggestedDay,
    suggestedExercises,
    nextTrainingDay:
      nextTrainingDay && nextTrainingRef
        ? { ...nextTrainingDay, cycleIndex: nextTrainingRef.cycleIndex }
        : null,
    sessionStatus,
    sessionPrint: next ? (printed?.get(next.slot.dayIndex) ?? null) : null,
    finishedToday:
      finishedRef && finishedDay ? { ...finishedDay, cycleIndex: finishedRef.cycleIndex } : null,
    cycleDays,
  };
}

/** Nothing but rest is left (ADR 0051): what Today says as "Programme complete". */
export function scheduleComplete(schedule: Schedule): boolean {
  return suggestion(schedule.state) === null;
}

export type ProgramDayPlan = {
  day: ScheduleDay;
  exercises: PlannedExercisePreview[];
  warmupName: string | null;
  /** The run planned for this day of the cycle the programme is currently on. */
  run: RunTarget | null;
  status: SlotStatus | "pending" | "not_in_programme";
  /** The day Today is offering. */
  isNext: boolean;
  /**
   * The workout that did this day of the cycle, as every screen that prints it draws it
   * (`readSlotPrints`); null until one has, and when the prints were not asked for.
   */
  print: PrintedSession | null;
};

export type ProgramOverview = {
  program: ActiveProgram;
  progress: Progress;
  projectedEnd: string | null;
  /** Nothing but rest is left (ADR 0051): what Today says as "Programme complete". */
  complete: boolean;
  /** The day it was finished on, once it is; null while it is still going. */
  finishedOn: string | null;
  currentCycle: number;
  days: ProgramDayPlan[];
  /** What one cycle actually asks for, which is the shape of the programme. */
  liftingDays: number;
  setsPerCycle: number;
};

/**
 * The whole active programme: every day of the cycle with its exercises, warm-up and run,
 * and where the sequence has got to. Asked for its prints (Training and its days, which draw
 * them), each day the cycle has trained comes with its workout's (`readSlotPrints`).
 *
 * Three statements for any number of days — the schedule, then every day's exercises and
 * the cycle's runs together — plus the warm-up names, which come from the library already
 * in memory, and the prints when asked for and the cycle has trained a day. Reading a
 * seven-day cycle costs the same as reading a one-day one.
 */
export async function getProgramOverview(
  db: DbOrTx,
  userId: string,
  timeZone: string,
  { prints = false }: { prints?: boolean } = {},
): Promise<ProgramOverview | null> {
  const schedule = await getSchedule(db, userId);
  if (!schedule) return null;
  const state = schedule.state;
  const next = suggestion(state);
  const currentCycle = next?.slot.cycleIndex ?? nextPendingSlot(state)?.cycleIndex ?? state.cycles;
  const lifting = new Set(
    schedule.days.filter((day) => day.includesLifting).map((day) => day.dayIndex),
  );
  const trained = state.events.some(
    (event) =>
      event.cycleIndex === currentCycle &&
      event.part === "session" &&
      event.status === "completed" &&
      lifting.has(event.dayIndex),
  );
  const [exercisesByDay, runs, warmups, printed] = await Promise.all([
    listExercisesByDay(
      db,
      schedule.days.map((day) => day.id),
    ),
    listRunTargets(db, schedule.program.id, currentCycle),
    sharedWarmupProtocols(db),
    prints && trained
      ? readSlotPrints(db, userId, schedule.program.id, currentCycle)
      : new Map<number, PrintedSession>(),
  ]);
  const warmupNames = new Map(warmups.map((warmup) => [warmup.id, warmup.name]));
  const slots = allSlots(state);
  const days: ProgramDayPlan[] = schedule.days.map((day) => {
    const ref = { cycleIndex: currentCycle, dayIndex: day.dayIndex };
    const exists = slots.some(
      (slot) => slot.cycleIndex === ref.cycleIndex && slot.dayIndex === ref.dayIndex,
    );
    return {
      day,
      exercises: exercisesByDay.get(day.id) ?? [],
      warmupName: day.warmupProtocolId ? (warmupNames.get(day.warmupProtocolId) ?? null) : null,
      run: day.includesRun ? (runs.get(day.dayOfWeek ?? 0) ?? null) : null,
      status: exists ? slotStatus(state, ref) : "not_in_programme",
      isNext:
        next !== null &&
        next.slot.cycleIndex === currentCycle &&
        next.slot.dayIndex === day.dayIndex,
      print: printed.get(day.dayIndex) ?? null,
    };
  });
  return {
    program: schedule.program,
    progress: progress(state),
    projectedEnd: projectedEndDate(
      state,
      todayInTimeZone(timeZone),
      slotFinishedOn(state, todayInTimeZone(timeZone)) !== null,
    ),
    complete: next === null,
    finishedOn: finishedOn(state),
    currentCycle,
    days,
    liftingDays: schedule.days.filter((day) => day.includesLifting).length,
    setsPerCycle: days.reduce(
      (total, entry) => total + entry.exercises.reduce((sets, e) => sets + e.sets, 0),
      0,
    ),
  };
}
