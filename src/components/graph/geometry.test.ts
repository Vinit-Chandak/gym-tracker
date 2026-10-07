import { describe, expect, it } from "vitest";

import { presetRange } from "@/domain/graph-range";

import {
  axisTicks,
  barLayout,
  barPath,
  barScale,
  dayX,
  linePath,
  lineScale,
  markX,
  nearestIndex,
  type Frame,
} from "./geometry";

const TODAY = "2026-10-07";
const FRAME: Frame = { width: 362, left: 32, right: 362, top: 12, bottom: 164 };
const widthOf = (label: string) => label.length * 7.2;

describe("the scale", () => {
  it("runs a bar scale to a round top at or over the highest bar, in two or three steps", () => {
    expect(barScale([8, 3])).toEqual({ ticks: [0, 4, 8], max: 8 });
    expect(barScale([10.1])).toEqual({ ticks: [0, 4, 8, 12], max: 12 });
    expect(barScale([2310], { include: [2600] })).toEqual({
      ticks: [0, 1000, 2000, 3000],
      max: 3000,
    });
    expect(barScale([150])).toEqual({ ticks: [0, 50, 100, 150], max: 150 });
  });

  it("labels counts with whole numbers only, and draws nothing over nothing", () => {
    expect(barScale([18], { integral: true }).ticks).toEqual([0, 10, 20]);
    expect(barScale([1], { integral: true }).ticks).toEqual([0, 1]);
    expect(barScale([0, 0])).toEqual({ ticks: [0], max: 1 });
  });

  it("steps by the values a scale is given, where powers of ten do not suit", () => {
    // Minutes: an hour, not 50 or 100 minutes.
    expect(barScale([95], { steps: [15, 30, 45, 60, 90, 120] }).ticks).toEqual([0, 60, 120]);
  });

  it("gives a line its readings with air, and two or three round values inside", () => {
    const { ticks, lo, hi } = lineScale([75.95, 76.4, 77.5]);
    expect(ticks).toEqual([76, 77]);
    expect(lo).toBeLessThan(75.95);
    expect(hi).toBeGreaterThan(77.5);
    // Pace in seconds, stepped by half minutes.
    expect(lineScale([345, 400], { steps: [5, 10, 15, 30, 60] }).ticks).toEqual([360, 390]);
  });

  it("draws a fixed scale whole whatever the readings", () => {
    expect(lineScale([2, 3], { min: 1, max: 5, ticks: [1, 3, 5] })).toEqual({
      ticks: [1, 3, 5],
      lo: 1,
      hi: 5,
    });
  });
});

describe("the date axis", () => {
  it("gives every bucket a slot, and a bar up to 14 pt in it", () => {
    expect(barLayout(5, FRAME)).toEqual({ slot: 66, bar: 14 });
    const month = barLayout(30, FRAME);
    expect(month.slot).toBe(11);
    expect(month.bar).toBeCloseTo(7.7);
  });

  it("places buckets in equal slots and records on their own day", () => {
    const range = presetRange("1m", TODAY);
    expect(markX(0, range.from, range, FRAME, "bucket", 30)).toBe(37.5);
    expect(markX(29, TODAY, range, FRAME, "bucket", 30)).toBe(356.5);
    // A record on the range's last day stands in the middle of that day.
    expect(markX(0, TODAY, range, FRAME, "record", 1)).toBeCloseTo(356.5);
    // A day inside a week's slot stands its share of the way across it.
    const weeks = presetRange("3m", TODAY);
    expect(dayX("2026-07-13", weeks, FRAME, "bucket", 14)).toBeCloseTo(32 + 330 / 14);
    expect(dayX("2026-07-16", weeks, FRAME, "bucket", 14)).toBeCloseTo(32 + (330 / 14) * (10 / 7));
  });

  it("names Mondays over a month, months over a quarter, years over All", () => {
    const month = presetRange("1m", TODAY);
    const x =
      (range: typeof month, placement: "bucket" | "record", count: number) => (date: string) =>
        dayX(date, range, FRAME, placement, count);
    expect(axisTicks(month, FRAME, x(month, "bucket", 30), widthOf).map((t) => t.label)).toEqual([
      "14 Sept",
      "21 Sept",
      "28 Sept",
    ]);
    const quarter = presetRange("3m", TODAY);
    expect(
      axisTicks(quarter, FRAME, x(quarter, "bucket", 14), widthOf).map((t) => t.label),
    ).toEqual(["Aug", "Sept", "Oct"]);
    const all = { preset: "all" as const, from: "2022-03-01", to: TODAY, bucket: "month" as const };
    expect(axisTicks(all, FRAME, x(all, "bucket", 56), widthOf).map((t) => t.label)).toEqual([
      "2023",
      "2024",
      "2025",
      "2026",
    ]);
  });

  it("thins a year's months to every second, the year at January, so none run together", () => {
    const year = presetRange("12m", TODAY);
    const ticks = axisTicks(year, FRAME, (date) => dayX(date, year, FRAME, "bucket", 12), widthOf);
    expect(ticks.map((t) => t.label)).toEqual(["Nov", "2026", "Mar", "May", "Jul", "Sept"]);
    ticks
      .slice(1)
      .forEach((tick, i) =>
        expect(tick.x - ticks[i]!.x).toBeGreaterThanOrEqual(widthOf(ticks[i]!.label) + 10),
      );
  });
});

describe("reading a mark", () => {
  it("finds the nearest mark that has something in it", () => {
    expect(nearestIndex([10, null, 30, 60], 35)).toBe(2);
    expect(nearestIndex([10, null, 30, 60], 21)).toBe(2);
    expect(nearestIndex([null, null], 5)).toBeNull();
  });
});

describe("the marks", () => {
  it("rounds a bar's top and keeps its foot square on the baseline", () => {
    expect(barPath(10, 20, 8, 40)).toBe(
      "M10.00 60.00V23.00Q10.00 20.00 13.00 20.00H15.00Q18.00 20.00 18.00 23.00V60.00Z",
    );
  });

  it("breaks a line where a bucket has no reading", () => {
    expect(linePath([{ x: 1, y: 1 }, { x: 2, y: 2 }, null, { x: 4, y: 4 }])).toBe(
      "M1.0 1.0L2.0 2.0M4.0 4.0",
    );
  });
});
