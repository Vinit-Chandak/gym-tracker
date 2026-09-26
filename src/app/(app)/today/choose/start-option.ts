import { allSlots, partStatus, type ScheduleState } from "@/domain/schedule";

/** The button must describe the workout it will actually start, independent of a run. */
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
  return next
    ? {
        cycleIndex: next.cycleIndex,
        label: next.cycleIndex === cycleIndex ? "Start" : "Start next cycle",
      }
    : null;
}
