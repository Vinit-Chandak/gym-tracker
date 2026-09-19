import { describe, expect, it } from "vitest";

import {
  decimalPlaces,
  formatDistance,
  fromMetres,
  roundTo,
  sameDistance,
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
    expect(formatDistance(8046.72, "km")).toBe("8.05 km");
    expect(formatDistance(8046.72, "mi")).toBe("5 mi");
    expect(formatDistance(365.76, "yd")).toBe("400 yd");
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
