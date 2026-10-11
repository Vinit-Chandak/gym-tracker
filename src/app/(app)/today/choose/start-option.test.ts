import { describe, expect, it } from "vitest";
import type { ScheduleState, SlotEvent } from "@/domain/schedule";
import { liftingStartOption } from "./start-option";

const state: ScheduleState = {
  slots: [{ dayIndex: 1, name: "Lift and run", includesLifting: true, includesRun: true }],
  cycles: 2,
  startDayIndex: 1,
  events: [{ cycleIndex: 1, dayIndex: 1, part: "session", status: "completed" }],
};
it("repeats a done lift as the next cycle's while this cycle still owes its run", () => {
  expect(liftingStartOption(state, 1, 1)).toEqual({ cycleIndex: 2, label: "Do again" });
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
it("offers the next cycle's lift early when the programme started after that day", () => {
  expect(liftingStartOption(midCycleStart, 1, 1)).toEqual({ cycleIndex: 2, label: "Start early" });
  // Once the first cycle's own day is trained, it is what comes next: the next cycle starting.
  const trained: ScheduleState = {
    ...midCycleStart,
    events: [{ cycleIndex: 1, dayIndex: 2, part: "session", status: "completed" }],
  };
  expect(liftingStartOption(trained, 1, 1)).toEqual({
    cycleIndex: 2,
    label: "Start next cycle",
  });
});
it("does not invent a pre-start lift when no later cycle exists", () => {
  expect(liftingStartOption({ ...midCycleStart, cycles: 1 }, 1, 1)).toBeNull();
});

describe("a day done while its cycle still has days to train", () => {
  const done = (cycleIndex: number, dayIndex: number): SlotEvent => ({
    cycleIndex,
    dayIndex,
    part: "session",
    status: "completed",
  });
  const week = (events: SlotEvent[]): ScheduleState => ({
    slots: [
      { dayIndex: 1, name: "Push A", includesLifting: true, includesRun: false },
      { dayIndex: 2, name: "Pull A", includesLifting: true, includesRun: false },
      { dayIndex: 3, name: "Legs A", includesLifting: true, includesRun: false },
      { dayIndex: 4, name: "Rest", includesLifting: false, includesRun: false },
    ],
    cycles: 4,
    startDayIndex: 1,
    events,
  });
  // The first two cycles trained, then Push A and Pull A of the third.
  const trained = [1, 2].flatMap((cycle) => [1, 2, 3, 4].map((day) => done(cycle, day)));

  it("is done again, ahead of the sequence, rather than the next cycle started", () => {
    const state = week([...trained, done(3, 1), done(3, 2)]);
    expect(liftingStartOption(state, 3, 1)).toEqual({ cycleIndex: 4, label: "Do again" });
    expect(liftingStartOption(state, 3, 3)).toEqual({ cycleIndex: 3, label: "Start" });
  });

  it("starts the next cycle once this one's training is answered, its rest day aside", () => {
    // Sofia's Choose a day in the year audit: every lift of cycle 3 done, its rest day to come.
    const state = week([...trained, done(3, 1), done(3, 2), done(3, 3)]);
    expect(liftingStartOption(state, 3, 1)).toEqual({ cycleIndex: 4, label: "Start next cycle" });
    // The next cycle's second day is still ahead of its first.
    expect(liftingStartOption(state, 3, 2)).toEqual({ cycleIndex: 4, label: "Do again" });
  });
});
