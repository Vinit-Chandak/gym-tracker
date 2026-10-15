import { describe, expect, it } from "vitest";

import { customRange, presetRange, rangeSlots } from "@/domain/graph-range";

import { bucketLabel, dayLabel } from "./labels";

it("holds a day's weekday, day, month and year together, so no line ends on a part of it", () => {
  expect(dayLabel("2026-10-07", "2026-10-11")).toBe("Wed\u00a07\u00a0Oct");
  expect(dayLabel("2025-10-15", "2026-10-11")).toBe("15\u00a0Oct\u00a02025");
});

describe("a bucket's name", () => {
  it("calls the week still running this week, to its Sunday", () => {
    const sunday = "2026-10-11";
    const range = presetRange("3m", sunday);
    const slots = rangeSlots(range, sunday);
    // The week ends today, so it is not cut short; it is still the one running.
    expect(slots.at(-1)).toMatchObject({ start: "2026-10-05", end: sunday, partial: false });
    expect(bucketLabel(slots.at(-1)!, "week", sunday)).toBe("This week");
    expect(bucketLabel(slots.at(-2)!, "week", sunday)).toBe("28 Sept – 4 Oct");
    // As a line graph's own slot of the same week names it.
    expect(bucketLabel({ start: "2026-10-05", end: sunday, partial: true }, "week", sunday)).toBe(
      "This week",
    );
  });

  it("calls the month still running this month, to its last day", () => {
    const last = "2026-10-31";
    const slots = rangeSlots(presetRange("12m", last), last);
    expect(slots.at(-1)).toMatchObject({ start: "2026-10-01", end: last, partial: false });
    expect(bucketLabel(slots.at(-1)!, "month", last)).toBe("This month");
    expect(bucketLabel(slots.at(-2)!, "month", last)).toBe("Sept 2026");
  });

  it("names a week cut short by dates chosen by hand by its dates, not as this week", () => {
    const today = "2026-10-11";
    const range = customRange("2026-08-03", "2026-10-07");
    const slots = rangeSlots(range, today);
    expect(slots.at(-1)).toMatchObject({ start: "2026-10-05", partial: true });
    expect(bucketLabel(slots.at(-1)!, "week", "2026-10-20")).toBe("5–11 Oct");
    // While today is in it, it is still this week.
    expect(bucketLabel(slots.at(-1)!, "week", today)).toBe("This week");
  });
});
