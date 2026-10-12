import { describe, expect, it } from "vitest";

import {
  chosenSportUnits,
  climbIn,
  climbUnit,
  decimalPlaces,
  entryIn,
  followsWeight,
  followWeight,
  formatDistance,
  formatSetLength,
  formatSportDistance,
  fromMetres,
  resolveSportUnits,
  roundTo,
  sameDistance,
  setLengthFor,
  setLengthIn,
  setLengthToMetres,
  setLengthUnit,
  sportDistanceParts,
  toMetres,
  unitsForWeight,
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

describe("a recorded distance opened in another unit", () => {
  it("reads it to the places a distance reads in there, and says whether that is exact", () => {
    // Liam swims in yards; his open-water swim was entered as 1500 m.
    expect(entryIn(1500, "m", "yd")).toEqual({ value: 1640, exact: false });
    expect(entryIn(7.2, "km", "mi")).toEqual({ value: 4.47, exact: false });
    // A figure that is the same distance in both says so, and one in its own unit is itself.
    expect(entryIn(1609.344, "m", "mi")).toEqual({ value: 1, exact: true });
    expect(entryIn(4.4, "mi", "mi")).toEqual({ value: 4.4, exact: true });
  });

  it("reads a climb in feet beside miles and in metres beside kilometres, whole", () => {
    expect(climbUnit("mi")).toBe("ft");
    expect(climbUnit("km")).toBe("m");
    expect(climbIn(89, "ft")).toBe(292);
    expect(climbIn(89.4, "m")).toBe(89);
  });
});

/** ADR 0056: one setting for distances, which starts from the weight unit. */
describe("distances that start from the weight unit", () => {
  const metric = { distanceUnit: "km", poolUnit: "m" } as const;
  const imperial = { distanceUnit: "mi", poolUnit: "yd" } as const;

  it("reads miles and yard pools for pounds, and kilometres and metre pools for kilograms", () => {
    expect(unitsForWeight("lb")).toEqual(imperial);
    expect(unitsForWeight("kg")).toEqual(metric);
    // A machine's own scale is no weight unit; it reads as the default.
    expect(unitsForWeight("stack_index")).toEqual(metric);
  });

  it("follows the weight unit where nothing was chosen, and keeps what was", () => {
    expect(resolveSportUnits("lb", { distanceUnit: null, poolUnit: null })).toEqual(imperial);
    expect(resolveSportUnits("kg", { distanceUnit: null, poolUnit: null })).toEqual(metric);
    expect(resolveSportUnits("lb", { distanceUnit: "km", poolUnit: null })).toEqual({
      distanceUnit: "km",
      poolUnit: "yd",
    });
    expect(resolveSportUnits("kg", { distanceUnit: "mi", poolUnit: "yd" })).toEqual(imperial);
    // A stored value that is not a road or a pool unit is no choice at all.
    expect(resolveSportUnits("lb", { distanceUnit: "m", poolUnit: "km" })).toEqual(imperial);
  });

  it("stores only a unit that differs from the weight unit's, so the rest go on following", () => {
    expect(chosenSportUnits("lb", imperial)).toEqual({ distanceUnit: null, poolUnit: null });
    expect(chosenSportUnits("kg", metric)).toEqual({ distanceUnit: null, poolUnit: null });
    expect(chosenSportUnits("kg", { distanceUnit: "mi", poolUnit: "m" })).toEqual({
      distanceUnit: "mi",
      poolUnit: null,
    });
    expect(chosenSportUnits("lb", { distanceUnit: "km", poolUnit: "m" })).toEqual({
      distanceUnit: "km",
      poolUnit: "m",
    });
    // What is stored reads back as what was shown.
    for (const weight of ["kg", "lb"])
      for (const distanceUnit of ["km", "mi"] as const)
        for (const poolUnit of ["m", "yd"] as const)
          expect(
            resolveSportUnits(weight, chosenSportUnits(weight, { distanceUnit, poolUnit })),
          ).toEqual({ distanceUnit, poolUnit });
  });

  it("moves a following distance with the weight unit, and leaves one set apart", () => {
    expect(followsWeight("kg", metric)).toEqual({ distanceUnit: true, poolUnit: true });
    expect(followsWeight("kg", { distanceUnit: "mi", poolUnit: "m" })).toEqual({
      distanceUnit: false,
      poolUnit: true,
    });
    expect(followWeight(metric, "lb", { distanceUnit: true, poolUnit: true })).toEqual(imperial);
    expect(
      followWeight({ distanceUnit: "mi", poolUnit: "m" }, "lb", {
        distanceUnit: false,
        poolUnit: true,
      }),
    ).toEqual(imperial);
    expect(
      followWeight({ distanceUnit: "mi", poolUnit: "yd" }, "kg", {
        distanceUnit: false,
        poolUnit: true,
      }),
    ).toEqual({ distanceUnit: "mi", poolUnit: "m" });
  });
});

describe("a set's distance in metres or yards", () => {
  it("reads yards beside miles and metres beside kilometres, never feet", () => {
    expect(setLengthUnit("mi")).toBe("yd");
    expect(setLengthUnit("km")).toBe("m");
    expect(setLengthFor({ preferredUnit: "lb", distanceUnit: null, poolUnit: null })).toBe("yd");
    expect(setLengthFor({ preferredUnit: "lb", distanceUnit: "km", poolUnit: null })).toBe("m");
    expect(setLengthFor({ preferredUnit: "kg", distanceUnit: "mi", poolUnit: null })).toBe("yd");
  });

  it("keeps a typed distance to the tenth of a metre a set stores", () => {
    expect(setLengthToMetres(50, "yd")).toBe(45.7);
    expect(setLengthToMetres(20, "yd")).toBe(18.3);
    expect(setLengthToMetres(25.5, "m")).toBe(25.5);
    expect(setLengthToMetres(20.25, "m")).toBe(20.3);
  });

  it("reads back every whole number of yards as it was typed", () => {
    // Kept to a tenth of a metre, a whole yard is never more than 0.06 yd from itself.
    for (let yards = 0; yards <= 2000; yards++)
      expect(setLengthIn(setLengthToMetres(yards, "yd"), "yd")).toBe(yards);
    for (const yards of [10_000, 54_321, 109_361])
      expect(setLengthIn(setLengthToMetres(yards, "yd"), "yd")).toBe(yards);
  });

  it("reads metres as kept and yards whole, each held to its unit", () => {
    expect(setLengthIn(40, "m")).toBe(40);
    expect(setLengthIn(25.5, "m")).toBe(25.5);
    expect(setLengthIn(40, "yd")).toBe(44);
    expect(formatSetLength(45.7, "yd")).toBe("50\u00a0yd");
    expect(formatSetLength(20, "m")).toBe("20\u00a0m");
  });
});
