import { describe, expect, it } from "vitest";

import { byDay, datedStatus, liftingWeek, weekStartOf, type LiftingDay } from "./plan-week";

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
  const day = (
    dayIndex: number,
    date: string,
    status: LiftingDay["status"] = "pending",
  ): LiftingDay => ({ ref: { cycleIndex: 3, dayIndex }, date, name: `Day ${dayIndex}`, status });

  it("stands the day Today offers on today when the calendar put it earlier", () => {
    const sessions = liftingWeek(
      [day(1, "2026-10-19"), day(2, "2026-10-21")],
      { cycleIndex: 3, dayIndex: 1 },
      monday,
      today,
    );
    expect(sessions.map(({ title, date, status }) => [title, date, status])).toEqual([
      ["Day 1", today, "today"],
      ["Day 2", "2026-10-21", "planned"],
    ]);
  });

  it("stands the day Today offers on today when the athlete is ahead of the calendar", () => {
    const sessions = liftingWeek(
      [day(1, "2026-10-19", "completed"), day(2, "2026-10-23")],
      { cycleIndex: 3, dayIndex: 2 },
      monday,
      today,
    );
    expect(sessions.map(({ date, status }) => [date, status])).toEqual([
      ["2026-10-19", "done"],
      [today, "today"],
    ]);
  });

  it("reads another day still owed after its date as missed, and answered days as answered", () => {
    const sessions = liftingWeek(
      [day(1, "2026-10-19", "completed"), day(2, "2026-10-20", "skipped"), day(3, "2026-10-19")],
      { cycleIndex: 3, dayIndex: 4 },
      monday,
      today,
    );
    expect(sessions.map(({ status }) => status)).toEqual(["done", "skipped", "missed"]);
  });

  it("leaves out days outside the week", () => {
    expect(liftingWeek([day(1, "2026-10-18"), day(2, "2026-10-26")], null, monday, today)).toEqual(
      [],
    );
  });
});

describe("the week by day", () => {
  it("orders days, and lifting before the endurance sports on a shared day", () => {
    const days = byDay([
      { key: "r", date: today, sport: "running", title: null, status: "today", occurrenceId: "o" },
      {
        key: "s",
        date: "2026-10-22",
        sport: "swimming",
        title: null,
        status: "planned",
        occurrenceId: "p",
      },
      {
        key: "l",
        date: today,
        sport: "strength",
        title: "Lower A",
        status: "today",
        occurrenceId: null,
      },
    ]);
    expect(days.map(({ date, sessions }) => [date, sessions.map(({ key }) => key)])).toEqual([
      [today, ["l", "r"]],
      ["2026-10-22", ["s"]],
    ]);
  });
});
