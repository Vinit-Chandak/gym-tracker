import { datedByWeekday, weekdayOffsets } from "./cycle-repeat";
import { addDays, isoWeekday } from "./program-calendar";
import type { CycleRepeat, SlotPart } from "./types";

/**
 * Sequence-based scheduling ("shift" policy).
 *
 * The programme is an ordered cycle of day slots (Lower A, Upper A, …, Rest). Nothing is tied
 * to a weekday: the next thing to do is always the earliest slot that has not been completed
 * or skipped. Missing a day therefore moves every later session back by one day instead of
 * dropping it. Rest slots are "soft": starting the next training session completes any rest
 * slots that come before it.
 *
 * A slot is not one task. A day that lifts *and* runs asks for two, and each is answered on
 * its own: finishing the workout says nothing about the run, and logging the run says nothing
 * about the workout. The slot is behind the sequence until both have an answer.
 */

export type ProgramSlot = {
  /** 1-based position in the cycle. */
  dayIndex: number;
  name: string;
  includesLifting: boolean;
  includesRun: boolean;
  /** ISO weekday the day falls on; only a cycle that repeats weekly is dated by it. */
  dayOfWeek?: number | null;
};

export type SlotStatus = "completed" | "skipped";

export type SlotEvent = {
  cycleIndex: number;
  dayIndex: number;
  part: SlotPart;
  status: SlotStatus;
  /**
   * The athlete's calendar date it was answered on; absent for an answer derived rather than
   * recorded.
   */
  occurredOn?: string;
};

export type SlotRef = { cycleIndex: number; dayIndex: number };

export type ScheduleState = {
  slots: readonly ProgramSlot[];
  /** How many times the cycle is repeated: `cycleCount` of the programme's weeks. */
  cycles: number;
  /** Slot the programme started on; earlier slots of cycle 1 never existed. */
  startDayIndex: number;
  events: readonly SlotEvent[];
  /** How the cycle repeats; absent for a programme that predates the choice (ADR 0051). */
  repeats?: CycleRepeat | null;
};

/**
 * What became of one of the programme's own endurance occurrences.
 *
 * The same five answers `resolveOccurrence` gives, named here so the sequence can read them
 * without depending on how an occurrence is stored.
 */
export type EnduranceOutcome =
  "logged" | "skipped" | "cancelled" | "legacy_completed" | "incomplete";

export type SlotOccurrence = {
  cycleIndex: number;
  dayIndex: number;
  outcome: EnduranceOutcome;
  /** The athlete's date the activity that answered it happened on; only a logged one has it. */
  occurredOn?: string;
};

/**
 * The `run` events the programme's endurance occurrences imply.
 *
 * A day that runs asks for two answers, and this is what gives it the second one. The
 * occurrence is the only place an endurance session is answered — logging one settles it,
 * skipping one skips it, a revision may cancel it — so deriving the part from the occurrence
 * is what keeps the two from disagreeing. Writing a second copy into `program_slot_events`
 * from each of the five paths that can settle an occurrence is how they came to disagree
 * before: #41 removed the one writer that did it and every running day stopped completing.
 *
 * A slot is answered only once nothing it asks for is still owed. Several occurrences on one
 * day are one answer between them: two of three swims logged is not a day that ran. Work the
 * programme itself withdrew asks for nothing, so a slot left holding only cancellations
 * counts as answered rather than as the athlete's failure — and a skip only outranks a
 * cancellation, never a log.
 *
 * A run answered by a log is dated by the last of its logs, as a finished workout is by its
 * session: that is the day the run half was done, and what tells Today a day that only runs
 * was finished this morning rather than still to do.
 */
export function runEventsFromOccurrences(occurrences: readonly SlotOccurrence[]): SlotEvent[] {
  const bySlot = new Map<string, SlotOccurrence[]>();
  for (const occurrence of occurrences) {
    const slot = `${occurrence.cycleIndex}:${occurrence.dayIndex}`;
    const answers = bySlot.get(slot);
    if (answers) answers.push(occurrence);
    else bySlot.set(slot, [occurrence]);
  }
  const events: SlotEvent[] = [];
  for (const [slot, answers] of bySlot) {
    const outcomes = answers.map((answer) => answer.outcome);
    if (outcomes.includes("incomplete")) continue;
    const [cycleIndex, dayIndex] = slot.split(":").map(Number) as [number, number];
    const done = outcomes.some((outcome) => outcome === "logged" || outcome === "legacy_completed");
    const loggedOn = answers
      .flatMap((answer) =>
        answer.outcome === "logged" && answer.occurredOn ? [answer.occurredOn] : [],
      )
      .sort()
      .at(-1);
    events.push({
      cycleIndex,
      dayIndex,
      part: "run",
      status: done || !outcomes.includes("skipped") ? "completed" : "skipped",
      ...(loggedOn ? { occurredOn: loggedOn } : {}),
    });
  }
  return events;
}

