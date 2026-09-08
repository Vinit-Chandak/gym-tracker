import { addDays, daysBetween } from "./program-calendar";

/**
 * Sequence-based scheduling ("shift" policy).
 *
 * The programme is an ordered cycle of day slots (Lower A, Upper A, …, Rest). Nothing is tied
 * to a weekday: the next thing to do is always the earliest slot that has not been completed
 * or skipped. Missing a day therefore moves every later session back by one day instead of
 * dropping it. Rest slots are "soft": starting the next training session completes any rest
 * slots that come before it.
 */

export type ProgramSlot = {
  /** 1-based position in the cycle. */
  dayIndex: number;
  name: string;
  /** Rest/mobility slots need no session and never block the sequence. */
  isRest: boolean;
};

export type SlotStatus = "completed" | "skipped";

export type SlotEvent = {
  cycleIndex: number;
  dayIndex: number;
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

function key(ref: SlotRef): string {
  return `${ref.cycleIndex}:${ref.dayIndex}`;
}

function eventMap(state: ScheduleState): Map<string, SlotStatus> {
  return new Map(state.events.map((e) => [key(e), e.status]));
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

export function slotStatus(state: ScheduleState, ref: SlotRef): SlotStatus | "pending" {
  return eventMap(state).get(key(ref)) ?? "pending";
}

/** The earliest slot with nothing logged against it, or null when the programme is finished. */
export function nextPendingSlot(state: ScheduleState): SlotRef | null {
  const events = eventMap(state);
  for (const ref of allSlots(state)) {
    if (!events.has(key(ref))) return ref;
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
 * What to show on Today: the next pending slot. When that is a rest day, the caller can offer
 * to start the next training slot instead, which auto-completes the rest slots in between.
 */
export function suggestion(state: ScheduleState): Suggestion | null {
  const next = nextPendingSlot(state);
  if (!next) return null;
  const events = eventMap(state);
  const restSlotsBefore: SlotRef[] = [];
  let nextTraining: SlotRef | null = null;
  for (const ref of allSlots(state)) {
    if (events.has(key(ref))) continue;
    const slot = slotFor(state, ref);
    if (slot?.isRest) {
      restSlotsBefore.push(ref);
      continue;
    }
    nextTraining = ref;
    break;
  }
  const suggestedIsRest = slotFor(state, next)?.isRest ?? false;
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

export function progress(state: ScheduleState): Progress {
  const refs = allSlots(state);
  const events = eventMap(state);
  let completed = 0;
  let skipped = 0;
  for (const ref of refs) {
    const status = events.get(key(ref));
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
