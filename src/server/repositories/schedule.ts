import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { exercises, programExercises, programRuns, programSlotEvents, programs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { OccurrenceDisposition } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  allSlots,
  isRestSlot,
  nextPendingSlot,
  partStatus,
  pendingParts,
  progress,
  projectedEndDate,
  runEventsFromOccurrences,
  sessionsBehind,
  slotFinishedOn,
  slotFor,
  slotParts,
  slotStatus,
  suggestion,
  type Progress,
  type ScheduleState,
  type SlotEvent,
  type SlotOccurrence,
  type SlotRef,
  type SlotStatus,
  type Suggestion,
  withDerivedRunEvents,
} from "@/domain/schedule";
import type { PrescriptionType, SlotPart } from "@/domain/types";
import { sharedWarmupProtocols } from "@/server/queries/reference";

export type ActiveProgram = {
  id: string;
  /** The lineage across versions: what an occurrence belongs to, rather than one version. */
  familyId: string;
  name: string;
  slug: string;
  startDate: string | null;
  endDate: string | null;
  weeks: number;
  startDayIndex: number;
  notes: string | null;
};

export async function getActiveProgram(db: DbOrTx, userId: string): Promise<ActiveProgram | null> {
  const [row] = await db
    .select({
      id: programs.id,
      familyId: programs.familyId,
      name: programs.name,
      slug: programs.slug,
      startDate: programs.startDate,
      endDate: programs.endDate,
      weeks: programs.weeks,
      startDayIndex: programs.startDayIndex,
      notes: programs.notes,
    })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  if (!row) return null;
  return { ...row, weeks: row.weeks ?? 8 };
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
};

/**
 * The active programme with its days and slot events, in one statement. The days and events
 * come back as JSON built by Postgres, so nothing waits for the programme id to come back before
 * asking for them. Row Level Security applies inside the subqueries exactly as it would outside.
 */
export async function getSchedule(db: DbOrTx, userId: string): Promise<Schedule | null> {
  const [row] = await db
    .select({
      id: programs.id,
      familyId: programs.familyId,
      name: programs.name,
      slug: programs.slug,
      startDate: programs.startDate,
      endDate: programs.endDate,
      weeks: programs.weeks,
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
      // The programme's own endurance work, as the sequence needs to read it: which slot of
      // the cycle it belongs to and whether anything still owes an answer. Joined here rather
      // than fetched after, so the day a running slot completes costs no extra round trip.
      enduranceOccurrences: sql<EnduranceRow[]>`coalesce((
        select json_agg(json_build_object(
          'cycleIndex', o.cycle_index,
          'cycleDayIndex', o.cycle_day_index,
          'disposition', o.disposition,
          'logged', (a.id is not null)
        ))
        from planned_occurrences o
        left join activities a
          on a.occurrence_id = o.id and a.user_id = o.user_id
        where o.user_id = programs.user_id
          and o.family_id = programs.family_id
          and o.cycle_index is not null
          and o.cycle_day_index is not null
      ), '[]'::json)`,
    })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  if (!row) return null;
  const program: ActiveProgram = {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    slug: row.slug,
    startDate: row.startDate,
    endDate: row.endDate,
    weeks: row.weeks ?? 8,
    startDayIndex: row.startDayIndex,
    notes: row.notes,
  };
  return {
    program,
    days: row.days,
    state: {
      slots: row.days.map((d) => ({
        dayIndex: d.dayIndex,
        name: d.name,
        includesLifting: d.includesLifting,
        includesRun: d.includesRun,
      })),
      cycles: program.weeks,
      startDayIndex: program.startDayIndex,
      events: withDerivedRunEvents(
        row.events,
        runEventsFromOccurrences(slotOccurrences(row.days, row.enduranceOccurrences)),
      ),
    },
  };
}

/** One programme occurrence as the schedule query returns it. */
type EnduranceRow = {
  cycleIndex: number;
  cycleDayIndex: number;
  disposition: OccurrenceDisposition;
  logged: boolean;
};

/**
 * Which slot of the cycle each endurance occurrence belongs to.
 *
 * The occurrence says so itself. This used to work it out from the weekday its lineage was
 * derived from, which meant a slot answered for any occurrence that shared its weekday —
 * including a run belonging to a different day of the cycle entirely. A row naming a slot the
 * current cycle no longer has (a running day a revision took out, say) belongs to no slot and
 * is left out rather than guessed at.
 */
