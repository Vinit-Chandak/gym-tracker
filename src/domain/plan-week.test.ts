import { describe, expect, it } from "vitest";

import {
  byDay,
  datedStatus,
  liftingWeek,
  weekStartOf,
  type LiftingSchedule,
  type WeekSession,
} from "./plan-week";
import { pickUpFromToday, type ScheduleState, type SlotEvent, type SlotRef } from "./schedule";

const monday = "2026-10-19";
const today = "2026-10-20";

describe("the week", () => {
  it("runs Monday to Sunday", () => {
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-20")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26");
  });
});

describe("a dated session's standing", () => {
  it("is what answered it", () => {
    const logged = {
      kind: "logged",
      activityId: "a",
      outcome: "logged",
      occurredOn: "2026-10-22",
    } as const;
    expect(datedStatus(logged, "2026-10-18", today)).toBe("done");
    expect(datedStatus({ kind: "legacy_completed" }, "2026-10-18", today)).toBe("done");
    expect(datedStatus({ kind: "skipped" }, "2026-10-25", today)).toBe("skipped");
  });

  it("is missed once its day has passed unanswered, today's on the day, and to come after", () => {
    expect(datedStatus({ kind: "incomplete" }, "2026-10-19", today)).toBe("missed");
    expect(datedStatus({ kind: "incomplete" }, today, today)).toBe("today");
    expect(datedStatus({ kind: "incomplete" }, "2026-10-22", today)).toBe("planned");
  });

  it("has no row once a programme change withdrew it", () => {
    expect(datedStatus({ kind: "cancelled" }, today, today)).toBeNull();
  });
});