/**
 * The events of a programme, with the derived endurance answers filled in behind the recorded
 * ones. A slot somebody answered by hand — skipping the run from Today, say — keeps that
 * answer: what was decided outranks what can be worked out.
 */
export function withDerivedRunEvents(
  recorded: readonly SlotEvent[],
  derived: readonly SlotEvent[],
): SlotEvent[] {
  const answered = new Set(
    recorded.filter((event) => event.part === "run").map((e) => `${e.cycleIndex}:${e.dayIndex}`),
  );
  return [
    ...recorded,
    ...derived.filter((event) => !answered.has(`${event.cycleIndex}:${event.dayIndex}`)),
  ];
}

/** Rest/mobility slots need no session and never block the sequence. */
export function isRestSlot(slot: ProgramSlot): boolean {
  return !slot.includesLifting && !slot.includesRun;
}

/**
 * The tasks a day asks for, in the order they are offered.
 *
 * A day that only rests still asks for `session` — that is the "mark rest day done" tick, and
 * keeping it means every slot has at least one part to answer, whatever the programme says.
 */
export function slotParts(slot: ProgramSlot): readonly SlotPart[] {
  if (slot.includesLifting && slot.includesRun) return ["session", "run"];
  if (slot.includesRun) return ["run"];
  return ["session"];
}

function key(ref: SlotRef, part: SlotPart): string {
  return `${ref.cycleIndex}:${ref.dayIndex}:${part}`;
}

function eventMap(state: ScheduleState): Map<string, SlotStatus> {
  return new Map(state.events.map((e) => [key(e, e.part), e.status]));
}

function existsInProgramme(state: ScheduleState, ref: SlotRef): boolean {
  if (ref.cycleIndex < 1 || ref.cycleIndex > state.cycles) return false;
  if (!state.slots.some((s) => s.dayIndex === ref.dayIndex)) return false;
  return !(ref.cycleIndex === 1 && ref.dayIndex < state.startDayIndex);
}

/** Every slot of the programme in order, cycle by cycle, skipping the pre-start ones. */
export function allSlots(state: ScheduleState): SlotRef[] {
  const ordered = [...state.slots].sort((a, b) => a.dayIndex - b.dayIndex);
  const refs: SlotRef[] = [];
  for (let cycleIndex = 1; cycleIndex <= state.cycles; cycleIndex++) {
    for (const slot of ordered) {
      const ref = { cycleIndex, dayIndex: slot.dayIndex };
      if (existsInProgramme(state, ref)) refs.push(ref);
    }
  }
  return refs;
}

export function slotFor(state: ScheduleState, ref: SlotRef): ProgramSlot | undefined {
  return state.slots.find((s) => s.dayIndex === ref.dayIndex);
}

/** What happened to one half of a slot: its own workout, or its own run. */
export function partStatus(
  state: ScheduleState,
  ref: SlotRef,
  part: SlotPart,
): SlotStatus | "pending" {
  return eventMap(state).get(key(ref, part)) ?? "pending";
}

/** The parts of a slot that still have no answer. */
export function pendingParts(state: ScheduleState, ref: SlotRef): readonly SlotPart[] {
  const slot = slotFor(state, ref);
  if (!slot) return [];
  const events = eventMap(state);
  return slotParts(slot).filter((part) => !events.has(key(ref, part)));
}

/**
 * The day as a whole: done once every part it asks for has been answered, and counted as
 * skipped when any of those answers was a skip. Anything less is still pending, which is what
 * keeps a day with an unlogged run from being left behind by the sequence.
 */
export function slotStatus(state: ScheduleState, ref: SlotRef): SlotStatus | "pending" {
  const slot = slotFor(state, ref);
  if (!slot) return "pending";
  const events = eventMap(state);
  const statuses = slotParts(slot).map((part) => events.get(key(ref, part)));
  if (statuses.some((status) => status === undefined)) return "pending";
  return statuses.some((status) => status === "skipped") ? "skipped" : "completed";
}

/**
 * Whether the programme is over: nothing but rest days left to answer. A rest day is soft — the
 * next session passes it — so when no session is left, nothing would ever pass it, and a
 * programme ending on a rest day stayed open on that rest day until somebody happened to tap it,
 * holding back the next block for weeks (found by the year simulation, Kenji's off-season).
 */
