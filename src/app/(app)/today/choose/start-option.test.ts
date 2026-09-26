import { expect, it } from "vitest";
import type { ScheduleState } from "@/domain/schedule";
import { liftingStartOption } from "./start-option";

const state: ScheduleState = {
  slots: [{ dayIndex: 1, name: "Lift and run", includesLifting: true, includesRun: true }],
  cycles: 2,
  startDayIndex: 1,
  events: [{ cycleIndex: 1, dayIndex: 1, part: "session", status: "completed" }],
};
it("names the next lifting cycle even while this cycle still owes its run", () => {
  expect(liftingStartOption(state, 1, 1)).toEqual({ cycleIndex: 2, label: "Start next cycle" });
});
it("offers no start after the final lift is complete", () => {
  expect(liftingStartOption({ ...state, cycles: 1 }, 1, 1)).toBeNull();
});
it("makes reopening a skipped workout explicit", () => {
  expect(
    liftingStartOption({ ...state, events: [{ ...state.events[0]!, status: "skipped" }] }, 1, 1),
  ).toEqual({ cycleIndex: 1, label: "Start skipped workout" });
});
it("never offers lifting for run-only days", () => {
  expect(
    liftingStartOption({ ...state, slots: [{ ...state.slots[0]!, includesLifting: false }] }, 1, 1),
  ).toBeNull();
});
const midCycleStart: ScheduleState = {
  ...state,
  startDayIndex: 2,
  slots: [
    { dayIndex: 1, name: "Earlier lift", includesLifting: true, includesRun: false },
    { dayIndex: 2, name: "Starting lift", includesLifting: true, includesRun: false },
  ],
  events: [],
};
it("offers the next cycle's lift when the programme started after that day", () => {
  expect(liftingStartOption(midCycleStart, 1, 1)).toEqual({
    cycleIndex: 2,
    label: "Start next cycle",
  });
});
it("does not invent a pre-start lift when no later cycle exists", () => {
  expect(liftingStartOption({ ...midCycleStart, cycles: 1 }, 1, 1)).toBeNull();
});
