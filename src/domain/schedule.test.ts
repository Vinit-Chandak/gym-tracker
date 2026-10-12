import { describe, expect, it } from "vitest";

import { addDays } from "./program-calendar";
import {
  allSlots as allSlotsOf,
  finishedOn,
  missedSlots,
  nextPendingSlot,
  partStatus,
  pickUpFromToday,
  pendingParts,
  progress,
  projectedEndDate,
  runEventsFromOccurrences,
  sessionsBehind,
  slotFinishedOn,
  slotDates,
  slotParts,
  slotStatus,
  suggestion,
  withDerivedRunEvents,
  type ScheduleState,
  type SlotEvent,
  type SlotOccurrence,
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

describe("behind the calendar", () => {
  const trained = [1, 2, 3, 4, 5, 6].flatMap((day) => (day === 1 ? [] : done(1, day)));

  it("never counts a rest day that simply passed", () => {
    // Every training day of the first week done, the rest day untapped, and day 1 of the
    // second cycle done on its own day: nothing is behind.
    const events = [...trained, ...done(2, 1)];
    expect(sessionsBehind(state(events), "2026-09-08", "2026-09-15")).toBe(0);
    expect(missedSlots(state(events), "2026-09-08", "2026-09-15")).toEqual([]);
  });

  it("counts the training days whose date has passed and that still owe something", () => {
    // Days 2 and 3 done; 4 and 5 missed, and 6 still owes its run.
    const events = [...done(1, 2), ...done(1, 3), part(1, 6, "session")];
    expect(missedSlots(state(events), "2026-09-08", "2026-09-14")).toEqual([
      { cycleIndex: 1, dayIndex: 4 },
      { cycleIndex: 1, dayIndex: 5 },
      { cycleIndex: 1, dayIndex: 6 },
    ]);
    expect(sessionsBehind(state(events), "2026-09-08", "2026-09-14")).toBe(3);
  });

  it("picks up from today: the missed days skipped, the rest days passed, today's day next", () => {
    const events = [...done(1, 2), part(1, 6, "session")];
    // From 8 September at day 2, the calendar's day for 14 September is cycle 2, day 1.
    const pickUp = pickUpFromToday(state(events), "2026-09-08", "2026-09-14");
    expect(pickUp.skip).toEqual([
      { ref: { cycleIndex: 1, dayIndex: 3 }, part: "session" },
      { ref: { cycleIndex: 1, dayIndex: 3 }, part: "run" },
      { ref: { cycleIndex: 1, dayIndex: 4 }, part: "session" },
      { ref: { cycleIndex: 1, dayIndex: 5 }, part: "session" },
      { ref: { cycleIndex: 1, dayIndex: 6 }, part: "run" },
    ]);
    // The rest day keeps its own date, the day before today's.
    expect(pickUp.rest).toEqual([{ ref: { cycleIndex: 1, dayIndex: 7 }, date: "2026-09-13" }]);
    expect(pickUp.resumeAt).toEqual({ cycleIndex: 2, dayIndex: 1 });
    // Answered as it says, nothing is behind and the next day is today's.
    const answered = state([
      ...events,
      ...pickUp.skip.map(({ ref, part: which }) =>
        part(ref.cycleIndex, ref.dayIndex, which, "skipped"),
      ),
      ...pickUp.rest.map(({ ref }) => part(ref.cycleIndex, ref.dayIndex, "session")),
    ]);
    expect(sessionsBehind(answered, "2026-09-08", "2026-09-14")).toBe(0);
    expect(nextPendingSlot(answered)).toEqual({ cycleIndex: 2, dayIndex: 1 });
  });

  it("ends a programme whose only days left are rest days", () => {
    // Everything trained but the last rest day, which nobody tapped: the programme is over.
    const events = allSlotsOf(state()).flatMap((ref) =>
      ref.cycleIndex === 8 && ref.dayIndex === 7 ? [] : done(ref.cycleIndex, ref.dayIndex),
    );
    expect(nextPendingSlot(state(events))).toBeNull();
    expect(progress(state(events))).toMatchObject({ total: 55, completed: 55, remaining: 0 });
    // A rest day with training still owed after it is not the end.
    const early = events.filter((event) => !(event.cycleIndex === 8 && event.dayIndex === 6));
    expect(nextPendingSlot(state(early))).toEqual({ cycleIndex: 8, dayIndex: 6 });
  });

  it("reads the rest days a finished programme ends on as done, as its progress counts them", () => {
    const last = { cycleIndex: 8, dayIndex: 7 };
    const events = allSlotsOf(state()).flatMap((ref) =>
      ref.cycleIndex === 8 && ref.dayIndex === 7 ? [] : done(ref.cycleIndex, ref.dayIndex),
    );
    expect(slotStatus(state(events), last)).toBe("completed");
    // Until the programme is over, an untapped rest day is still to come.
    const early = events.filter((event) => !(event.cycleIndex === 8 && event.dayIndex === 6));
    expect(slotStatus(state(early), last)).toBe("pending");
    expect(slotStatus(state(early), { cycleIndex: 8, dayIndex: 6 })).toBe("pending");
  });

  it("is finished on the day its last day was answered, not the day it was planned to end", () => {
    const events = allSlotsOf(state()).flatMap((ref, index) =>
      ref.cycleIndex === 8 && ref.dayIndex === 7
        ? []
        : done(ref.cycleIndex, ref.dayIndex).map((event) => ({
            ...event,
            // A day a day from 8 September, then a week off before the last one.
            occurredOn: addDays(
              "2026-09-08",
              index + (ref.cycleIndex === 8 && ref.dayIndex === 6 ? 7 : 0),
            ),
          })),
    );
    expect(finishedOn(state(events))).toBe("2026-11-07");
    // Still going, it has no finish yet.
    expect(
      finishedOn(state(events.filter((event) => event.occurredOn !== "2026-11-07"))),
    ).toBeNull();
    // An answer for a day the programme does not have is not its finish.
    expect(
      finishedOn(state([...events, { ...part(9, 1, "session"), occurredOn: "2026-12-01" }])),
    ).toBe("2026-11-07");
  });

  it("projects the end from tomorrow once today's day is finished", () => {
    const events = done(1, 2);
    expect(projectedEndDate(state(events), "2026-09-08", true)).toBe(
      projectedEndDate(state(events), "2026-09-09"),
    );
  });
});

describe("the day finished today", () => {
  const on = (event: SlotEvent, occurredOn: string): SlotEvent => ({ ...event, occurredOn });

  it("is the day whose workout was logged today, which moves Today on to the next", () => {
    const events = [
      on(part(1, 2, "session"), "2026-09-24"),
      on(part(1, 4, "session"), "2026-09-25"),
    ];
    // Day 3 was skipped yesterday; day 4 was trained today and day 5 is what the sequence offers.
    const withSkip = state([
      ...events,
      on(part(1, 3, "session", "skipped"), "2026-09-24"),
      on(part(1, 3, "run", "skipped"), "2026-09-24"),
    ]);
    expect(slotFinishedOn(withSkip, "2026-09-25")).toEqual({ cycleIndex: 1, dayIndex: 4 });
    expect(nextPendingSlot(withSkip)).toEqual({ cycleIndex: 1, dayIndex: 5 });
    expect(slotFinishedOn(withSkip, "2026-09-26")).toBeNull();
  });

  it("is nothing while the day still owes its run, because Today is still on it", () => {
    const workoutOnly = state([...done(1, 2), on(part(1, 3, "session"), "2026-09-25")]);
    expect(slotFinishedOn(workoutOnly, "2026-09-25")).toBeNull();
    const both = state([...done(1, 2), on(part(1, 3, "session"), "2026-09-25"), part(1, 3, "run")]);
    expect(slotFinishedOn(both, "2026-09-25")).toEqual({ cycleIndex: 1, dayIndex: 3 });
  });

  it("is nothing for a day skipped today: the next one is still today's to train", () => {
    const skipped = state([
      ...done(1, 2),
      on(part(1, 3, "session", "skipped"), "2026-09-25"),
      on(part(1, 3, "run", "skipped"), "2026-09-25"),
    ]);
    expect(slotFinishedOn(skipped, "2026-09-25")).toBeNull();
  });

  it("counts a rest day marked done", () => {
    const events = [1, 2, 3, 4, 5, 6].flatMap((day) => (day === 1 ? [] : done(1, day)));
    const rested = state([...events, on(part(1, 7, "session"), "2026-09-25")]);
    expect(slotFinishedOn(rested, "2026-09-25")).toEqual({ cycleIndex: 1, dayIndex: 7 });
  });

  /**
   * A day that only runs has no workout to finish: its run is the whole day. Read only through
   * the workout, a run logged this morning left the day unfinished, so Today offered the next day
   * as today's and the run that had just been logged vanished from it.
   */
  it("is a day that only runs, once its run was logged today", () => {
    const slots = [
      lift(1, "Lower"),
      { dayIndex: 2, name: "Easy run", includesLifting: false, includesRun: true },
      lift(3, "Upper"),
    ];
    const ran = (occurredOn: string): ScheduleState => ({
      slots,
      cycles: 4,
      startDayIndex: 1,
      events: withDerivedRunEvents(
        [on(part(1, 1, "session"), "2026-09-24")],
        [{ cycleIndex: 1, dayIndex: 2, outcome: "logged", occurredOn }],
      ),
    });
    expect(slotFinishedOn(ran("2026-09-25"), "2026-09-25")).toEqual({ cycleIndex: 1, dayIndex: 2 });
    expect(nextPendingSlot(ran("2026-09-25"))).toEqual({ cycleIndex: 1, dayIndex: 3 });
    // Logged yesterday, it was yesterday's: today the next day is today's.
    expect(slotFinishedOn(ran("2026-09-24"), "2026-09-25")).toBeNull();
  });

  it("is a day that lifts and runs by whichever half was done last", () => {
    const lifted = on(part(1, 3, "session"), "2026-09-24");
    const ranToday = state([...done(1, 2), lifted, on(part(1, 3, "run"), "2026-09-25")]);
    expect(slotFinishedOn(ranToday, "2026-09-25")).toEqual({ cycleIndex: 1, dayIndex: 3 });
    expect(slotFinishedOn(ranToday, "2026-09-24")).toBeNull();
    // Skipping the run this morning finishes nothing today: the workout was yesterday's.
    const skippedToday = state([
      ...done(1, 2),
      lifted,
      on(part(1, 3, "run", "skipped"), "2026-09-25"),
    ]);
    expect(slotFinishedOn(skippedToday, "2026-09-25")).toBeNull();
  });
});

describe("endurance answers the day it belongs to", () => {
  const occurrence = (
    cycleIndex: number,
    dayIndex: number,
    outcome: SlotOccurrence["outcome"],
  ): SlotOccurrence => ({ cycleIndex, dayIndex, outcome });

  it("a logged run answers the run half of its day", () => {
    expect(runEventsFromOccurrences([occurrence(2, 3, "logged")])).toEqual([
      { cycleIndex: 2, dayIndex: 3, part: "run", status: "completed" },
    ]);
  });

  it("dates the run half by the last log that answered it", () => {
    const logged = (occurredOn: string): SlotOccurrence => ({
      ...occurrence(2, 3, "logged"),
      occurredOn,
    });
    expect(
      runEventsFromOccurrences([
        logged("2026-09-25"),
        logged("2026-09-24"),
        occurrence(2, 3, "skipped"),
      ]),
    ).toEqual([
      { cycleIndex: 2, dayIndex: 3, part: "run", status: "completed", occurredOn: "2026-09-25" },
    ]);
    // Nothing logged, nothing to date it by.
    expect(runEventsFromOccurrences([occurrence(2, 3, "skipped")])[0]).not.toHaveProperty(
      "occurredOn",
    );
  });

  it("a run nobody has answered yet leaves the day owing it", () => {
    expect(runEventsFromOccurrences([occurrence(2, 3, "incomplete")])).toEqual([]);
  });

  it("holds the day until every session it asks for is answered", () => {
    const two = [occurrence(2, 3, "logged"), occurrence(2, 3, "incomplete")];
    expect(runEventsFromOccurrences(two)).toEqual([]);
  });

  it("counts a skipped run as skipped, and a logged one alongside it as done", () => {
    expect(runEventsFromOccurrences([occurrence(1, 6, "skipped")])).toEqual([
      { cycleIndex: 1, dayIndex: 6, part: "run", status: "skipped" },
    ]);
    expect(
      runEventsFromOccurrences([occurrence(1, 6, "skipped"), occurrence(1, 6, "logged")]),
    ).toEqual([{ cycleIndex: 1, dayIndex: 6, part: "run", status: "completed" }]);
  });

  it("asks nothing of work the programme itself withdrew", () => {
    expect(runEventsFromOccurrences([occurrence(3, 3, "cancelled")])).toEqual([
      { cycleIndex: 3, dayIndex: 3, part: "run", status: "completed" },
    ]);
  });

  it("keeps the answer somebody gave by hand", () => {
    const recorded: SlotEvent[] = [
      { cycleIndex: 2, dayIndex: 3, part: "run", status: "completed" },
      { cycleIndex: 2, dayIndex: 4, part: "run", status: "skipped" },
    ];
    // A completion recorded on the day stands, whatever its run says; so does a skip its runs
    // agree with, or that only work the programme withdrew stands beside.
    expect(
      withDerivedRunEvents(recorded, [
        occurrence(2, 3, "incomplete"),
        occurrence(2, 4, "cancelled"),
        occurrence(2, 6, "logged"),
      ]),
    ).toEqual([
      { cycleIndex: 2, dayIndex: 3, part: "run", status: "completed" },
      { cycleIndex: 2, dayIndex: 4, part: "run", status: "skipped" },
      { cycleIndex: 2, dayIndex: 6, part: "run", status: "completed" },
    ]);
  });

  /**
   * A skip recorded on the day, from before Today skipped the runs themselves, gives way to
   * them as a skipped workout gives way to one finished after all (owner, 12 October 2026).
   */
  it("lets a skip recorded on the day give way to its run logged, or owed again", () => {
    const skipped: SlotEvent[] = [{ cycleIndex: 2, dayIndex: 3, part: "run", status: "skipped" }];
    expect(withDerivedRunEvents(skipped, [occurrence(2, 3, "logged")])).toEqual([
      { cycleIndex: 2, dayIndex: 3, part: "run", status: "completed" },
    ]);
    expect(withDerivedRunEvents(skipped, [occurrence(2, 3, "legacy_completed")])).toEqual([
      { cycleIndex: 2, dayIndex: 3, part: "run", status: "completed" },
    ]);
    // Put back, or its log deleted: owed, so the day is owed and the sequence waits for it.
    expect(withDerivedRunEvents(skipped, [occurrence(2, 3, "incomplete")])).toEqual([]);
    // One of two put back is still one owed.
    expect(
      withDerivedRunEvents(skipped, [occurrence(2, 3, "skipped"), occurrence(2, 3, "incomplete")]),
    ).toEqual([]);
    // Skipped on the runs too, as the migration left it: one answer, said once.
    expect(withDerivedRunEvents(skipped, [occurrence(2, 3, "skipped")])).toEqual(skipped);
    // A day with no runs of its own keeps the skip it recorded.
    expect(withDerivedRunEvents(skipped, [])).toEqual(skipped);
  });

  /**
   * The sequence must move past a running day once the run is logged. Without the derived
   * event nothing ever answered the run half, so every running day held the programme where
   * it stood and Today went on offering a day the athlete had already trained.
   */
  it("lets the sequence move past a day that lifts and runs", () => {
    const lifted: SlotEvent[] = [
      { cycleIndex: 1, dayIndex: 3, part: "session", status: "completed" },
    ];
    const stalled = state([...done(1, 2), ...lifted]);
    expect(nextPendingSlot(stalled)).toEqual({ cycleIndex: 1, dayIndex: 3 });

    const ran = state(
      withDerivedRunEvents([...done(1, 2), ...lifted], [occurrence(1, 3, "logged")]),
    );
    expect(slotStatus(ran, { cycleIndex: 1, dayIndex: 3 })).toBe("completed");
    expect(nextPendingSlot(ran)).toEqual({ cycleIndex: 1, dayIndex: 4 });
  });
});

describe("a cycle that repeats every week on fewer than seven days", () => {
  // Monday, Wednesday and Friday, eight weeks: eight cycles, each day on its weekday.
  const mwf = (events: SlotEvent[] = []): ScheduleState => ({
    slots: [
      { ...lift(1, "Full body A"), dayOfWeek: 1 },
      { ...lift(2, "Full body B"), dayOfWeek: 3 },
      { ...lift(3, "Full body C"), dayOfWeek: 5 },
    ],
    cycles: 8,
    startDayIndex: 1,
    events,
    repeats: "weekly",
  });

  it("lays each day on its weekday, from the first Monday on or after the start", () => {
    // Started on Thursday 10 September 2026: the first Monday is the 14th.
    const dates = slotDates(mwf(), "2026-09-10").map(({ date }) => date);
    expect(dates.slice(0, 4)).toEqual(["2026-09-14", "2026-09-16", "2026-09-18", "2026-09-21"]);
    expect(dates).toHaveLength(24);
  });

  it("owes nothing for the days between, and nothing before the first Monday", () => {
    expect(sessionsBehind(mwf(), "2026-09-10", "2026-09-14")).toBe(0);
    // Thursday the 17th: Monday and Wednesday have passed untrained.
    expect(missedSlots(mwf(), "2026-09-10", "2026-09-17")).toEqual([
      { cycleIndex: 1, dayIndex: 1 },
      { cycleIndex: 1, dayIndex: 2 },
    ]);
    // Picking up resumes on Friday's day, the next the calendar holds.
    expect(pickUpFromToday(mwf(), "2026-09-10", "2026-09-17").resumeAt).toEqual({
      cycleIndex: 1,
      dayIndex: 3,
    });
  });

  it("projects the end onto the weekdays the days fall on", () => {
    // Nothing done on Monday the 14th: 24 sessions, the last on Friday 6 November.
    expect(projectedEndDate(mwf(), "2026-09-14")).toBe("2026-11-06");
    // The same plan read one slot a day would have ended on 7 October.
    expect(projectedEndDate({ ...mwf(), repeats: null }, "2026-09-14")).toBe("2026-10-07");
  });

  it("is read one slot a day when it predates the choice", () => {
    const dates = slotDates({ ...mwf(), repeats: undefined }, "2026-09-10").map((d) => d.date);
    expect(dates.slice(0, 3)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
  });
});