function onlyRestLeft(state: ScheduleState): boolean {
  return !allSlots(state).some((ref) => {
    const slot = slotFor(state, ref);
    return slot !== undefined && !isRestSlot(slot) && pendingParts(state, ref).length > 0;
  });
}

/** The earliest slot with anything left to do, or null when the programme is finished. */
export function nextPendingSlot(state: ScheduleState): SlotRef | null {
  if (onlyRestLeft(state)) return null;
  for (const ref of allSlots(state)) {
    if (pendingParts(state, ref).length > 0) return ref;
  }
  return null;
}

/**
 * The last day of the sequence finished on `date`: nothing it asks for still owed, and the last
 * of what it asked for done that day — its workout, its run, or its rest. When there is one,
 * the day Today offers is the one after it, which is up next rather than today's: the sequence
 * moves on as soon as a day is done, but the calendar does not. A day that only runs is
 * finished by its run, and one that lifts and runs by whichever half came last, so a run logged
 * this morning against yesterday's workout finishes the day this morning. A skip finishes
 * nothing, so a day skipped this morning leaves the next one as today's.
 */
export function slotFinishedOn(state: ScheduleState, date: string): SlotRef | null {
  let last: SlotRef | null = null;
  for (const ref of allSlots(state)) {
    if (pendingParts(state, ref).length > 0) continue;
    const doneOn = state.events
      .flatMap((event) =>
        event.cycleIndex === ref.cycleIndex &&
        event.dayIndex === ref.dayIndex &&
        event.status === "completed" &&
        event.occurredOn
          ? [event.occurredOn]
          : [],
      )
      .sort()
      .at(-1);
    if (doneOn === date) last = ref;
  }
  return last;
}

export type Suggestion = {
  /** What Today should show. */
  slot: SlotRef;
  /** Pending rest slots before the next training slot; completed automatically on start. */
  restSlotsBefore: SlotRef[];
  /** The next training slot, if the suggested slot is a rest slot. */
  nextTrainingSlot: SlotRef | null;
};

/**
 * What to show on Today: the next slot with anything left to do. When that is a rest day, the
 * caller can offer to start the next training slot instead, which auto-completes the rest
 * slots in between.
 */
export function suggestion(state: ScheduleState): Suggestion | null {
  const next = nextPendingSlot(state);
  if (!next) return null;
  const restSlotsBefore: SlotRef[] = [];
  let nextTraining: SlotRef | null = null;
  for (const ref of allSlots(state)) {
    if (pendingParts(state, ref).length === 0) continue;
    const slot = slotFor(state, ref);
    if (slot && isRestSlot(slot)) {
      restSlotsBefore.push(ref);
      continue;
    }
    nextTraining = ref;
    break;
  }
  const suggested = slotFor(state, next);
  const suggestedIsRest = suggested ? isRestSlot(suggested) : false;
  return {
    slot: next,
    restSlotsBefore: suggestedIsRest ? restSlotsBefore : [],
    nextTrainingSlot: suggestedIsRest ? nextTraining : null,
  };
}

export type Progress = {
  total: number;
  completed: number;
  skipped: number;
  remaining: number;
  currentCycle: number;
};

/** Counted in days, not in tasks: a day that lifts and runs is still one of the 56. */
export function progress(state: ScheduleState): Progress {
  const refs = allSlots(state);
  const over = onlyRestLeft(state);
  let completed = 0;
  let skipped = 0;
  for (const ref of refs) {
    const status = slotStatus(state, ref);
    // Once nothing but rest is left, the rest days left are the programme's end, not owed.
    if (status === "completed" || (over && status === "pending")) completed += 1;
    else if (status === "skipped") skipped += 1;
  }
  const next = nextPendingSlot(state);
  return {
    total: refs.length,
    completed,
    skipped,
    remaining: refs.length - completed - skipped,
    currentCycle: next?.cycleIndex ?? state.cycles,
  };
}

/**
 * Where the sequence is laid on the calendar, slot by slot in order. One slot a day from the
 * programme's start, so the slot at position n (pre-start slots excluded) falls on start + n —
 * unless the cycle repeats weekly on fewer than seven days, when each slot falls on its own
 * weekday, a week a cycle, starting from the first time the starting day's weekday comes round.
 * Nothing is fixed to these dates — the sequence waits for the athlete — but they are what
 * "behind" and "today's day" are read against.
 */
