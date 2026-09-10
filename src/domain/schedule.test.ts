import { describe, expect, it } from "vitest";

import {
  nextPendingSlot,
  partStatus,
  pendingParts,
  progress,
  projectedEndDate,
  sessionsBehind,
  slotParts,
  slotStatus,
  suggestion,
  type ScheduleState,
  type SlotEvent,
} from "./schedule";
import type { SlotPart } from "./types";

const lift = (dayIndex: number, name: string) => ({
  dayIndex,
  name,
  includesLifting: true,
  includesRun: false,
});
const liftAndRun = (dayIndex: number, name: string) => ({
  dayIndex,
  name,
  includesLifting: true,
  includesRun: true,
});

const SLOTS = [
  lift(1, "Lower A"),
  lift(2, "Upper A"),
  liftAndRun(3, "Easy Run + Arms"),
  lift(4, "Lower B"),
  lift(5, "Upper B"),
  liftAndRun(6, "Easy Run + Light Upper"),
  { dayIndex: 7, name: "Rest + Mobility", includesLifting: false, includesRun: false },
];

// Keep coverage for historical programme versions that began partway through a cycle.
function state(events: SlotEvent[] = []): ScheduleState {
  return { slots: SLOTS, cycles: 8, startDayIndex: 2, events };
}

/** Every part of a day answered at once: what "the whole day is done" looks like. */
const done = (cycleIndex: number, dayIndex: number): SlotEvent[] =>
  slotParts(SLOTS.find((slot) => slot.dayIndex === dayIndex)!).map((part) => ({
    cycleIndex,
    dayIndex,
    part,
    status: "completed" as const,
  }));
const skip = (cycleIndex: number, dayIndex: number): SlotEvent[] =>
  slotParts(SLOTS.find((slot) => slot.dayIndex === dayIndex)!).map((part) => ({
    cycleIndex,
    dayIndex,
    part,
    status: "skipped" as const,
  }));
/** One half of a day, which is what finishing a workout or logging a run actually writes. */
const part = (
  cycleIndex: number,
  dayIndex: number,
  which: SlotPart,
  status: "completed" | "skipped" = "completed",
): SlotEvent => ({ cycleIndex, dayIndex, part: which, status });

