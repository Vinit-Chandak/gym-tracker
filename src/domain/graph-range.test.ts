import { describe, expect, it } from "vitest";

import {
  addMonths,
  allRange,
  bucketForSpan,
  chooseRange,
  customRange,
  presetRange,
  rangeOf,
  rangeSlots,
  readWindowOf,
  slotIndex,
} from "./graph-range";

const TODAY = "2026-10-07"; // a Wednesday

describe("the spans", () => {
  it("draw a month day by day, ending today", () => {
    expect(presetRange("1m", TODAY)).toEqual({
      preset: "1m",
      from: "2026-09-08",
      to: TODAY,
      bucket: "day",
    });
    expect(rangeSlots(presetRange("1m", TODAY), TODAY)).toHaveLength(30);
  });

  it("start a quarter and a half on a Monday, so no week is cut at the left edge", () => {
    expect(presetRange("3m", TODAY)).toMatchObject({ from: "2026-07-06", bucket: "week" });
    expect(presetRange("6m", TODAY)).toMatchObject({ from: "2026-04-06", bucket: "week" });
  });

  it("draw a year as twelve months, this one so far the last", () => {
    const range = presetRange("12m", TODAY);
    expect(range).toMatchObject({ from: "2025-11-01", bucket: "month" });
    const slots = rangeSlots(range, TODAY);
    expect(slots).toHaveLength(12);
    expect(slots.at(-1)).toEqual({ start: "2026-10-01", end: "2026-10-31", partial: true });
    expect(slots.slice(0, -1).every((slot) => !slot.partial)).toBe(true);
  });

  it("draw All from a graph's own first record, in the bucket its span needs", () => {
    expect(allRange("2022-03-14", TODAY)).toEqual({
      preset: "all",
      from: "2022-03-01",
      to: TODAY,
      bucket: "month",
    });
    expect(allRange("2026-08-20", TODAY)).toMatchObject({ from: "2026-08-17", bucket: "week" });
    expect(allRange("2026-09-30", TODAY)).toMatchObject({ from: "2026-09-30", bucket: "day" });
    // Nothing recorded yet: a month, so the graph still has an axis.
    expect(allRange(null, TODAY)).toMatchObject({ preset: "all", from: "2026-09-08" });
  });

  it("bucket hand-chosen dates by their length, widened to a whole first bucket", () => {
    expect(bucketForSpan("2026-09-01", "2026-10-15")).toBe("day");
    expect(bucketForSpan("2026-05-01", "2026-10-07")).toBe("week");
    expect(bucketForSpan("2025-01-01", "2026-10-07")).toBe("month");
    expect(customRange("2026-05-06", "2026-10-07")).toEqual({
      preset: null,
      from: "2026-05-04",
      to: "2026-10-07",
      bucket: "week",
    });
  });

  it("holds the last day of a short month rather than spilling into the next", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
    expect(addMonths("2026-01-15", -3)).toBe("2025-10-15");
  });

  it("finds each day's slot, and none outside the range", () => {
    const weeks = presetRange("3m", TODAY);
    expect(slotIndex(weeks, "2026-07-06")).toBe(0);
    expect(slotIndex(weeks, "2026-07-12")).toBe(0);
    expect(slotIndex(weeks, "2026-07-13")).toBe(1);
    expect(slotIndex(weeks, "2026-07-05")).toBe(-1);
    const months = presetRange("12m", TODAY);
    expect(slotIndex(months, "2026-01-31")).toBe(2);
    expect(slotIndex(months, TODAY)).toBe(11);
  });
});

describe("what the reader asked for", () => {
  it("is the remembered span when the URL names no dates", () => {
    expect(chooseRange("3m", {}, TODAY)).toEqual({ choice: { preset: "3m" }, error: null });
  });

  it("is dates in the URL over the remembered span, either end defaulting", () => {
    expect(chooseRange("3m", { from: "2026-01-01", to: "2026-02-01" }, TODAY).choice).toEqual({
      custom: { from: "2026-01-01", to: "2026-02-01" },
    });
    expect(chooseRange("3m", { from: "2026-09-01" }, TODAY).choice).toEqual({
      custom: { from: "2026-09-01", to: TODAY },
    });
  });

  it("falls back to the remembered span, and says why, when the dates make no range", () => {
    for (const dates of [
      { from: "2026-10-01", to: "2026-09-01" },
      { from: "2026-02-30" },
      { from: "nonsense" },
      { from: "1999-12-31" },
    ]) {
      const { choice, error } = chooseRange("6m", dates, TODAY);
      expect(choice).toEqual({ preset: "6m" });
      expect(error).toMatch(/do not make a range/);
    }
  });

  it("reads every day there could be a record on for All, and its own span otherwise", () => {
    expect(readWindowOf({ preset: "all" }, TODAY)).toEqual({ from: "2000-01-01", to: TODAY });
    expect(readWindowOf({ preset: "1m" }, TODAY)).toEqual({ from: "2026-09-08", to: TODAY });
    expect(rangeOf({ custom: { from: "2026-09-10", to: "2026-09-20" } }, TODAY)).toMatchObject({
      preset: null,
      bucket: "day",
    });
  });
});
