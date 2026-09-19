import { describe, expect, it } from "vitest";

import {
  describePrescription,
  expandSteps,
  parsePrescription,
  prescriptionTotals,
  simplePrescription,
  type PrescriptionNode,
} from "./activity-prescription";

const MINUTE = 60_000;

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
    expect(describePrescription(result.value)).toBe("5 × 2 min");
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
    expect(describePrescription(easy)).toBe("30 minutes");
    const fiveK = simplePrescription("running", { distanceMetres: [5000, 5000] });
    expect(describePrescription(fiveK)).toBe("5 km");
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
