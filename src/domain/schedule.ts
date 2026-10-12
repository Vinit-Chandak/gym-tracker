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
  /**
   * The athlete's date it was answered on: the day the activity that answered a logged one
   * happened, and the day a skipped one was skipped. Nothing else has one.
   */
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
 * was finished this morning rather than still to do. One answered by a skip is dated by its
 * last skip, as a skipped workout is by its skip, so a programme whose last days were skipped
 * from Today or picked up from today ends on the day they were (`finishedOn`). A skip finishes
 * nothing on Today (`slotFinishedOn`).
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
    const status = done || !outcomes.includes("skipped") ? "completed" : "skipped";
    // Dated by the answer it stands for: the last log of a run done, the last skip of one skipped.
    const answeredBy = status === "completed" ? "logged" : "skipped";
    const answeredOn = answers
      .flatMap((answer) =>
        answer.outcome === answeredBy && answer.occurredOn ? [answer.occurredOn] : [],
      )
      .sort()
      .at(-1);
    events.push({
      cycleIndex,
      dayIndex,
      part: "run",
      status,
      ...(answeredOn ? { occurredOn: answeredOn } : {}),
    });
  }
  return events;
}

/**
 * The events of a programme, with the answers its endurance occurrences imply filled in behind
 * the recorded ones (`runEventsFromOccurrences`). A run half answered on the day by hand keeps
 * that answer — what was decided outranks what can be worked out — with one exception.
 *
 * A run skipped from Today is skipped on its occurrences (ADR 0051), so a skip recorded on a
 * day that has them is from before then, when the day was skipped and its runs left owed; the
 * migration `runs_skipped_from_today` carried those skips onto the runs. Such a skip gives way
 * to the runs as a skipped workout gives way to the workout finished after all
 * (`recordSlotEvent`): to one of them logged, and to one of them owed again, put back or its
 * log deleted. Kept, it called a run logged since "skipped" on the day, and a run put back was
 * skipped on the programme and owed in the coach's adherence. A completion recorded on the day
 * is history from before occurrences answered for runs, and stands.
 */
export function withDerivedRunEvents(
  recorded: readonly SlotEvent[],
  occurrences: readonly SlotOccurrence[],
): SlotEvent[] {
  const slotKey = (ref: SlotRef) => `${ref.cycleIndex}:${ref.dayIndex}`;
  const reopened = new Set(
    occurrences
      .filter(({ outcome }) => outcome !== "skipped" && outcome !== "cancelled")
      .map(slotKey),
  );
  const kept = recorded.filter(
    (event) => event.part !== "run" || event.status !== "skipped" || !reopened.has(slotKey(event)),
  );
  const answered = new Set(kept.filter((event) => event.part === "run").map(slotKey));
  return [
    ...kept,
    ...runEventsFromOccurrences(occurrences).filter((event) => !answered.has(slotKey(event))),
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

/** What the day's own answers say, before anything is read into an unanswered rest day. */
function answeredStatus(state: ScheduleState, ref: SlotRef): SlotStatus | "pending" {
  const slot = slotFor(state, ref);
  if (!slot) return "pending";
  const events = eventMap(state);
  const statuses = slotParts(slot).map((part) => events.get(key(ref, part)));
  if (statuses.some((status) => status === undefined)) return "pending";
  return statuses.some((status) => status === "skipped") ? "skipped" : "completed";
}

/**
 * A rest day left unanswered once the programme is over is its end, not a day owed (ADR 0051),
 * so it reads done, like the rest days a session passed earlier in the same cycle. `over` is
 * `onlyRestLeft`, worked out once by a caller that asks it of every slot.
 */
function statusOf(state: ScheduleState, ref: SlotRef, over: boolean): SlotStatus | "pending" {
  const status = answeredStatus(state, ref);
  if (status !== "pending" || !over) return status;
  const slot = slotFor(state, ref);
  return slot && isRestSlot(slot) ? "completed" : status;
}

/**
 * The day as a whole: done once every part it asks for has been answered, and counted as
 * skipped when any of those answers was a skip. Anything less is still pending, which is what
 * keeps a day with an unlogged run from being left behind by the sequence — until the programme
 * is over, when a rest day nobody tapped reads done, as `progress` counts it.
 */
export function slotStatus(state: ScheduleState, ref: SlotRef): SlotStatus | "pending" {
  return statusOf(state, ref, answeredStatus(state, ref) === "pending" && onlyRestLeft(state));
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
    // Once nothing but rest is left, the rest days left are the programme's end, not owed.
    const status = statusOf(state, ref, over);
    if (status === "completed") completed += 1;
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
 * The day the programme was finished on: once nothing but rest is left, the last date any of its
 * days was answered — its last workout, run or skip. Null while it is still going, and for a
 * finished programme whose answers carry no dates.
 *
 * The sequence waits for the athlete (owner, 11 October 2026), so this is rarely the end date the
 * programme was written with: a block of ten weeks trained with a week off ends a week late, and
 * saying the planned date then puts its last sessions after its end.
 */
export function finishedOn(state: ScheduleState): string | null {
  if (!onlyRestLeft(state)) return null;
  const inProgramme = new Set(allSlots(state).map((ref) => `${ref.cycleIndex}:${ref.dayIndex}`));
  return (
    state.events
      .flatMap((event) =>
        event.occurredOn && inProgramme.has(`${event.cycleIndex}:${event.dayIndex}`)
          ? [event.occurredOn]
          : [],
      )
      .sort()
      .at(-1) ?? null
  );
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
