import {
  allSlots,
  isRestSlot,
  partStatus,
  pendingParts,
  slotFor,
  type ScheduleState,
  type SlotRef,
} from "@/domain/schedule";

/**
 * Nothing a training day asks for is still owed before `ref` in the sequence, so starting it is
 * the sequence's own next step. Rest days are passed by the start, so they never stand in the way.
 */
function inTurn(state: ScheduleState, ref: SlotRef): boolean {
  for (const earlier of allSlots(state)) {
    if (earlier.cycleIndex === ref.cycleIndex && earlier.dayIndex === ref.dayIndex) return true;
    const slot = slotFor(state, earlier);
    if (slot && !isRestSlot(slot) && pendingParts(state, earlier).length > 0) return false;
  }
  return true;
}

/**
 * The button must describe the workout it will actually start, independent of a run.
 *
 * A day already done this cycle starts its next cycle's (ADR 0005): the day repeated on purpose,
 * ahead of a sequence that still waits for the days this cycle has left. "Start next cycle" read
 * as moving on and leaving those behind (year audit, 11 October 2026), so it is said for what it
 * is: "Do again" for a day done this cycle, "Start early" for one this cycle does not have. Where
 * nothing is owed before it — the cycle's training all answered — it is simply what comes next,
 * as Today offers it, and plain Start.
 */
export function liftingStartOption(state: ScheduleState, cycleIndex: number, dayIndex: number) {
  if (!state.slots.find((slot) => slot.dayIndex === dayIndex)?.includesLifting) return null;
  const refs = allSlots(state).filter(
    (ref) => ref.dayIndex === dayIndex && ref.cycleIndex >= cycleIndex,
  );
  const current = refs.find((ref) => ref.cycleIndex === cycleIndex);
  if (current && partStatus(state, current, "session") === "skipped") {
    return { cycleIndex, label: "Start skipped workout" };
  }
  const next = refs.find((ref) => partStatus(state, ref, "session") === "pending");
  if (!next) return null;
  if (next.cycleIndex === cycleIndex || inTurn(state, next))
    return { cycleIndex: next.cycleIndex, label: "Start" };
  return { cycleIndex: next.cycleIndex, label: current ? "Do again" : "Start early" };
}
