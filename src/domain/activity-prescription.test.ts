import { describe, expect, it } from "vitest";

import { DEFAULT_SPORT_UNITS, toMetres } from "@/lib/distance-units";

import {
  describePrescription,
  durationTargetParts,
  expandSteps,
  parsePrescription,
  prescriptionTarget,
  prescriptionTotals,
  simplePrescription,
  type PrescriptionNode,
} from "./activity-prescription";

const MINUTE = 60_000;
const KM = DEFAULT_SPORT_UNITS;
const MILES = { distanceUnit: "mi", poolUnit: "yd" } as const;

const step = (overrides: Partial<PrescriptionNode> & { id: string }): PrescriptionNode =>
  ({
    kind: "step",
    phase: "work",
    action: "run",
    target: { kind: "duration", ms: [2 * MINUTE, 2 * MINUTE] },
    effort: null,
    stroke: null,
    notes: null,
    ...overrides,
  }) as PrescriptionNode;

const prescription = (sport: "running" | "cycling" | "swimming", nodes: PrescriptionNode[]) =>
  parsePrescription({ prescriptionVersion: 1, sport, nodes });

describe("written sessions", () => {
  /** AT-STRUCT-03: a run/walk is one activity with steps, not two sports. */
  it("keeps 5 × [2-minute run + 1-minute walk] as one running prescription", () => {
    const result = prescription("running", [
      {
        kind: "repeat",
        id: "block",
        repetitions: 5,
        restBetweenMs: null,
        steps: [
          step({ id: "run" }) as never,
          step({
            id: "walk",
            action: "walk",
            phase: "recovery",
            target: { kind: "duration", ms: [MINUTE, MINUTE] },
          }) as never,
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(expandSteps(result.value)).toHaveLength(10);
    expect(prescriptionTotals(result.value)).toMatchObject({
      durationMs: 15 * MINUTE,
      distanceMetres: null,
      prescribedRestMs: 0,
      steps: 10,
    });
    expect(describePrescription(result.value, KM)).toBe("5 × 2 min");
  });

  /** AT-STRUCT-04: eight fifties is 400 m and seven rests, not eight. */
  it("counts the rests between repetitions, not after the last one", () => {
    const result = prescription("swimming", [
      {
        kind: "repeat",
        id: "fifties",
        repetitions: 8,
        restBetweenMs: 20_000,
        steps: [
          step({
            id: "fifty",
            action: "swim",
            target: { kind: "distance", metres: [50, 50] },
          }) as never,
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const totals = prescriptionTotals(result.value);
    expect(totals.distanceMetres).toBe(400);
    expect(totals.prescribedRestMs).toBe(7 * 20_000);
    // Nothing about the prescription says how long the 400 m will take.
    expect(totals.durationMs).toBeNull();
  });

  /** AT-STRUCT-05: mixed axes leave the total unknown rather than inventing a pace. */
  it("refuses to total a session that mixes time and distance", () => {
    const result = prescription("cycling", [
      step({ id: "warm", action: "ride", phase: "warmup" }) as never,
      step({
        id: "effort",
        action: "ride",
        target: { kind: "distance", metres: [5000, 5000] },
      }) as never,
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(prescriptionTotals(result.value)).toMatchObject({
      durationMs: null,
      distanceMetres: null,
    });
  });

  it("takes an overall target with no steps at all", () => {
    const easy = simplePrescription("cycling", {
      durationMs: [30 * MINUTE, 30 * MINUTE],
      effort: [3, 4],
    });
    expect(describePrescription(easy, KM)).toBe("30 min");
    const fiveK = simplePrescription("running", { distanceMetres: [5000, 5000] });
    expect(describePrescription(fiveK, KM)).toBe("5 km");
  });
});

/**
 * A target reads in the athlete's own unit for its sport, rounded for reading, whatever unit
 * it was written in. These summaries used to print raw kilometres for every sport.
 */
describe("what a session is said to ask for", () => {
  const swimSet = (yards: number, repetitions: number) =>
    prescription("swimming", [
      {
        kind: "repeat",
        id: "block",
        repetitions,
        restBetweenMs: 20_000,
        steps: [
          step({
            id: "work",
            action: "swim",
            target: { kind: "distance", metres: [toMetres(yards, "yd"), toMetres(yards, "yd")] },
          }) as never,
        ],
      },
    ]);

  it("says a swim in metres or yards, never in kilometres", () => {
    const thousandYards = simplePrescription("swimming", {
      distanceMetres: [toMetres(1000, "yd"), toMetres(1000, "yd")],
    });
    expect(describePrescription(thousandYards, KM)).toBe("914 m");
    expect(describePrescription(thousandYards, MILES)).toBe("1,000 yd");
    const mile = simplePrescription("swimming", { distanceMetres: [1500, 1500] });
    expect(describePrescription(mile, KM)).toBe("1,500 m");
  });

  it("says a run in kilometres or miles, rounded for reading", () => {
    const fiveMiles = simplePrescription("running", {
      distanceMetres: [toMetres(5, "mi"), toMetres(5, "mi")],
    });
    expect(describePrescription(fiveMiles, KM)).toBe("8.05 km");
    expect(describePrescription(fiveMiles, MILES)).toBe("5 mi");
  });

  it("says a repeated block in the unit its sport is read in", () => {
    const fifties = swimSet(50, 8);
    expect(fifties.ok).toBe(true);
    if (!fifties.ok) return;
    expect(describePrescription(fifties.value, MILES)).toBe("8 × 50 yd");
    expect(describePrescription(fifties.value, KM)).toBe("8 × 46 m");
  });

  it("gives a range in full, distance and duration alike", () => {
    const easy = simplePrescription("running", { durationMs: [25 * MINUTE, 30 * MINUTE] });
    expect(describePrescription(easy, KM)).toBe("25–30 min");
    const between = simplePrescription("cycling", { distanceMetres: [20_000, 25_000] });
    expect(prescriptionTarget(between, KM)).toEqual({ figure: "20–25", unit: "km" });
  });

  it("says a block of seconds in seconds rather than as no minutes at all", () => {
    expect(durationTargetParts([20_000, 20_000])).toEqual({ figure: "20", unit: "s" });
    expect(durationTargetParts([90_000, 90_000])).toEqual({ figure: "1.5", unit: "min" });
    // A range that starts under a minute reads in seconds up to two: never "0.8–1 min".
    expect(durationTargetParts([48_000, 60_000])).toEqual({ figure: "48–60", unit: "s" });
    expect(durationTargetParts([45_000, 90_000])).toEqual({ figure: "45–90", unit: "s" });
    expect(durationTargetParts([30_000, 180_000])).toEqual({ figure: "0.5–3", unit: "min" });
    // A session's minutes are whole, its range widened to them: a target worked out from a pace
    // said "36.3–49.5 min" (owner, 28 October 2026).
    expect(durationTargetParts([2_178_000, 2_970_000])).toEqual({ figure: "36–50", unit: "min" });
    expect(durationTargetParts([2_175_000, 2_175_000])).toEqual({ figure: "36", unit: "min" });
    expect(durationTargetParts([25 * 60_000, 30 * 60_000])).toEqual({
      figure: "25–30",
      unit: "min",
    });
    const strides = prescription("running", [
      {
        kind: "repeat",
        id: "block",
        repetitions: 6,
        restBetweenMs: null,
        steps: [
          step({ id: "stride", target: { kind: "duration", ms: [20_000, 20_000] } }) as never,
        ],
      },
    ]);
    expect(strides.ok).toBe(true);
    if (!strides.ok) return;
    expect(describePrescription(strides.value, KM)).toBe("6 × 20 s");
  });

  it("is named for its main work: a run beside its strides, a tempo, a race", () => {
    const strides = {
      kind: "repeat" as const,
      id: "strides",
      repetitions: 6,
      restBetweenMs: null,
      steps: [step({ id: "stride", target: { kind: "duration", ms: [20_000, 20_000] } })],
    } as PrescriptionNode;
    const named = (nodes: PrescriptionNode[]) => {
      const result = prescription("running", nodes);
      if (!result.ok) throw new Error(JSON.stringify(result.problems));
      return describePrescription(result.value, KM);
    };
    // Easy minutes or kilometres, then strides: the run names it, however each is measured.
    expect(
      named([
        step({ id: "easy", target: { kind: "duration", ms: [35 * MINUTE, 35 * MINUTE] } }),
        strides,
      ]),
    ).toBe("35 min");
    expect(
      named([step({ id: "easy", target: { kind: "distance", metres: [8000, 8000] } }), strides]),
    ).toBe("8 km");
    // The reps between a warm-up and a cool-down are the session, as they always were.
    expect(
      named([
        step({ id: "warm", phase: "warmup", target: { kind: "distance", metres: [2000, 2000] } }),
        {
          kind: "repeat",
          id: "reps",
          repetitions: 6,
          restBetweenMs: null,
          steps: [
            step({ id: "rep", target: { kind: "distance", metres: [800, 800] } }),
            step({
              id: "jog",
              phase: "recovery",
              target: { kind: "distance", metres: [400, 400] },
            }),
          ],
        } as PrescriptionNode,
        step({ id: "cool", phase: "cooldown", target: { kind: "distance", metres: [1500, 1500] } }),
      ]),
    ).toBe("6 × 800 m");
    // So is a block that is more of the run than the work beside it.
    expect(
      named([
        step({ id: "settle", target: { kind: "duration", ms: [5 * MINUTE, 5 * MINUTE] } }),
        {
          kind: "repeat",
          id: "threes",
          repetitions: 5,
          restBetweenMs: null,
          steps: [
            step({ id: "three", target: { kind: "duration", ms: [3 * MINUTE, 3 * MINUTE] } }),
          ],
        } as PrescriptionNode,
      ]),
    ).toBe("5 × 3 min");
    // One work step between a warm-up and a cool-down measured otherwise: that step.
    expect(
      named([
        step({ id: "warm", phase: "warmup", target: { kind: "distance", metres: [2000, 2000] } }),
        step({ id: "tempo", target: { kind: "duration", ms: [20 * MINUTE, 20 * MINUTE] } }),
        step({ id: "cool", phase: "cooldown", target: { kind: "distance", metres: [1500, 1500] } }),
      ]),
    ).toBe("20 min");
    expect(
      named([
        step({
          id: "warm",
          phase: "warmup",
          target: { kind: "duration", ms: [12 * MINUTE, 12 * MINUTE] },
        }),
        step({ id: "race", target: { kind: "distance", metres: [5000, 5000] } }),
      ]),
    ).toBe("5 km");
  });

  it("keeps the unit a distance was written in, for the editor and nothing else", () => {
    const written = parsePrescription({
      prescriptionVersion: 1,
      sport: "running",
      sessionTargets: {
        distanceMetres: [toMetres(5, "mi"), toMetres(5, "mi")],
        distanceUnit: "mi",
      },
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.value.sessionTargets.distanceUnit).toBe("mi");
    // Read in kilometres all the same: the athlete reads in their unit, not the author's.
    expect(describePrescription(written.value, KM)).toBe("8.05 km");
    // A prescription written without one gains no key it did not have.
    expect(
      "distanceUnit" in
        simplePrescription("running", { distanceMetres: [5000, 5000] }).sessionTargets,
    ).toBe(false);
  });
});

describe("what a prescription may not be", () => {
  /** AT-STRUCT-02: the bounds are payload safeguards, and they are enforced. */
  it("refuses a repeat inside a repeat", () => {
    const result = parsePrescription({
      prescriptionVersion: 1,
      sport: "running",
      nodes: [
        {
          kind: "repeat",
          id: "outer",
          repetitions: 2,
          steps: [{ kind: "repeat", id: "inner", repetitions: 2, steps: [step({ id: "a" })] }],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses reversed, empty and over-large ranges", () => {
    const reversed = prescription("running", [
      step({ id: "a", target: { kind: "duration", ms: [600_000, 60_000] } }) as never,
    ]);
    expect(reversed.ok).toBe(false);
    const empty = prescription("running", [
      step({ id: "a", target: { kind: "duration", ms: [0, 0] } }) as never,
    ]);
    expect(empty.ok).toBe(false);
    const tooMany = parsePrescription({
      prescriptionVersion: 1,
      sport: "running",
      nodes: [
        {
          kind: "repeat",
          id: "block",
          repetitions: 101,
          steps: [step({ id: "a" })],
        },
      ],
    });
    expect(tooMany.ok).toBe(false);
  });

  it("refuses more than a thousand expanded steps", () => {
    const result = parsePrescription({
      prescriptionVersion: 1,
      sport: "swimming",
      nodes: Array.from({ length: 11 }, (_, index) => ({
        kind: "repeat",
        id: `block-${index}`,
        repetitions: 100,
        steps: [
          {
            ...step({ id: `s-${index}` }),
            action: "swim",
            target: { kind: "distance", metres: [25, 25] },
          },
        ],
      })),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((problem) => problem.message.includes("1000"))).toBe(true);
  });

  it("refuses a step that belongs to another sport", () => {
    expect(prescription("swimming", [step({ id: "a", action: "ride" }) as never]).ok).toBe(false);
    expect(prescription("cycling", [step({ id: "a", action: "run" }) as never]).ok).toBe(false);
  });

  it("allows a recovery step with no distance and refuses a work step with none", () => {
    const recovery = prescription("running", [
      step({
        id: "float",
        phase: "recovery",
        action: "walk",
        target: { kind: "distance", metres: [0, 200] },
      }) as never,
    ]);
    expect(recovery.ok).toBe(true);
    const work = prescription("running", [
      step({ id: "work", target: { kind: "distance", metres: [0, 200] } }) as never,
    ]);
    expect(work.ok).toBe(false);
  });

  it("keeps running's own instructions off the other sports", () => {
    const result = parsePrescription({
      prescriptionVersion: 1,
      sport: "cycling",
      sessionTargets: { durationMs: [30 * MINUTE, 30 * MINUTE] },
      running: { symptomStopRule: "Stop if the shin complains." },
    });
    expect(result.ok).toBe(false);
  });

  it("insists an authored session asks for something", () => {
    expect(parsePrescription({ prescriptionVersion: 1, sport: "running" }).ok).toBe(false);
    // A legacy summary may be bare: its source really did say nothing more.
    expect(
      parsePrescription({
        prescriptionVersion: 1,
        sport: "running",
        structureSource: "legacy_summary",
      }).ok,
    ).toBe(true);
  });
});