describe("shift scheduling", () => {
  it("starts a full Tuesday cycle with Lower A and finishes eight weeks on Monday", () => {
    const full = { ...state(), startDayIndex: 1 };
    expect(nextPendingSlot(full)).toEqual({ cycleIndex: 1, dayIndex: 1 });
    expect(progress(full).total).toBe(56);
    expect(projectedEndDate(full, "2026-09-08")).toBe("2026-11-02");
    expect(nextPendingSlot({ ...full, events: done(1, 1) })).toEqual({
      cycleIndex: 1,
      dayIndex: 2,
    });
    expect(nextPendingSlot({ ...full, events: SLOTS.flatMap((s) => done(1, s.dayIndex)) })).toEqual(
      {
        cycleIndex: 2,
        dayIndex: 1,
      },
    );
  });
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
    expect(nextPendingSlot(state(done(1, 2)))).toEqual({ cycleIndex: 1, dayIndex: 3 });
    expect(nextPendingSlot(state([...done(1, 2), ...skip(1, 3)]))).toEqual({
      cycleIndex: 1,
      dayIndex: 4,
    });
  });

  it("comes back to a slot that was jumped over", () => {
    // Did Lower B while Run + Arms was still pending → Run + Arms is suggested next.
    expect(nextPendingSlot(state([...done(1, 2), ...done(1, 4)]))).toEqual({
      cycleIndex: 1,
      dayIndex: 3,
    });
  });

  it("wraps into the next cycle after the rest slot", () => {
    const cycleOne = [2, 3, 4, 5, 6, 7].flatMap((day) => done(1, day));
    expect(nextPendingSlot(state(cycleOne))).toEqual({ cycleIndex: 2, dayIndex: 1 });
    expect(progress(state(cycleOne)).currentCycle).toBe(2);
  });

  it("suggests the rest day but offers the next training slot, auto-completing the rest", () => {
    const s = suggestion(state([2, 3, 4, 5, 6].flatMap((day) => done(1, day))));
    expect(s).toEqual({
      slot: { cycleIndex: 1, dayIndex: 7 },
      restSlotsBefore: [{ cycleIndex: 1, dayIndex: 7 }],
      nextTrainingSlot: { cycleIndex: 2, dayIndex: 1 },
    });
    const training = suggestion(state(done(1, 2)));
    expect(training).toEqual({
      slot: { cycleIndex: 1, dayIndex: 3 },
      restSlotsBefore: [],
      nextTrainingSlot: null,
    });
  });

  it("finishes after eight cycles", () => {
    const events: SlotEvent[] = [];
    for (let c = 1; c <= 8; c++)
      for (let d = c === 1 ? 2 : 1; d <= 7; d++) events.push(...done(c, d));
    expect(nextPendingSlot(state(events))).toBeNull();
    expect(suggestion(state(events))).toBeNull();
    expect(progress(state(events)).remaining).toBe(0);
    expect(projectedEndDate(state(events), "2026-11-05")).toBeNull();
  });

  it("keeps a day that lifts and runs until both halves are answered", () => {
    const ref = { cycleIndex: 1, dayIndex: 3 };
    // Upper A done, then the workout of the run day. The day is still what Today offers.
    const afterWorkout = state([...done(1, 2), part(1, 3, "session")]);
    expect(nextPendingSlot(afterWorkout)).toEqual(ref);
    expect(partStatus(afterWorkout, ref, "session")).toBe("completed");
    expect(partStatus(afterWorkout, ref, "run")).toBe("pending");
    expect(pendingParts(afterWorkout, ref)).toEqual(["run"]);
    expect(slotStatus(afterWorkout, ref)).toBe("pending");
    // It counts against the programme only once the run is in too.
    expect(progress(afterWorkout).completed).toBe(1);
    const afterRun = state([...done(1, 2), part(1, 3, "session"), part(1, 3, "run")]);
    expect(nextPendingSlot(afterRun)).toEqual({ cycleIndex: 1, dayIndex: 4 });
    expect(slotStatus(afterRun, ref)).toBe("completed");
    expect(progress(afterRun).completed).toBe(2);
  });

  it("lets either half be skipped without answering for the other", () => {
    const ref = { cycleIndex: 1, dayIndex: 3 };
    // The run is skipped first; the workout is still owed, so the day stays.
    const runSkipped = state([...done(1, 2), part(1, 3, "run", "skipped")]);
    expect(nextPendingSlot(runSkipped)).toEqual(ref);
    expect(pendingParts(runSkipped, ref)).toEqual(["session"]);
    const both = state([...done(1, 2), part(1, 3, "run", "skipped"), part(1, 3, "session")]);
    expect(nextPendingSlot(both)).toEqual({ cycleIndex: 1, dayIndex: 4 });
    // A day one half of which was skipped is a skipped day, not a completed one.
    expect(slotStatus(both, ref)).toBe("skipped");
    expect(progress(both)).toMatchObject({ completed: 1, skipped: 1 });
  });

  it("measures how far behind the calendar you are and projects the end date", () => {
    expect(sessionsBehind(state(), "2026-09-08", "2026-09-08")).toBe(0);
    expect(sessionsBehind(state(done(1, 2)), "2026-09-08", "2026-09-09")).toBe(0);
    // Two days passed, one session done → one behind; everything later shifts by a day.
    expect(sessionsBehind(state(done(1, 2)), "2026-09-08", "2026-09-10")).toBe(1);
    expect(sessionsBehind(state([...done(1, 2), ...skip(1, 3)]), "2026-09-08", "2026-09-10")).toBe(
      0,
    );
    // Perfect attendance from 8 September ends on Sunday 1 November.
    expect(projectedEndDate(state(), "2026-09-08")).toBe("2026-11-01");
    // One missed day pushes the end to 2 November.
    expect(projectedEndDate(state(done(1, 2)), "2026-09-10")).toBe("2026-11-02");
  });
});
