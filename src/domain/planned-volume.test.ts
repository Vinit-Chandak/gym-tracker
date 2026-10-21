import { describe, expect, it } from "vitest";

import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";

import { endurancePrescriptionSchema, type PrescriptionNode } from "./activity-prescription";
import { plannedVolume, plannedVolumeLine } from "./planned-volume";

const MINUTE = 60_000;
const run = (body: { targets?: object; nodes?: PrescriptionNode[] }) =>
  endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets: body.targets ?? {},
    nodes: body.nodes ?? [],
  });
const step = (id: string, target: object, phase = "work"): PrescriptionNode =>
  ({ kind: "step", id, phase, action: "run", target }) as PrescriptionNode;

describe("a planned week's volume", () => {
  it("keeps distance and time apart, each step counted the way it is measured", () => {
    const long = run({ targets: { distanceMetres: [10_000, 12_000] } });
    const easy = run({ targets: { durationMs: [30 * MINUTE, 30 * MINUTE] } });
    const tempo = run({
      nodes: [
        step("warm", { kind: "distance", metres: [2000, 2000] }, "warmup"),
        step("tempo", { kind: "duration", ms: [20 * MINUTE, 20 * MINUTE] }),
        step("cool", { kind: "distance", metres: [1500, 1500] }, "cooldown"),
      ],
    });
    const reps = run({
      nodes: [
        {
          kind: "repeat",
          id: "reps",
          repetitions: 6,
          steps: [
            step("rep", { kind: "distance", metres: [800, 800] }),
            step("jog", { kind: "distance", metres: [400, 400] }, "recovery"),
          ],
        } as PrescriptionNode,
      ],
    });
    const volume = plannedVolume([long, easy, tempo, reps, null]);
    expect(volume).toEqual({ sessions: 5, metres: 12_000 + 3500 + 7200, timedMs: 50 * MINUTE });
    expect(plannedVolumeLine(volume, "running", DEFAULT_SPORT_UNITS)).toBe("22.7 km + 50 min");
  });

  it("reads a week to a tenth of the athlete's unit", () => {
    const tenK = run({ targets: { distanceMetres: [10_000, 10_000] } });
    const fourMiles = run({ targets: { distanceMetres: [6437.4, 6437.4] } });
    expect(
      plannedVolumeLine(plannedVolume([tenK, fourMiles]), "running", {
        distanceUnit: "mi",
        poolUnit: "yd",
      }),
    ).toBe("10.2\u00a0mi");
  });

  it("says only what there is", () => {
    const easy = run({ targets: { durationMs: [30 * MINUTE, 40 * MINUTE] } });
    expect(plannedVolumeLine(plannedVolume([easy]), "running", DEFAULT_SPORT_UNITS)).toBe("40 min");
    expect(plannedVolumeLine(plannedVolume([]), "running", DEFAULT_SPORT_UNITS)).toBeNull();
  });
});