describe("the week's lifting days", () => {
  type Day = LiftingSchedule["days"][number] & { dayOfWeek?: number };
  // A four-lift week laid one day a slot from a Monday, so the calendar's cycle 4 is this week:
  // Lower A on Monday, Upper A on Tuesday, Lower B on Thursday and Upper B on Friday.
  const DAYS: Day[] = [
    { id: "day-1", dayIndex: 1, name: "Lower A", includesLifting: true },
    { id: "day-2", dayIndex: 2, name: "Upper A", includesLifting: true },
    { id: "day-3", dayIndex: 3, name: "Rest", includesLifting: false },
    { id: "day-4", dayIndex: 4, name: "Lower B", includesLifting: true },
    { id: "day-5", dayIndex: 5, name: "Upper B", includesLifting: true },
    { id: "day-6", dayIndex: 6, name: "Rest", includesLifting: false },
    { id: "day-7", dayIndex: 7, name: "Rest", includesLifting: false },
  ];
  const programme = (
    events: SlotEvent[],
    {
      days = DAYS,
      startDate = "2026-09-28",
      ...state
    }: Partial<ScheduleState> & { days?: Day[]; startDate?: string } = {},
  ): LiftingSchedule => ({
    state: {
      slots: days.map(({ dayIndex, name, includesLifting, dayOfWeek = null }) => ({
        dayIndex,
        name,
        includesLifting,
        includesRun: false,
        dayOfWeek,
      })),
      cycles: 8,
      startDayIndex: 1,
      events,
      ...state,
    },
    days,
    startDate,
  });
  const answer = (
    cycleIndex: number,
    dayIndex: number,
    status: SlotEvent["status"],
    occurredOn?: string,
  ): SlotEvent => ({
    cycleIndex,
    dayIndex,
    part: "session",
    status,
    ...(occurredOn ? { occurredOn } : {}),
  });
  /** Every day of the sequence up to `through` done, long before this week. */
  const doneThrough = (through: SlotRef, days = DAYS): SlotEvent[] =>
    Array.from({ length: through.cycleIndex }, (_, cycle) => cycle + 1).flatMap((cycleIndex) =>
      days
        .filter((day) => cycleIndex < through.cycleIndex || day.dayIndex <= through.dayIndex)
        .map((day) => answer(cycleIndex, day.dayIndex, "completed", "2026-10-01")),
    );
  const rows = (sessions: readonly WeekSession[]) =>
    [...sessions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ title, date, status }) => [title, date, status]);

  it("draws a day owed once, where the sequence will reach it, never on its calendar date", () => {
    // Behind: cycle 3's Lower B is owed, while the calendar has cycle 4's days on this week.
    const sessions = liftingWeek(
      programme(doneThrough({ cycleIndex: 3, dayIndex: 3 })),
      monday,
      today,
    );
    expect(rows(sessions)).toEqual([
      ["Lower B", today, "today"],
      ["Upper B", "2026-10-22", "planned"],
      ["Lower A", "2026-10-23", "planned"],
    ]);
    expect(sessions.map(({ key, dayId }) => [key, dayId])).toEqual([
      ["lift:3:4", "day-4"],
      ["lift:3:5", "day-5"],
      ["lift:4:1", "day-1"],
    ]);
    // The weeks after go on from there, each day on the programme's next training date.
    expect(
      rows(
        liftingWeek(programme(doneThrough({ cycleIndex: 3, dayIndex: 3 })), "2026-10-26", today),
      ),
    ).toEqual([
      ["Upper A", "2026-10-26", "planned"],
      ["Lower B", "2026-10-27", "planned"],
      ["Upper B", "2026-10-29", "planned"],
      ["Lower A", "2026-10-30", "planned"],
    ]);
  });

  it("keeps a day done or skipped on the date it was, and passes over the rest day Today offers", () => {
    const sessions = liftingWeek(
      programme([
        ...doneThrough({ cycleIndex: 3, dayIndex: 7 }),
        answer(4, 1, "completed", monday),
        answer(4, 2, "skipped", today),
      ]),
      monday,
      today,
    );
    expect(rows(sessions)).toEqual([
      ["Lower A", monday, "done"],
      ["Upper A", today, "skipped"],
      ["Lower B", "2026-10-22", "planned"],
      ["Upper B", "2026-10-23", "planned"],
    ]);
  });

  it("keeps a day trained early on the date it was trained", () => {
    const sessions = liftingWeek(
      programme([
        ...doneThrough({ cycleIndex: 3, dayIndex: 7 }),
        answer(4, 1, "completed", monday),
        answer(4, 4, "completed", today),
      ]),
      monday,
      today,
    );
    expect(rows(sessions)).toEqual([
      ["Lower A", monday, "done"],
      ["Lower B", today, "done"],
      ["Upper A", "2026-10-22", "planned"],
      ["Upper B", "2026-10-23", "planned"],
    ]);
  });

  it("keeps a skip the athlete made on the day they made it, wherever the calendar put the day", () => {
    // Behind, the athlete skips the Lower B Today offers, due last Thursday: Upper B is next.
    const sessions = liftingWeek(
      programme([...doneThrough({ cycleIndex: 3, dayIndex: 3 }), answer(3, 4, "skipped", today)]),
      monday,
      today,
    );
    expect(rows(sessions)).toEqual([
      ["Lower B", today, "skipped"],
      ["Upper B", today, "today"],
      ["Lower A", "2026-10-22", "planned"],
      ["Upper A", "2026-10-23", "planned"],
    ]);
  });

  it("stands each day Pick up from today skipped where it was due, not on the day of the tap", () => {
    // Two weeks and a day missed, then picked up today, as the action writes it: each training
    // day skipped today, each rest day passed on its own date.
    const behind = programme(doneThrough({ cycleIndex: 1, dayIndex: 7 }));
    const { skip, rest } = pickUpFromToday(behind.state, behind.startDate, today);
    expect(skip).toHaveLength(9);
    const picked: LiftingSchedule = {
      ...programme([
        ...behind.state.events,
        ...skip.map(({ ref }) => answer(ref.cycleIndex, ref.dayIndex, "skipped", today)),
        ...rest.map(({ ref, date }) => answer(ref.cycleIndex, ref.dayIndex, "completed", date)),
      ]),
      pickedUp: skip.map(({ ref }) => ref),
    };
    expect(rows(liftingWeek(picked, monday, today))).toEqual([
      ["Lower A", monday, "skipped"],
      ["Upper A", today, "today"],
      ["Lower B", "2026-10-22", "planned"],
      ["Upper B", "2026-10-23", "planned"],
    ]);
    expect(rows(liftingWeek(picked, "2026-10-12", today))).toEqual([
      ["Lower A", "2026-10-12", "skipped"],
      ["Upper A", "2026-10-13", "skipped"],
      ["Lower B", "2026-10-15", "skipped"],
      ["Upper B", "2026-10-16", "skipped"],
    ]);
  });

  it("starts what is left after a day finished today, which Today no longer offers", () => {
    const sessions = liftingWeek(
      programme([...doneThrough({ cycleIndex: 3, dayIndex: 3 }), answer(3, 4, "completed", today)]),
      monday,
      today,
    );
    expect(rows(sessions)).toEqual([
      ["Lower B", today, "done"],
      ["Upper B", "2026-10-22", "planned"],
      ["Lower A", "2026-10-23", "planned"],
    ]);
  });

  it("stands a day answered without a date on its calendar date", () => {
    const sessions = liftingWeek(
      programme([...doneThrough({ cycleIndex: 3, dayIndex: 7 }), answer(4, 1, "completed")]),
      monday,
      today,
    );
    expect(rows(sessions)[0]).toEqual(["Lower A", monday, "done"]);
  });

  it("lays the days owed on the weekdays of a cycle dated by weekday", () => {
    // Mon / Wed / Fri: cycle 3's Full B is owed today, then Wednesday and Friday train.
    const days: Day[] = [
      { id: "full-a", dayIndex: 1, name: "Full A", includesLifting: true, dayOfWeek: 1 },
      { id: "full-b", dayIndex: 2, name: "Full B", includesLifting: true, dayOfWeek: 3 },
      { id: "full-c", dayIndex: 3, name: "Full C", includesLifting: true, dayOfWeek: 5 },
    ];
    const weekly = programme(doneThrough({ cycleIndex: 3, dayIndex: 1 }, days), {
      days,
      repeats: "weekly",
    });
    expect(rows(liftingWeek(weekly, monday, today))).toEqual([
      ["Full B", today, "today"],
      ["Full C", "2026-10-21", "planned"],
      ["Full A", "2026-10-23", "planned"],
    ]);
  });

  it("runs the calendar on past the programme's end for days still owed", () => {
    // Two weeks from 5 October: the calendar ended on Sunday, with six lifting days still owed.
    const sessions = liftingWeek(
      programme(doneThrough({ cycleIndex: 1, dayIndex: 3 }), {
        cycles: 2,
        startDate: "2026-10-05",
      }),
      monday,
      today,
    );
    expect(sessions.map(({ key, date, status }) => [key, date, status])).toEqual([
      ["lift:1:4", today, "today"],
      ["lift:1:5", "2026-10-22", "planned"],
      ["lift:2:1", "2026-10-23", "planned"],
    ]);
  });

  it("holds only what was answered in a week gone by, where it was answered", () => {
    const sessions = liftingWeek(
      programme([
        ...doneThrough({ cycleIndex: 2, dayIndex: 7 }),
        answer(3, 1, "completed", "2026-10-13"),
        answer(3, 2, "skipped", "2026-10-15"),
        answer(3, 3, "completed", "2026-10-16"),
      ]),
      "2026-10-12",
      today,
    );
    expect(rows(sessions)).toEqual([
      ["Lower A", "2026-10-13", "done"],
      ["Upper A", "2026-10-15", "skipped"],
    ]);
  });
});

describe("the week by day", () => {
  it("orders days, and lifting before the endurance sports on a shared day", () => {
    const days = byDay([
      {
        key: "r",
        date: today,
        sport: "running",
        title: null,
        status: "today",
        occurrenceId: "o",
        dayId: null,
      },
      {
        key: "s",
        date: "2026-10-22",
        sport: "swimming",
        title: null,
        status: "planned",
        occurrenceId: "p",
        dayId: null,
      },
      {
        key: "l",
        date: today,
        sport: "strength",
        title: "Lower A",
        status: "today",
        occurrenceId: null,
        dayId: "day-1",
      },
    ]);
    expect(days.map(({ date, sessions }) => [date, sessions.map(({ key }) => key)])).toEqual([
      [today, ["l", "r"]],
      ["2026-10-22", ["s"]],
    ]);
  });
});
