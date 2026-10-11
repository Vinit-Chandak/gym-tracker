import { describe, expect, it } from "vitest";

import {
  decimalPlaces,
  formatDistance,
  formatSportDistance,
  fromMetres,
  roundTo,
  sameDistance,
  sportDistanceParts,
  toMetres,
} from "./distance-units";

/** AT-LOG-13: conversion is exact by definition, and nothing drifts on the way back. */
describe("distance units", () => {
  it("converts by the defined factors, not an approximation of them", () => {
    expect(toMetres(1, "mi")).toBe(1609.344);
    expect(toMetres(1, "yd")).toBe(0.9144);
    expect(toMetres(1, "km")).toBe(1000);
    expect(toMetres(400, "m")).toBe(400);
    // Sixteen lengths of a 25 yd pool: 400 yd, and 365.76 m exactly (AT-LOG-05).
    expect(toMetres(400, "yd")).toBe(365.76);
    expect(toMetres(5, "mi")).toBe(8046.72);
  });

  it("round trips an entered quantity through metres and back", () => {
    for (const [value, unit] of [
      [5, "mi"],
      [10.5, "km"],
      [1.234567, "km"],
      [25, "yd"],
      [33.33, "m"],
    ] as const) {
      expect(fromMetres(toMetres(value, unit), unit)).toBe(value);
    }
  });

  it("never lets a display conversion become the stored value", () => {
    // What was entered, and the metres derived from it once. Showing the record in another
    // unit reads both; it never writes either, which is what keeps them from drifting.
    const entered = { value: 5, unit: "mi" as const, metres: toMetres(5, "mi") };
    for (let i = 0; i < 25; i++) fromMetres(entered.metres, i % 2 === 0 ? "km" : "mi");
    expect(entered.metres).toBe(8046.72);
    expect(fromMetres(entered.metres, "mi")).toBe(5);
    expect(fromMetres(entered.metres, "km")).toBe(8.04672);
  });

  it("shows why re-deriving would drift, at the sixth decimal", () => {
    // 8,050 m is not a whole number of miles, so a mile round trip loses a fraction of a
    // millimetre. Once is harmless; the point is that it is never done repeatedly.
    const metres = toMetres(8.05, "km");
    const once = toMetres(fromMetres(metres, "mi"), "mi");
    expect(sameDistance(once, metres)).toBe(false);
    expect(Math.abs(once - metres)).toBeLessThan(0.001);
  });

  it("rounds only for display and leaves the stored value alone", () => {
    expect(formatDistance(8046.72, "km")).toBe("8.05\u00a0km");
    expect(formatDistance(8046.72, "mi")).toBe("5\u00a0mi");
    expect(formatDistance(365.76, "yd")).toBe("400\u00a0yd");
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
  });

  it("counts the decimals a number is written with", () => {
    expect(decimalPlaces(1)).toBe(0);
    expect(decimalPlaces(1.5)).toBe(1);
    expect(decimalPlaces(1.5)).toBe(1);
    expect(decimalPlaces(0.000001)).toBe(6);
    expect(decimalPlaces(1e-7)).toBe(7);
  });
});

/** Decision: distances are read in the athlete's own unit for the sport, everywhere. */
describe("a distance in the reader's unit", () => {
  const km = { distanceUnit: "km", poolUnit: "m" } as const;
  const miles = { distanceUnit: "mi", poolUnit: "yd" } as const;

  it("reads a swim in the pool's unit and a run or ride on the road's", () => {
    expect(formatSportDistance(1500, "swimming", km)).toBe("1,500\u00a0m");
    expect(formatSportDistance(toMetres(1000, "yd"), "swimming", miles)).toBe("1,000\u00a0yd");
    expect(formatSportDistance(toMetres(5, "mi"), "running", km)).toBe("8.05\u00a0km");
    expect(formatSportDistance(toMetres(5, "mi"), "cycling", miles)).toBe("5\u00a0mi");
  });

  it("separates a figure's thousands, as the swim's form and a friend's distances do", () => {
    // A swim's page said "2100" yd under a form that said "2,100 yd".
    expect(sportDistanceParts(toMetres(2100, "yd"), "swimming", miles)).toEqual({
      figure: "2,100",
      unit: "yd",
    });
    expect(formatSportDistance([1500, 2000], "swimming", km)).toBe("1,500–2,000\u00a0m");
    expect(formatSportDistance(1234567, "running", km)).toBe("1,234.57\u00a0km");
  });

  it("says a road distance under a kilometre in metres, and leaves miles as miles", () => {
    expect(formatSportDistance(400, "running", km)).toBe("400\u00a0m");
    expect(formatSportDistance(toMetres(0.25, "mi"), "running", miles)).toBe("0.25\u00a0mi");
  });

  it("gives a range as one figure with its unit", () => {
    expect(sportDistanceParts([5000, 6000], "running", km)).toEqual({ figure: "5–6", unit: "km" });
    expect(sportDistanceParts([800, 1200], "running", km)).toEqual({
      figure: "0.8–1.2",
      unit: "km",
    });
    // Two ends that round to the same figure are one figure.
    expect(sportDistanceParts([5000, 5001], "running", km)).toEqual({ figure: "5", unit: "km" });
  });

  it("reads a road range to a tenth, both ends alike, and a single distance to a hundredth", () => {
    // A programme listed "4.35–5.59 mi" and "8.57–9.2 mi" beside Today's "4.6–5.9 mi".
    const range = (lowKm: number, highKm: number) =>
      formatSportDistance([toMetres(lowKm, "km"), toMetres(highKm, "km")], "running", miles);
    expect(range(7, 9)).toBe("4.3–5.6 mi");
    expect(range(13.8, 14.8)).toBe("8.6–9.2 mi");
    expect(range(16.8, 17.8)).toBe("10.4–11.1 mi");
    // One end that needs its tenth gives the other one too.
    expect(formatSportDistance([4500, 6000], "running", km)).toBe("4.5–6.0 km");
    expect(formatSportDistance([5000, 6000], "cycling", km)).toBe("5–6 km");
    // A distance on its own, or a range in metres, is not rounded further.
    expect(formatSportDistance(toMetres(7, "km"), "running", miles)).toBe("4.35 mi");
    expect(formatSportDistance([1500, 2000], "swimming", km)).toBe("1,500–2,000 m");
  });
});
