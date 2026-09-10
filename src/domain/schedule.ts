import { addDays, daysBetween } from "./program-calendar";
import type { SlotPart } from "./types";

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
};

export type SlotStatus = "completed" | "skipped";

export type SlotEvent = {
  cycleIndex: number;
  dayIndex: number;
  part: SlotPart;
  status: SlotStatus;
};

export type SlotRef = { cycleIndex: number; dayIndex: number };

export type ScheduleState = {
  slots: readonly ProgramSlot[];
  /** How many times the cycle is repeated (8 for the current plan). */
  cycles: number;
  /** Slot the programme started on; earlier slots of cycle 1 never existed. */
  startDayIndex: number;
  events: readonly SlotEvent[];
};

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

/** The earliest slot with anything left to do, or null when the programme is finished. */
export function nextPendingSlot(state: ScheduleState): SlotRef | null {
  for (const ref of allSlots(state)) {
    if (pendingParts(state, ref).length > 0) return ref;
  }
  return null;
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
  let completed = 0;
  let skipped = 0;
  for (const ref of refs) {
    const status = slotStatus(state, ref);
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

/** Sessions that the calendar says should be done by now but are not (0 when on track or ahead). */
export function sessionsBehind(state: ScheduleState, startDate: string, today: string): number {
  const elapsedDays = Math.max(0, daysBetween(startDate, today));
  const { completed, skipped, total } = progress(state);
  const expected = Math.min(total, elapsedDays);
  return Math.max(0, expected - completed - skipped);
}

/** Last day of the programme if one slot is done per day from today on; null when finished. */
export function projectedEndDate(state: ScheduleState, today: string): string | null {
  const { remaining } = progress(state);
  if (remaining === 0) return null;
  return addDays(today, remaining - 1);
}