function slotOccurrences(
  days: readonly ScheduleDay[],
  rows: readonly EnduranceRow[],
): SlotOccurrence[] {
  const inCycle = new Set(days.map((day) => day.dayIndex));
  return rows.flatMap((row) => {
    if (!inCycle.has(row.cycleDayIndex)) return [];
    return [
      {
        cycleIndex: row.cycleIndex,
        dayIndex: row.cycleDayIndex,
        // Same rule as `resolveOccurrence`: the linked activity decides, and a row nobody has
        // answered yet is owed however long ago it was scheduled for.
        outcome: row.logged
          ? ("logged" as const)
          : row.disposition === "pending"
            ? ("incomplete" as const)
            : row.disposition,
      },
    ];
  });
}

/**
 * Records what happened to one part of a slot: the workout, or the run. Returns false when
 * that part already had an event, so finishing a session twice, or logging a second run
 * against one planned run, changes nothing.
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
  const inserted = await db
    .insert(programSlotEvents)
    .values({
      userId,
      programId,
      cycleIndex: ref.cycleIndex,
      dayIndex: ref.dayIndex,
      part,
      status,
      workoutSessionId: details.workoutSessionId ?? null,
      runId: details.runId ?? null,
      occurredOn: details.occurredOn,
      note: details.note ?? null,
    })
    .onConflictDoNothing({
      target: [
        programSlotEvents.programId,
        programSlotEvents.cycleIndex,
        programSlotEvents.dayIndex,
        programSlotEvents.part,
      ],
    })
    .returning({ id: programSlotEvents.id });
  return inserted.length > 0;
}

/**
 * Takes back the skip on a slot's session, so the day can be trained after all.
 *
 * Picking a skipped day from "Train another day" trains the occurrence the list showed, which
 * means the skip on it has to go: a slot event is written once, so a workout finished against a
 * day still marked skipped would never be recorded as done.
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

/** Completes every pending rest slot that comes before `ref` in the sequence, in one statement. */
export async function completeRestSlotsBefore(
  db: DbOrTx,
  userId: string,
  schedule: Schedule,
  ref: SlotRef,
  occurredOn: string,
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
        note: "Rest day passed",
      })),
    )
    .onConflictDoNothing({
      target: [
        programSlotEvents.programId,
        programSlotEvents.cycleIndex,
        programSlotEvents.dayIndex,
        programSlotEvents.part,
      ],
    })
    .returning({ id: programSlotEvents.id });
  return inserted.length;
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
   * The programme day finished today, when there is one: the day offered is then the next one,
   * not today's.
   */
  finishedToday: ScheduleDay | null;
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
  const suggestedExercises = suggestedDay ? await listDayExercises(db, suggestedDay.id) : [];
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
    sessionStatus: next ? partStatus(state, next.slot, "session") : "pending",
    finishedToday: finishedRef
      ? (schedule.days.find((d) => d.dayIndex === finishedRef.dayIndex) ?? null)
      : null,
    cycleDays,
  };
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
};

export type ProgramOverview = {
  program: ActiveProgram;
  progress: Progress;
  projectedEnd: string | null;
  currentCycle: number;
  days: ProgramDayPlan[];
  /** What one cycle actually asks for, which is the shape of the programme. */
  liftingDays: number;
  setsPerCycle: number;
};

/**
 * The whole active programme: every day of the cycle with its exercises, warm-up and run,
 * and where the sequence has got to.
 *
 * Three statements for any number of days — the schedule, then every day's exercises and
 * the cycle's runs together — plus the warm-up names, which come from the library already
 * in memory. Reading a seven-day cycle costs the same as reading a one-day one.
 */
export async function getProgramOverview(
  db: DbOrTx,
  userId: string,
  timeZone: string,
): Promise<ProgramOverview | null> {
  const schedule = await getSchedule(db, userId);
  if (!schedule) return null;
  const state = schedule.state;
  const next = suggestion(state);
  const currentCycle = next?.slot.cycleIndex ?? nextPendingSlot(state)?.cycleIndex ?? state.cycles;
  const [exercisesByDay, runs, warmups] = await Promise.all([
    listExercisesByDay(
      db,
      schedule.days.map((day) => day.id),
    ),
    listRunTargets(db, schedule.program.id, currentCycle),
    sharedWarmupProtocols(db),
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
    };
  });
  return {
    program: schedule.program,
    progress: progress(state),
    projectedEnd: projectedEndDate(state, todayInTimeZone(timeZone)),
    currentCycle,
    days,
    liftingDays: schedule.days.filter((day) => day.includesLifting).length,
    setsPerCycle: days.reduce(
      (total, entry) => total + entry.exercises.reduce((sets, e) => sets + e.sets, 0),
      0,
    ),
  };
}
