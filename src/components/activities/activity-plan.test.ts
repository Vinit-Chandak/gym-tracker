import { expect, it } from "vitest";

import { endurancePrescriptionSchema, expandSteps } from "@/domain/activity-prescription";
import { runSummary } from "@/components/run-plan";
import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";

import { sessionLine, stepLine } from "./activity-plan";

/**
 * A planned effort says the scale it is on, and since 0034 that is the athlete's own five
 * steps. "Effort 1–2 of 10" above a form that asks 1 very easy to 5 maximal read as a target of
 * almost nothing, on a scale the athlete could not compare with.
 */

const MINUTE = 60_000;

it("gives a session's effort out of five", () => {
  const prescription = endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets: { durationMs: [25 * MINUTE, 30 * MINUTE], effort: [1, 2] },
  });
  expect(sessionLine(prescription, DEFAULT_SPORT_UNITS)).toBe(
    "25 min–30 min ·\u00a0Effort 1–2 of 5",
  );
});

it("gives a step's effort out of five", () => {
  const [step] = expandSteps(
    endurancePrescriptionSchema.parse({
      prescriptionVersion: 1,
      sport: "running",
      nodes: [
        {
          kind: "step",
          id: "tempo",
          phase: "work",
          action: "run",
          target: { kind: "duration", ms: [10 * MINUTE, 10 * MINUTE] },
          effort: [3, 3],
        },
      ],
    }),
  );
  expect(stepLine(step!, "running", DEFAULT_SPORT_UNITS)).toBe(
    "Run ·\u00a010 min ·\u00a0Effort 3 of 5",
  );
});

it("gives a programme run's effort out of five, and none when it asks for none", () => {
  const run = { distanceMinKm: null, distanceMaxKm: null, durationMinMinutes: 20 };
  expect(
    runSummary({ ...run, durationMaxMinutes: 25, rpeMin: 1, rpeMax: 2 }, DEFAULT_SPORT_UNITS),
  ).toBe("20–25 min ·\u00a0Effort 1–2 of 5");
  expect(
    runSummary({ ...run, durationMaxMinutes: 25, rpeMin: 0, rpeMax: 0 }, DEFAULT_SPORT_UNITS),
  ).toBe("20–25 min");
});

it("gives a programme run's distance in the athlete's road unit, as Today does", () => {
  const run = { distanceMinKm: 7.3, distanceMaxKm: 8.3, durationMinMinutes: 40 };
  const miles = { distanceUnit: "mi", poolUnit: "yd" } as const;
  expect(runSummary({ ...run, durationMaxMinutes: 50 }, DEFAULT_SPORT_UNITS)).toBe(
    "7.3–8.3\u00a0km ·\u00a040–50 min",
  );
  // The programme writes kilometres; a runner who reads miles is never shown them. A range
  // reads to a tenth; one distance to a hundredth.
  expect(runSummary({ ...run, durationMaxMinutes: 50 }, miles)).toBe(
    "4.5–5.2\u00a0mi ·\u00a040–50 min",
  );
  expect(runSummary({ ...run, distanceMaxKm: null, durationMaxMinutes: 50 }, miles)).toBe(
    "4.54\u00a0mi ·\u00a040–50 min",
  );
});
