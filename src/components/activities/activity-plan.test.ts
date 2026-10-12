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
  // The range says its unit once, as the card's figure and the programme day do, and is held
  // at its dash where the line wraps.
  expect(sessionLine(prescription, DEFAULT_SPORT_UNITS)).toBe(
    "25\u2060–\u206030\u00a0min ·\u00a0Effort 1\u2060–\u20602 of\u00a05",
  );
});

/**
 * Review, 12 October 2026: at 320 pt the session's line broke at a range's dash, "4.7–6.0 mi ·
 * 37–" over "47 min", against the rule that a range is held at its dash.
 */
it("holds a session's distance and duration ranges at their dashes, and a step's", () => {
  const prescription = endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets: { distanceMetres: [7500, 9600], durationMs: [37 * MINUTE, 47 * MINUTE] },
    nodes: [
      {
        kind: "step",
        id: "steady",
        phase: "work",
        action: "run",
        target: { kind: "duration", ms: [20 * MINUTE, 25 * MINUTE] },
      },
    ],
  });
  expect(sessionLine(prescription, { distanceUnit: "mi", poolUnit: "yd" })).toBe(
    "4.7\u2060–\u20606.0\u00a0mi ·\u00a037\u2060–\u206047\u00a0min",
  );
  const [step] = expandSteps(prescription);
  expect(stepLine(step!, "running", DEFAULT_SPORT_UNITS)).toBe(
    "Run ·\u00a020\u2060–\u206025\u00a0min",
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
    "Run ·\u00a010\u00a0min ·\u00a0Effort 3 of\u00a05",
  );
});

it("gives a programme run's effort out of five, and none when it asks for none", () => {
  const run = { distanceMinKm: null, distanceMaxKm: null, durationMinMinutes: 20 };
  expect(
    runSummary({ ...run, durationMaxMinutes: 25, rpeMin: 1, rpeMax: 2 }, DEFAULT_SPORT_UNITS),
  ).toBe("20\u2060–\u206025\u00a0min ·\u00a0Effort 1\u2060–\u20602 of\u00a05");
  expect(
    runSummary({ ...run, durationMaxMinutes: 25, rpeMin: 0, rpeMax: 0 }, DEFAULT_SPORT_UNITS),
  ).toBe("20\u2060–\u206025\u00a0min");
});

it("says a run's minutes once, under a day's time that already says them", () => {
  // Liam's Easy run: "40–50 min" in the header, and again in its Run row.
  const run = { distanceMinKm: 7, distanceMaxKm: 9, durationMinMinutes: 40, rpeMin: 2, rpeMax: 2 };
  const miles = { distanceUnit: "mi", poolUnit: "yd" } as const;
  expect(runSummary({ ...run, durationMaxMinutes: 50 }, miles, { dayTime: "40–50 min" })).toBe(
    "4.3\u2060–\u20605.6\u00a0mi ·\u00a0Effort 2 of\u00a05",
  );
  // The note is the coach's own writing: read for its minutes, not matched to the letter.
  for (const dayTime of [
    "40-50 min",
    "40 – 50 minutes",
    "40–50 mins",
    "40\u2060–\u206050\u00a0min",
  ])
    expect(runSummary({ ...run, durationMaxMinutes: 50 }, miles, { dayTime })).toBe(
      "4.3\u2060–\u20605.6\u00a0mi ·\u00a0Effort 2 of\u00a05",
    );
  expect(runSummary({ ...run, durationMaxMinutes: 40 }, miles, { dayTime: "40 min" })).toBe(
    "4.3\u2060–\u20605.6\u00a0mi ·\u00a0Effort 2 of\u00a05",
  );
  // A time that says something else, or more than the minutes, leaves the run's own said.
  for (const dayTime of ["50–60 min", "About 40–50 min", "40–50 min + strides"])
    expect(runSummary({ ...run, durationMaxMinutes: 50 }, miles, { dayTime })).toBe(
      "4.3\u2060–\u20605.6\u00a0mi ·\u00a040\u2060–\u206050\u00a0min ·\u00a0Effort 2 of\u00a05",
    );
});

it("gives a programme run's distance in the athlete's road unit, as Today does", () => {
  const run = { distanceMinKm: 7.3, distanceMaxKm: 8.3, durationMinMinutes: 40 };
  const miles = { distanceUnit: "mi", poolUnit: "yd" } as const;
  expect(runSummary({ ...run, durationMaxMinutes: 50 }, DEFAULT_SPORT_UNITS)).toBe(
    "7.3\u2060–\u20608.3\u00a0km ·\u00a040\u2060–\u206050\u00a0min",
  );
  // The programme writes kilometres; a runner who reads miles is never shown them. A range
  // reads to a tenth; one distance to a hundredth.
  expect(runSummary({ ...run, durationMaxMinutes: 50 }, miles)).toBe(
    "4.5\u2060–\u20605.2\u00a0mi ·\u00a040\u2060–\u206050\u00a0min",
  );
  expect(runSummary({ ...run, distanceMaxKm: null, durationMaxMinutes: 50 }, miles)).toBe(
    "4.54\u00a0mi ·\u00a040\u2060–\u206050\u00a0min",
  );
});
