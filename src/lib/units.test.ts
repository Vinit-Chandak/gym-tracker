import { describe, expect, it } from "vitest";

import {
  ageOn,
  formatBodyWeight,
  formatHeight,
  fromKilograms,
  heightUnitFor,
  toCentimetres,
  toFeetAndInches,
  toKilograms,
} from "./units";

describe("body measurement units", () => {
  it("pairs height with the unit weights are read in", () => {
    expect(heightUnitFor("kg")).toBe("cm");
    expect(heightUnitFor("lb")).toBe("ftin");
  });

  it("leaves kilograms alone", () => {
    expect(toKilograms(74.5, "kg")).toBe(74.5);
    expect(fromKilograms(74.5, "kg")).toBe(74.5);
  });

  it("converts pounds both ways", () => {
    expect(toKilograms(164.2, "lb")).toBe(74.48);
    expect(fromKilograms(74.48, "lb")).toBe(164.2);
  });

  it("returns the same number after a round trip through kilograms", () => {
    // Someone who weighs in pounds must not watch their weight drift by a tenth every
    // time they open the form, which is what an unstable rounding pair would do.
    for (const pounds of [120, 141.7, 164.2, 180.5, 220.9]) {
      expect(fromKilograms(toKilograms(pounds, "lb"), "lb")).toBe(pounds);
    }
  });

  it("converts feet and inches both ways", () => {
    expect(toCentimetres(5, 10)).toBe(177.8);
    expect(toFeetAndInches(177.8)).toEqual({ feet: 5, inches: 10 });
    expect(toCentimetres(6, 0)).toBe(182.9);
    expect(toFeetAndInches(182.9)).toEqual({ feet: 6, inches: 0 });
  });

  it("rounds a metric height to the nearest inch", () => {
    // 180 cm is 70.9 inches; the nearest whole inch is 71, which is 5′ 11″.
    expect(toFeetAndInches(180)).toEqual({ feet: 5, inches: 11 });
  });

  it("writes a measurement the way its owner would say it", () => {
    expect(formatBodyWeight(74.5, "kg")).toBe("74.5 kg");
    expect(formatBodyWeight(74.48, "lb")).toBe("164.2 lb");
    expect(formatHeight(178, "kg")).toBe("178 cm");
    expect(formatHeight(177.8, "lb")).toBe("5′ 10″");
  });
});

describe("age", () => {
  it("counts whole years, and only after the birthday has passed", () => {
    expect(ageOn("1994-03-21", "2026-09-10")).toBe(32);
    expect(ageOn("1994-03-21", "2026-03-21")).toBe(32);
    expect(ageOn("1994-03-21", "2026-03-20")).toBe(31);
  });

  it("has no answer for a birth date in the future", () => {
    expect(ageOn("2030-01-01", "2026-09-10")).toBeNull();
  });
});
