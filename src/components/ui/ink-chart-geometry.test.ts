import { describe, expect, it } from "vitest";

import { barRects, barScale, lineScale, linePoints, nearestNice } from "./ink-chart-geometry";

describe("the scale", () => {
  it("stops at the round value nearest the highest bar, and its half", () => {
    expect(nearestNice(10.1)).toBe(10);
    expect(nearestNice(72.5)).toBe(80);
    // Running's weeks (Running board): 5 and 10 km, the 10.1 km week given air above it.
    expect(barScale([9, 0, 4, 3, 10.1, 2.7])).toEqual({ ticks: [5, 10], max: 10.1 * 1.08 });
    // The bench's whole life (Exercise board): 40 and 80 kg, 80 the top.
    expect(barScale([30, 45.5, 72.5])).toEqual({ ticks: [40, 80], max: 80 });
  });

  it("labels counts with whole numbers only", () => {
    expect(barScale([2, 6, 4], { integral: true }).ticks).toEqual([5]);
    expect(barScale([3, 12, 9], { integral: true }).ticks).toEqual([5, 10]);
    expect(barScale([0, 0])).toEqual({ ticks: [], max: 1 });
  });

  it("gives a line its readings with air, and the round values inside", () => {
    // Body weight (Body board): 76 and 77 kg between 75.95 and 77.5.
    const { ticks, lo, hi } = lineScale([76.05, 75.95, 77.2, 77.5]);
    expect(ticks).toEqual([76, 77]);
    expect(lo).toBeLessThan(75.95);
    expect(hi).toBeGreaterThan(77.5);
  });
});

describe("bars", () => {
  const frame = { left: 26, width: 362, top: 10, bottom: 130, max: 11 };

  it("stand centred in their slots, up to 14 pt wide, the latest in ink", () => {
    const bars = barRects(
      [
        { date: "2026-07-06", value: 9 },
        { date: "2026-07-13", value: 0 },
        { date: "2026-07-20", value: 4 },
      ],
      frame,
    );
    // The empty week draws nothing; the others stand in their slots.
    expect(bars.map((bar) => bar.index)).toEqual([0, 2]);
    expect(bars[0]!.width).toBe(14);
    expect(bars[0]!.x).toBeCloseTo(26 + (112 - 14) / 2);
    expect(bars.map((bar) => bar.ink)).toEqual([false, true]);
  });

  it("draw the week still running as an ink stub even at nothing", () => {
    const bars = barRects(
      [
        { date: "2026-09-21", value: 9 },
        { date: "2026-09-28", value: 0, partial: true },
      ],
      frame,
    );
    expect(bars[1]).toMatchObject({ ink: true, height: 3, y: 127 });
    expect(bars[0]!.ink).toBe(false);
  });

  it("stand closer over many readings", () => {
    const many = Array.from({ length: 31 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      value: 7,
    }));
    const bars = barRects(many, { ...frame, max: 8 });
    expect(bars[0]!.width).toBeCloseTo(((362 - 26) / 31) * 0.74);
  });
});

describe("a line", () => {
  it("places its readings by date, so a lay-off reads as one", () => {
    const points = linePoints(
      [
        { date: "2026-07-01", value: 76 },
        { date: "2026-07-02", value: 77 },
        { date: "2026-07-11", value: null },
        { date: "2026-07-21", value: 76.5 },
      ],
      { left: 26, right: 348, top: 18, bottom: 144, lo: 75.5, hi: 77.5 },
    );
    expect(points.map((point) => point.index)).toEqual([0, 1, 3]);
    expect(points[0]!.x).toBe(26);
    expect(points[2]!.x).toBe(348);
    expect(points[1]!.x).toBeCloseTo(26 + (1 / 20) * 322);
    expect(points[1]!.y).toBeCloseTo(144 - (1.5 / 2) * 126);
  });
});
