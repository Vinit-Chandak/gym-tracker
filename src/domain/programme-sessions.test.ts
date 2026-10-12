import { describe, expect, it } from "vitest";

import type { OccurrenceResolution } from "./occurrences";
import {
  enduranceAdherence,
  liftingAdherence,
  sessionStanding,
  type ProgrammeSession,
} from "./programme-sessions";
import { withDerivedRunEvents, type ScheduleState, type SlotEvent } from "./schedule";

/** Liam's half-marathon week: three lifts, three runs, a rest day, each on its own weekday. */
const SLOTS = [
  { dayIndex: 1, name: "Upper", includesLifting: true, includesRun: false, dayOfWeek: 1 },
  { dayIndex: 2, name: "Easy run", includesLifting: false, includesRun: true, dayOfWeek: 2 },
  { dayIndex: 3, name: "Lower", includesLifting: true, includesRun: false, dayOfWeek: 3 },
  { dayIndex: 4, name: "Tempo run", includesLifting: false, includesRun: true, dayOfWeek: 4 },
  { dayIndex: 5, name: "Full body", includesLifting: true, includesRun: false, dayOfWeek: 5 },
  { dayIndex: 6, name: "Long run", includesLifting: false, includesRun: true, dayOfWeek: 6 },
  { dayIndex: 7, name: "Rest", includesLifting: false, includesRun: false, dayOfWeek: 7 },
];

/**
 * Cycles 1 and 2 answered in full, cycle 3 up to its Wednesday. The sequence waits at cycle 3's
 * tempo run, which the calendar put on Thursday 17 September; today is 11 October.
 */
function state(extra: SlotEvent[] = [], slots = SLOTS): ScheduleState {
  const done = (cycleIndex: number, dayIndex: number): SlotEvent => ({
    cycleIndex,
    dayIndex,
    part: slots[dayIndex - 1]!.includesRun ? "run" : "session",
    status: "completed",
  });
  const events: SlotEvent[] = [];
  for (const cycle of [1, 2]) for (let day = 1; day <= 7; day++) events.push(done(cycle, day));
  events.push(done(3, 1), done(3, 2), done(3, 3));
  return { slots, cycles: 4, startDayIndex: 1, repeats: "weekly", events: [...events, ...extra] };
}

const TODAY = "2026-10-11";
const incomplete: OccurrenceResolution = { kind: "incomplete" };
const run = (
  cycleIndex: number | null,
  cycleDayIndex: number | null,
  scheduledOn: string,
  resolution: OccurrenceResolution = incomplete,
): ProgrammeSession => ({ cycleIndex, cycleDayIndex, scheduledOn, resolution });

