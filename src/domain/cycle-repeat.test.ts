import { describe, expect, it } from "vitest";

import {
  cycleCount,
  cycleLayout,
  cycleRepeatIssues,
  cycleRepeatLabel,
  inferCycleRepeat,
  programLengthLabel,
  weekdayOffsets,
  type CycleDay,
} from "./cycle-repeat";

const day = (
  dayIndex: number,
  dayOfWeek: number,
  kind: "lift" | "run" | "rest" = "lift",
): CycleDay => ({
  dayIndex,
  dayOfWeek,
  includesLifting: kind === "lift",
  includesRun: kind === "run",
});

const week = [1, 2, 3, 4, 5, 6, 7].map((n) => day(n, n, n === 7 ? "rest" : "lift"));
const mwf = [day(1, 1), day(2, 3), day(3, 5)];
const upperLowerRest = [day(1, 1), day(2, 2), day(3, 3, "rest"), day(4, 4)];

describe("weekday offsets", () => {
  it("measures each day from the cycle's first, round the week", () => {
    expect([...weekdayOffsets(mwf)!.values()]).toEqual([0, 2, 4]);
    expect([...weekdayOffsets([day(1, 5), day(2, 1), day(3, 3)])!.values()]).toEqual([0, 3, 5]);
  });

  it("is null when two days share a weekday or the days run out of order", () => {
    expect(weekdayOffsets([day(1, 1), day(2, 1)])).toBeNull();
    expect(weekdayOffsets([day(1, 1), day(2, 5), day(3, 3)])).toBeNull();
    expect(weekdayOffsets([...week, day(8, 1)])).toBeNull();
  });
});

describe("the repeat a programme is offered", () => {
  it("is weekly for seven days, and for training days on their own weekdays", () => {
    expect(inferCycleRepeat(week)).toBe("weekly");
    expect(inferCycleRepeat(mwf)).toBe("weekly");
  });

  it("is back to back for a cycle with rest days of its own, unless it runs", () => {
    expect(inferCycleRepeat(upperLowerRest)).toBe("rolling");
    expect(inferCycleRepeat([day(1, 1), day(2, 2, "rest"), day(3, 3, "run")])).toBe("weekly");
  });

  it("is back to back when the weekdays cannot hold the cycle", () => {
    expect(inferCycleRepeat([day(1, 1), day(2, 1), day(3, 1)])).toBe("rolling");
  });
});

describe("the cycles a programme's weeks hold", () => {
  it("keeps a finite progressive sequence to one pass, including beyond 31 days", () => {
    const days = Array.from({ length: 56 }, (_, index) => day(index + 1, (index % 7) + 1));
    const finite = { weeks: 8, days, repeats: "once" as const };
    expect(cycleCount(8, days.length, "once")).toBe(1);
    expect(cycleLayout(finite)).toEqual({ cycles: 1, byWeekday: false });
    expect(cycleRepeatLabel(finite)).toBe("Progressive");
    expect(programLengthLabel(finite)).toBe("56 days");
    expect(cycleRepeatIssues(finite)).toEqual([]);
    expect(cycleRepeatIssues({ ...finite, weeks: 4 })).toHaveLength(1);
    expect(cycleRepeatIssues({ ...finite, repeats: "rolling" })).toHaveLength(1);
  });
  it("is the weeks for a weekly cycle, and for one that predates the choice", () => {
    expect(cycleCount(8, 3, "weekly")).toBe(8);
    expect(cycleCount(8, 4, null)).toBe(8);
    expect(cycleCount(8, 4, undefined)).toBe(8);
  });

  it("fills the weeks for one that rolls", () => {
    expect(cycleCount(8, 4, "rolling")).toBe(14);
    expect(cycleCount(8, 3, "rolling")).toBe(19);
    expect(cycleCount(8, 7, "rolling")).toBe(8);
    expect(cycleCount(1, 10, "rolling")).toBe(1);
  });

  it("reads seven days the same whichever way they repeat", () => {
    const weekly = cycleLayout({ weeks: 8, days: week, repeats: "weekly" });
    expect(cycleLayout({ weeks: 8, days: week, repeats: "rolling" })).toEqual(weekly);
    expect(cycleLayout({ weeks: 8, days: week })).toEqual(weekly);
    expect(cycleRepeatLabel({ weeks: 8, days: week, repeats: "rolling" })).toBe("Every week");
  });

  it("names a rolling cycle by its length, and counts its cycles with the weeks", () => {
    const rolling = { weeks: 8, days: upperLowerRest, repeats: "rolling" as const };
    expect(cycleRepeatLabel(rolling)).toBe("Every 4 days");
    expect(programLengthLabel(rolling)).toBe("8 weeks · 14 cycles");
    expect(cycleRepeatLabel({ weeks: 8, days: mwf, repeats: "weekly" })).toBe("Every week");
    expect(programLengthLabel({ weeks: 8, days: mwf, repeats: "weekly" })).toBe("8 weeks");
    // Read as it always was, a programme that predates the choice runs one cycle a week.
    expect(programLengthLabel({ weeks: 8, days: upperLowerRest })).toBe("8 weeks");
  });
});

describe("what a programme's repeat refuses", () => {
  it("refuses a weekly cycle its weekdays cannot hold", () => {
    expect(
      cycleRepeatIssues({ weeks: 8, days: [day(1, 1), day(2, 1)], repeats: "weekly" }),
    ).toHaveLength(1);
    expect(cycleRepeatIssues({ weeks: 8, days: mwf, repeats: "weekly" })).toEqual([]);
  });

  it("refuses runs in a cycle that is not a week", () => {
    const runs = [day(1, 1), day(2, 2, "run"), day(3, 3, "rest")];
    expect(cycleRepeatIssues({ weeks: 8, days: runs, repeats: "rolling" })).toHaveLength(1);
    expect(cycleRepeatIssues({ weeks: 8, days: runs, repeats: "weekly" })).toEqual([]);
    // A programme that predates the choice is read as it is.
    expect(cycleRepeatIssues({ weeks: 8, days: runs })).toEqual([]);
  });
});
