import { describe, expect, it } from "vitest";

import type { OccurrenceResolution } from "@/domain/occurrences";
import type { ScheduleState, SlotEvent } from "@/domain/schedule";
import type { ProgrammeOccurrence } from "@/server/repositories/occurrences";

import { programmeView, sessionsNoun } from "./programme-view";

const DAYS = [
  { dayIndex: 1, name: "Upper", includesLifting: true, includesRun: false, dayOfWeek: 1 },
  { dayIndex: 2, name: "Easy run", includesLifting: false, includesRun: true, dayOfWeek: 2 },
  { dayIndex: 3, name: "Rest", includesLifting: false, includesRun: false, dayOfWeek: 3 },
];

const TODAY = "2026-10-11";

function occurrence(
  cycleIndex: number,
  scheduledOn: string,
  resolution: OccurrenceResolution = { kind: "incomplete" },
): ProgrammeOccurrence {
  return {
    id: `run-${cycleIndex}`,
    sport: "running",
    disposition: resolution.kind === "skipped" ? "skipped" : "pending",
    scheduledOn,
    scheduledLocalTime: null,
    orderIndex: 0,
    revisionId: `revision-${cycleIndex}`,
    prescription: null,
    familyId: "family",
    originalWeekIndex: cycleIndex,
    originalScheduledOn: scheduledOn,
    cycleIndex,
    cycleDayIndex: 2,
    resolution,
    loggable: resolution.kind === "incomplete",
  };
}

const logged = (occurredOn: string): OccurrenceResolution => ({
  kind: "logged",
  activityId: `activity-${occurredOn}`,
  outcome: "logged",
  occurredOn,
});

/** Four three-day cycles from 14 September; the athlete trained two, then stopped. */
function state(events: SlotEvent[]): ScheduleState {
  return { slots: DAYS, cycles: 4, startDayIndex: 1, events };
}

describe("the programme page", () => {
  /**
   * Liam, 11 October: cycles 1 and 2 done, then a gap. The calendar put cycle 3's run on
   * 16 September, but the sequence waited for him, so it is the run Today offers — not one he
   * failed to do — and cycle 4's is still to come.
   */
  it("lists what is still to do first, Today's at its head, and nothing as missed for its date", () => {
    const events: SlotEvent[] = [
      { cycleIndex: 1, dayIndex: 1, part: "session", status: "completed" },
      { cycleIndex: 1, dayIndex: 2, part: "run", status: "completed" },
      { cycleIndex: 1, dayIndex: 3, part: "session", status: "completed" },
      { cycleIndex: 2, dayIndex: 1, part: "session", status: "completed" },
      { cycleIndex: 2, dayIndex: 2, part: "run", status: "skipped" },
      { cycleIndex: 2, dayIndex: 3, part: "session", status: "completed" },
      { cycleIndex: 3, dayIndex: 1, part: "session", status: "completed" },
    ];
    const view = programmeView({
      state: state(events),
      days: DAYS,
      occurrences: [
        occurrence(4, "2026-09-23"),
        occurrence(1, "2026-09-15", logged("2026-09-15")),
        occurrence(3, "2026-09-21"),
        occurrence(2, "2026-09-18", { kind: "skipped" }),
      ],
      today: TODAY,
    });

    expect(view.ahead.map((row) => [row.occurrence.cycleIndex, row.standing])).toEqual([
      [3, "next"],
      [4, "to_come"],
    ]);
    expect(view.notDone).toEqual([]);
    // Answered, the latest first.
    expect(view.earlier.map((row) => [row.occurrence.cycleIndex, row.standing])).toEqual([
      [2, "skipped"],
      [1, "logged"],
    ]);
    expect(view.ahead[0]!.dayName).toBe("Easy run");
    // The lists hold runs alone, while the adherence counts lifting too: they are titled so.
    expect(view.titles).toEqual({
      ahead: "Runs to come",
      notDone: "Runs not done",
      earlier: "Earlier runs",
    });
    expect(view.adherence).toEqual([
      { sport: "strength", done: 3, skipped: 0, toCome: 1, notDone: 0, cancelled: 0 },
      { sport: "running", done: 1, skipped: 1, toCome: 2, notDone: 0, cancelled: 0 },
    ]);
  });

  /** Aarav, Jordan, Kenji: a programme that only lifts still has a record to show. */
  it("counts a lifting-only programme's days, with no sessions to list", () => {
    const lifting = DAYS.map((day) => ({ ...day, includesRun: false, includesLifting: true }));
    const view = programmeView({
      state: {
        slots: lifting,
        cycles: 2,
        startDayIndex: 1,
        events: [
          { cycleIndex: 1, dayIndex: 1, part: "session", status: "completed" },
          { cycleIndex: 1, dayIndex: 2, part: "session", status: "skipped" },
        ],
      },
      days: lifting,
      occurrences: [],
      today: TODAY,
    });
    expect(view.adherence).toEqual([
      { sport: "strength", done: 1, skipped: 1, toCome: 4, notDone: 0, cancelled: 0 },
    ]);
    expect([...view.ahead, ...view.notDone, ...view.earlier]).toEqual([]);
  });

  it("leaves lifting out when the page is narrowed to another sport", () => {
    const view = programmeView({
      state: state([]),
      days: DAYS,
      occurrences: [occurrence(1, "2026-09-15")],
      today: TODAY,
      sport: "running",
    });
    expect(view.adherence.map((counts) => counts.sport)).toEqual(["running"]);
  });
});

describe("what the lists are called", () => {
  it("says the sports the sessions are, in the legend's order", () => {
    expect(sessionsNoun(["running", "running"])).toBe("runs");
    expect(sessionsNoun(["swimming", "running"])).toBe("runs and swims");
    expect(sessionsNoun(["swimming", "cycling", "running"])).toBe("runs, rides and swims");
    expect(sessionsNoun([])).toBe("sessions");
  });
});