describe("where a programme's run stands", () => {
  it("is Today's run at the slot the sequence has reached, however long ago its date was", () => {
    expect(sessionStanding(state(), run(3, 4, "2026-09-17"), TODAY)).toBe("next");
  });

  /** The sequence waits (owner, 11 October 2026): a date going by is not a run missed. */
  it("is still to come further along the sequence, even with its date behind it", () => {
    expect(sessionStanding(state(), run(3, 6, "2026-09-19"), TODAY)).toBe("to_come");
    expect(sessionStanding(state(), run(4, 2, "2026-09-22"), TODAY)).toBe("to_come");
  });

  it("is what answered it once something did, whatever day that was", () => {
    const late: OccurrenceResolution = {
      kind: "logged",
      activityId: "a",
      outcome: "logged",
      occurredOn: "2026-10-09",
    };
    expect(sessionStanding(state(), run(3, 2, "2026-09-15", late), TODAY)).toBe("logged");
    expect(sessionStanding(state(), run(3, 6, "2026-09-19", { kind: "skipped" }), TODAY)).toBe(
      "skipped",
    );
    expect(sessionStanding(state(), run(4, 4, "2026-09-24", { kind: "cancelled" }), TODAY)).toBe(
      "cancelled",
    );
  });

  /**
   * Skipping the run from Today, or picking up from today, skips the run itself (owner, 12
   * October 2026), so the programme says what the coach's adherence says.
   */
  it("reads as skipped when its run was skipped from Today, and the sequence moves past it", () => {
    const skipped = state(
      withDerivedRunEvents([], [{ cycleIndex: 3, dayIndex: 4, outcome: "skipped" }]),
    );
    expect(sessionStanding(skipped, run(3, 4, "2026-09-17", { kind: "skipped" }), TODAY)).toBe(
      "skipped",
    );
    expect(sessionStanding(skipped, run(3, 6, "2026-09-19"), TODAY)).toBe("to_come");
  });

  /**
   * A skip the day recorded before then, its run since put back: owed, as the coach is told,
   * and the sequence waits for it again, rather than "Skipped" here and "not done" there.
   */
  it("is owed once its run is owed again, whatever the day recorded before", () => {
    const putBack = state(
      withDerivedRunEvents(
        [{ cycleIndex: 3, dayIndex: 4, part: "run", status: "skipped" }],
        [{ cycleIndex: 3, dayIndex: 4, outcome: "incomplete" }],
      ),
    );
    expect(sessionStanding(putBack, run(3, 4, "2026-09-17"), TODAY)).toBe("next");
  });

  it("reads a run completed on the sequence with no activity behind it as completed earlier", () => {
    expect(sessionStanding(state(), run(1, 2, "2026-09-01"), TODAY)).toBe("legacy_completed");
  });

  it("is not done once the sequence has passed it with no answer", () => {
    // A revision made Tuesday a lifting day: the run left on it no longer holds anything up,
    // and the sequence has gone on to Thursday without it.
    const lifting = SLOTS.map((slot) =>
      slot.dayIndex === 2 ? { ...slot, includesRun: false, includesLifting: true } : slot,
    );
    const revised = state([], lifting);
    expect(sessionStanding(revised, run(3, 4, "2026-09-17"), TODAY)).toBe("next");
    expect(sessionStanding(revised, run(3, 2, "2026-09-15"), TODAY)).toBe("not_done");
  });

  it("goes by its date when it belongs to no slot the programme has", () => {
    expect(sessionStanding(state(), run(null, null, "2026-10-01"), TODAY)).toBe("not_done");
    expect(sessionStanding(state(), run(null, null, "2026-10-12"), TODAY)).toBe("to_come");
    // A cycle the programme no longer runs to.
    expect(sessionStanding(state(), run(9, 2, "2026-11-10"), TODAY)).toBe("to_come");
  });
});

describe("adherence", () => {
  it("counts the lifting days from the sequence, each day once", () => {
    const skippedLift = state([{ cycleIndex: 3, dayIndex: 5, part: "session", status: "skipped" }]);
    // Twelve lifting days: six done in cycles 1–2, two in cycle 3, one skipped, three to come.
    expect(liftingAdherence(skippedLift)).toEqual({
      sport: "strength",
      done: 8,
      skipped: 1,
      toCome: 3,
      notDone: 0,
      cancelled: 0,
    });
  });

  it("has nothing to say of lifting for a programme with no lifting days", () => {
    const runsOnly: ScheduleState = {
      ...state(),
      slots: SLOTS.map((slot) => ({ ...slot, includesLifting: false })),
    };
    expect(liftingAdherence(runsOnly)).toBeNull();
  });

  it("counts each endurance sport by where its sessions stand", () => {
    expect(
      enduranceAdherence([
        { sport: "running", standing: "logged" },
        { sport: "running", standing: "legacy_completed" },
        { sport: "running", standing: "next" },
        { sport: "running", standing: "to_come" },
        { sport: "running", standing: "skipped" },
        { sport: "running", standing: "cancelled" },
        { sport: "swimming", standing: "not_done" },
      ]),
    ).toEqual([
      { sport: "running", done: 2, skipped: 1, toCome: 2, notDone: 0, cancelled: 1 },
      { sport: "swimming", done: 0, skipped: 0, toCome: 0, notDone: 1, cancelled: 0 },
    ]);
  });
});
