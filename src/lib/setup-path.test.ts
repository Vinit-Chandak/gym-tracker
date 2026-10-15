import { describe, expect, it } from "vitest";

import {
  firstAcceptedLanguage,
  setupSteps,
  unitsForLocale,
  withWeight,
  zoneCity,
  zoneLine,
  zoneOffset,
} from "./setup-path";

const keys = (path: Parameters<typeof setupSteps>[0]) => setupSteps(path).map((step) => step.key);

describe("the steps of setup an athlete is asked", () => {
  it("gives a beginner at a gym three: You, Where you train, Your plan", () => {
    expect(keys({ experience: "new", lifts: true, kind: "gym" })).toEqual(["you", "where", "plan"]);
  });

  it("gives someone who already trains the optional equipment step and How you start", () => {
    expect(keys({ experience: "experienced", lifts: true, kind: "gym" })).toEqual([
      "you",
      "where",
      "unusual",
      "start",
    ]);
  });

  it("asks what is there at home or outdoors, whoever is asking", () => {
    expect(keys({ experience: "new", lifts: true, kind: "home" })).toEqual([
      "you",
      "where",
      "kit",
      "plan",
    ]);
    expect(keys({ experience: "experienced", lifts: true, kind: "outdoor" })).toEqual([
      "you",
      "where",
      "kit",
      "start",
    ]);
  });

  /** Audit U13: a swimmer's dots marked Gym and Machines as done. */
  it("ends after the first step for someone who does not lift", () => {
    expect(keys({ experience: "new", lifts: false, kind: null })).toEqual(["you"]);
  });

  it("assumes lifting until the sports are chosen, so the first screen shows a path", () => {
    expect(keys({ experience: null, lifts: null, kind: null })).toEqual(["you", "where", "plan"]);
  });
});

describe("units from the phone", () => {
  /** Audit B11: pounds left runs in kilometres; nothing inferred the road's unit. */
  it("reads pounds, miles and yard pools in the United States, metric everywhere else", () => {
    expect(unitsForLocale("en-US")).toEqual({ weight: "lb", distance: "mi", pool: "yd" });
    expect(unitsForLocale("en-GB")).toEqual({ weight: "kg", distance: "km", pool: "m" });
    expect(unitsForLocale("hi-IN")).toEqual({ weight: "kg", distance: "km", pool: "m" });
    // A language alone says its most likely region: English is the United States'.
    expect(unitsForLocale("en")).toEqual({ weight: "lb", distance: "mi", pool: "yd" });
    expect(unitsForLocale("de")).toEqual({ weight: "kg", distance: "km", pool: "m" });
  });

  it("takes the distances along when the weight changes, unless they were changed apart", () => {
    // A phone in Britain proposes kilograms; choosing pounds reads miles and yards (ADR 0055).
    const british = unitsForLocale("en-GB");
    expect(withWeight(british, "lb")).toEqual({ weight: "lb", distance: "mi", pool: "yd" });
    // Kilograms with miles was set apart: the miles stay, and the metre pools follow.
    expect(withWeight({ ...british, distance: "mi" }, "lb")).toEqual({
      weight: "lb",
      distance: "mi",
      pool: "yd",
    });
    expect(withWeight({ weight: "lb", distance: "km", pool: "yd" }, "kg")).toEqual({
      weight: "kg",
      distance: "km",
      pool: "m",
    });
  });

  it("falls back to metric when the phone says nothing usable", () => {
    expect(unitsForLocale(null)).toEqual({ weight: "kg", distance: "km", pool: "m" });
    expect(unitsForLocale("not a locale!")).toEqual({ weight: "kg", distance: "km", pool: "m" });
  });

  it("takes the first language a request asks for", () => {
    expect(firstAcceptedLanguage("en-US,en;q=0.9,fr;q=0.8")).toBe("en-US");
    expect(firstAcceptedLanguage("*")).toBeNull();
    expect(firstAcceptedLanguage(null)).toBeNull();
  });
});

describe("a time zone as the first step says it", () => {
  it("names the city, never the region", () => {
    expect(zoneCity("Europe/London")).toBe("London");
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zoneLine("America/New_York")).toBe("New York time");
    expect(zoneLine("UTC")).toBe("UTC");
  });

  it("gives the offset now, with a true minus", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    expect(zoneOffset("Europe/London", winter)).toBe("GMT");
    expect(zoneOffset("Asia/Kolkata", winter)).toBe("GMT+5:30");
    expect(zoneOffset("America/New_York", winter)).toBe("GMT−5");
    expect(zoneOffset("Not/A_Zone", winter)).toBeNull();
  });
});
