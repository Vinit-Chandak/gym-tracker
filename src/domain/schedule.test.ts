import { describe, expect, it } from "vitest";

import {
  nextPendingSlot,
  progress,
  projectedEndDate,
  sessionsBehind,
  suggestion,
  type ScheduleState,
  type SlotEvent,
} from "./schedule";

const SLOTS = [
  { dayIndex: 1, name: "Lower A", isRest: false },
  { dayIndex: 2, name: "Upper A", isRest: false },
  { dayIndex: 3, name: "Easy Run + Arms", isRest: false },
  { dayIndex: 4, name: "Lower B", isRest: false },
  { dayIndex: 5, name: "Upper B", isRest: false },
  { dayIndex: 6, name: "Easy Run + Light Upper", isRest: false },
  { dayIndex: 7, name: "Rest + Mobility", isRest: true },
];

// Started on Tuesday 8 September 2026 with Upper A, so cycle 1 has six slots.
function state(events: SlotEvent[] = []): ScheduleState {
  return { slots: SLOTS, cycles: 8, startDayIndex: 2, events };
}

const done = (cycleIndex: number, dayIndex: number): SlotEvent => ({
  cycleIndex,
  dayIndex,
  status: "completed",
});
const skip = (cycleIndex: number, dayIndex: number): SlotEvent => ({
  cycleIndex,
  dayIndex,
  status: "skipped",
});

describe("shift scheduling", () => {
  it("starts with Upper A and has 55 slots in total", () => {
    expect(nextPendingSlot(state())).toEqual({ cycleIndex: 1, dayIndex: 2 });
    expect(progress(state())).toEqual({
      total: 55,
      completed: 0,
      skipped: 0,
      remaining: 55,
      currentCycle: 1,
    });
  });

  it("moves to the next slot only when one is completed or skipped, never by the calendar", () => {
    expect(nextPendingSlot(state([done(1, 2)]))).toEqual({ cycleIndex: 1, dayIndex: 3 });
    expect(nextPendingSlot(state([done(1, 2), skip(1, 3)]))).toEqual({
      cycleIndex: 1,
      dayIndex: 4,
    });
  });

  it("comes back to a slot that was jumped over", () => {
    // Did Lower B while Run + Arms was still pending → Run + Arms is suggested next.
    expect(nextPendingSlot(state([done(1, 2), done(1, 4)]))).toEqual({
      cycleIndex: 1,
      dayIndex: 3,
    });
  });

  it("wraps into the next cycle after the rest slot", () => {
    const cycleOne = [done(1, 2), done(1, 3), done(1, 4), done(1, 5), done(1, 6), done(1, 7)];
    expect(nextPendingSlot(state(cycleOne))).toEqual({ cycleIndex: 2, dayIndex: 1 });
    expect(progress(state(cycleOne)).currentCycle).toBe(2);
  });

  it("suggests the rest day but offers the next training slot, auto-completing the rest", () => {
    const s = suggestion(state([done(1, 2), done(1, 3), done(1, 4), done(1, 5), done(1, 6)]));
    expect(s).toEqual({
      slot: { cycleIndex: 1, dayIndex: 7 },
      restSlotsBefore: [{ cycleIndex: 1, dayIndex: 7 }],
      nextTrainingSlot: { cycleIndex: 2, dayIndex: 1 },
    });
    const training = suggestion(state([done(1, 2)]));
    expect(training).toEqual({
      slot: { cycleIndex: 1, dayIndex: 3 },
      restSlotsBefore: [],
      nextTrainingSlot: null,
    });
  });

  it("finishes after eight cycles", () => {
    const events: SlotEvent[] = [];
    for (let c = 1; c <= 8; c++) for (let d = c === 1 ? 2 : 1; d <= 7; d++) events.push(done(c, d));
    expect(nextPendingSlot(state(events))).toBeNull();
    expect(suggestion(state(events))).toBeNull();
    expect(progress(state(events)).remaining).toBe(0);
    expect(projectedEndDate(state(events), "2026-11-05")).toBeNull();
  });

  it("measures how far behind the calendar you are and projects the end date", () => {
    expect(sessionsBehind(state(), "2026-09-08", "2026-09-08")).toBe(0);
    expect(sessionsBehind(state([done(1, 2)]), "2026-09-08", "2026-09-09")).toBe(0);
    // Two days passed, one session done → one behind; everything later shifts by a day.
    expect(sessionsBehind(state([done(1, 2)]), "2026-09-08", "2026-09-10")).toBe(1);
    expect(sessionsBehind(state([done(1, 2), skip(1, 3)]), "2026-09-08", "2026-09-10")).toBe(0);
    // Perfect attendance from 8 September ends on Sunday 1 November.
    expect(projectedEndDate(state(), "2026-09-08")).toBe("2026-11-01");
    // One missed day pushes the end to 2 November.
    expect(projectedEndDate(state([done(1, 2)]), "2026-09-10")).toBe("2026-11-02");
  });
});