export function slotDates(
  state: ScheduleState,
  startDate: string,
): { ref: SlotRef; date: string }[] {
  const refs = allSlots(state);
  const days = state.slots.map((slot) => ({ ...slot, dayOfWeek: slot.dayOfWeek ?? null }));
  const offsets = datedByWeekday(days, state.repeats) ? weekdayOffsets(days) : null;
  const first = refs[0];
  const firstWeekday = first ? slotFor(state, first)?.dayOfWeek : null;
  if (!offsets || !first || !firstWeekday)
    return refs.map((ref, index) => ({ ref, date: addDays(startDate, index) }));
  const firstDate = addDays(startDate, (firstWeekday - isoWeekday(startDate) + 7) % 7);
  const cycleStart = addDays(firstDate, -(offsets.get(first.dayIndex) ?? 0));
  return refs.map((ref) => ({
    ref,
    date: addDays(cycleStart, (ref.cycleIndex - 1) * 7 + (offsets.get(ref.dayIndex) ?? 0)),
  }));
}

/** The slots the calendar has already passed, in order: always a leading run of the sequence. */
function slotsDatedBefore(state: ScheduleState, startDate: string, today: string): SlotRef[] {
  return slotDates(state, startDate)
    .filter(({ date }) => date < today)
    .map(({ ref }) => ref);
}

/**
 * The training days the calendar has passed with something still owed, oldest first.
 *
 * A rest day that simply passed is never one of them (owner, 11 October 2026): nobody owes a
 * rest day, and counting it made every untapped rest day read as a day behind. A day that both
 * lifts and runs is behind while either half is owed.
 */
export function missedSlots(state: ScheduleState, startDate: string, today: string): SlotRef[] {
  return slotsDatedBefore(state, startDate, today).filter((ref) => {
    const slot = slotFor(state, ref);
    return slot !== undefined && !isRestSlot(slot) && pendingParts(state, ref).length > 0;
  });
}

/** Training sessions behind the calendar: 0 when on track. */
export function sessionsBehind(state: ScheduleState, startDate: string, today: string): number {
  return missedSlots(state, startDate, today).length;
}

/**
 * "Pick up from today": everything dated before today still owed is answered, so the
 * sequence resumes at the day the calendar has for today. Training is skipped, part by part,
 * and rest days are passed. Nothing is said for slots from today on.
 */
export function pickUpFromToday(
  state: ScheduleState,
  startDate: string,
  today: string,
): {
  skip: { ref: SlotRef; part: SlotPart }[];
  /** Rest days passed, each with the date the calendar gave it. */
  rest: { ref: SlotRef; date: string }[];
  /** Where the sequence stands afterwards; null when the programme would be over. */
  resumeAt: SlotRef | null;
} {
  const skip: { ref: SlotRef; part: SlotPart }[] = [];
  const rest: { ref: SlotRef; date: string }[] = [];
  const dated = slotDates(state, startDate).filter(({ date }) => date < today);
  for (const { ref, date } of dated) {
    const slot = slotFor(state, ref);
    if (!slot) continue;
    const owed = pendingParts(state, ref);
    if (owed.length === 0) continue;
    if (isRestSlot(slot)) rest.push({ ref, date });
    else for (const part of owed) skip.push({ ref, part });
  }
  const after = allSlots(state).slice(dated.length);
  const resumeAt = after.find((ref) => pendingParts(state, ref).length > 0) ?? null;
  return { skip, rest, resumeAt };
}

/**
 * Last day of the programme if one slot is done per day from here on — or, in a cycle dated by
 * weekday, each on its next weekday — and null when finished. A day already finished today has
 * had its day, so what is left starts tomorrow.
 */
export function projectedEndDate(
  state: ScheduleState,
  today: string,
  finishedToday = false,
): string | null {
  const { remaining } = progress(state);
  if (remaining === 0) return null;
  const days = state.slots.map((slot) => ({ ...slot, dayOfWeek: slot.dayOfWeek ?? null }));
  if (!datedByWeekday(days, state.repeats))
    return addDays(today, remaining - (finishedToday ? 0 : 1));
  let cursor = finishedToday ? addDays(today, 1) : today;
  let last = cursor;
  for (const ref of allSlots(state)) {
    if (slotStatus(state, ref) !== "pending") continue;
    const weekday = slotFor(state, ref)?.dayOfWeek ?? isoWeekday(cursor);
    last = addDays(cursor, (weekday - isoWeekday(cursor) + 7) % 7);
    cursor = addDays(last, 1);
  }
  return last;
}
