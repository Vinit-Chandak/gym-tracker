import { describe, expect, it } from "vitest";

import { inOrder, liftingCounts, liftingSub, parseLifting, standing } from "./log-choices";

const today = "2026-10-20";
const session = (scheduledOn: string, disposition = "pending") => ({ scheduledOn, disposition });

describe("which planned session a log counts as", () => {
  it("lists today's first, then the missed, most recent first, then what is still to come", () => {
    const sessions = [
      session("2026-10-22"),
      session("2026-10-17"),
      session(today),
      session("2026-10-19"),
      session("2026-10-21"),
    ];
    expect(inOrder(sessions, today).map(({ scheduledOn }) => scheduledOn)).toEqual([
      today,
      "2026-10-19",
      "2026-10-17",
      "2026-10-21",
      "2026-10-22",
    ]);
  });

  it("says where each stands against today", () => {
    expect(standing(session(today), today)).toBe("Today");
    expect(standing(session(today, "skipped"), today)).toBe("Today · skipped");
    expect(standing(session("2026-10-17"), today)).toBe("Sat 17 Oct · missed");
    expect(standing(session("2026-10-18", "skipped"), today)).toBe("Sun 18 Oct · skipped");
    expect(standing(session("2026-10-22"), today)).toBe("Thu 22 Oct · early");
  });

  it("names a lifting day by its day, its place in the cycle and its cycle, and nothing else", () => {
    const day = {
      programDayId: "00000000-0000-4000-8000-000000000002",
      dayIndex: 3,
      cycleIndex: 2,
    };
    expect(parseLifting(liftingCounts(day))).toEqual(day);
    expect(parseLifting("unplanned")).toBeNull();
    expect(parseLifting("day:not-a-day:3:2")).toBeNull();
    expect(parseLifting(undefined)).toBeNull();
  });

  it("says what a lifting day would start", () => {
    expect(liftingSub({ next: true, label: "Start", cycleIndex: 1 })).toBe(
      "Next in your programme",
    );
    expect(liftingSub({ next: false, label: "Start", cycleIndex: 1 })).toBe("This cycle");
    expect(liftingSub({ next: false, label: "Start skipped workout", cycleIndex: 1 })).toBe(
      "Skipped this cycle",
    );
    // Choosing a day done this cycle trains it again; the line says only where it stands.
    expect(liftingSub({ next: false, label: "Do again", cycleIndex: 2 })).toBe("Done this cycle");
    expect(liftingSub({ next: false, label: "Start early", cycleIndex: 2 })).toBe("Cycle 2");
  });
});
