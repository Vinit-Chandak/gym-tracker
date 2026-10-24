import { describe, expect, it } from "vitest";

import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";

import { endurancePrescriptionSchema, type PrescriptionNode } from "./activity-prescription";
import { planPace, plannedVolume, plannedVolumeLine } from "./planned-volume";

const MINUTE = 60_000;
const EASY: [number, number] = [450, 530];
const run = (body: { targets?: object; nodes?: PrescriptionNode[] }) =>
  endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets: body.targets ?? {},
    nodes: body.nodes ?? [],
  });
const step = (
  id: string,
  target: object,
  phase = "work",
  extra: { action?: string; paceSecondsPerKm?: [number, number] } = {},
): PrescriptionNode =>
  ({ kind: "step", id, phase, action: "run", target, ...extra }) as PrescriptionNode;

describe("a planned week's volume", () => {
  it("keeps distance and time apart where no run has a pace, each step counted as measured", () => {
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
    expect(volume).toEqual({
      sessions: 5,
      metres: 12_000 + 3500 + 7200,
      pacedMetres: 0,
      timedMs: 50 * MINUTE,
      asideMs: 0,
    });
    expect(plannedVolumeLine(volume, "running", DEFAULT_SPORT_UNITS)).toBe("22.7 km + 50 min");
  });

  it("reads timed runs at their own pace, as one approximate distance", () => {
    // A first week as the coach wrote it: easy runs by time at 7:30–8:50 /km, the long run by
    // distance, strides with walked recoveries. It read "8 km + 74 min".
    const long = run({ targets: { distanceMetres: [7000, 8000], paceSecondsPerKm: EASY } });
    const easy = run({
      targets: { durationMs: [30 * MINUTE, 35 * MINUTE], paceSecondsPerKm: EASY },
    });
    const strides = run({
      targets: { durationMs: [30 * MINUTE, 35 * MINUTE], paceSecondsPerKm: EASY },
      nodes: [
        step("easy", { kind: "duration", ms: [24 * MINUTE, 28 * MINUTE] }, "work", {
          paceSecondsPerKm: EASY,
        }),
        {
          kind: "repeat",
          id: "strides",
          repetitions: 6,
          steps: [
            step("stride", { kind: "duration", ms: [15_000, 20_000] }),
            step("walk", { kind: "duration", ms: [48_000, 60_000] }, "recovery", {
              action: "walk",
            }),
          ],
        } as PrescriptionNode,
        step("cool", { kind: "duration", ms: [2 * MINUTE, 3 * MINUTE] }, "cooldown", {
          paceSecondsPerKm: EASY,
        }),
      ],
    });
    const volume = plannedVolume([strides, easy, long]);
    expect(volume.metres).toBe(8000);
    expect(volume.asideMs).toBe(6 * MINUTE);
    expect(volume.timedMs).toBe(0);
    // 35 + 28 + 2 + 3 minutes of running at 8:10 /km, the middle of the pace: about 8.3 km.
    expect(volume.pacedMetres).toBeCloseTo(((35 + 28 + 2 + 3) * MINUTE) / 490, 6);
    expect(plannedVolumeLine(volume, "running", DEFAULT_SPORT_UNITS)).toBe("≈ 16 km");
  });

  it("reads running with no pace of its own at the plan's easiest, and keeps time where none", () => {
    const long = run({ targets: { distanceMetres: [10_000, 10_000] } });
    const zoned = run({
      targets: { durationMs: [40 * MINUTE, 40 * MINUTE], heartRateZones: [2, 3] },
    });
    const tempo = run({
      nodes: [
        step("warm", { kind: "duration", ms: [10 * MINUTE, 10 * MINUTE] }, "warmup"),
        step("tempo", { kind: "duration", ms: [20 * MINUTE, 20 * MINUTE] }, "work", {
          paceSecondsPerKm: [300, 300],
        }),
      ],
    });
    const easiest = planPace([long, zoned, tempo, null]);
    expect(easiest).toEqual([300, 300]);
    // A plan with no pace anywhere keeps its timed running as time.
    expect(plannedVolumeLine(plannedVolume([long, zoned]), "running", DEFAULT_SPORT_UNITS)).toBe(
      "10 km + 40 min",
    );
    // Its easiest pace, given in another week, reads this week's zoned run and warm-up.
    const easy: [number, number] = [400, 400];
    const week = plannedVolume([long, zoned, tempo], easy);
    expect(week.pacedMetres).toBeCloseTo(6000 + 1500 + 4000, 6);
    expect(plannedVolumeLine(week, "running", DEFAULT_SPORT_UNITS)).toBe("≈ 22 km");
  });

  it("reads a week with no distance in time, its walks included", () => {
    const runWalk = run({
      nodes: [
        {
          kind: "repeat",
          id: "intervals",
          repetitions: 8,
          steps: [
            step("run", { kind: "duration", ms: [MINUTE, MINUTE] }),
            step("walk", { kind: "duration", ms: [90_000, 90_000] }, "recovery", {
              action: "walk",
            }),
          ],
        } as PrescriptionNode,
      ],
    });
    expect(plannedVolumeLine(plannedVolume([runWalk]), "running", DEFAULT_SPORT_UNITS)).toBe(
      "20 min",
    );
  });

  it("reads a week to a tenth of the athlete's unit, and an approximate one to the whole", () => {
    const tenK = run({ targets: { distanceMetres: [10_000, 10_000] } });
    const fourMiles = run({ targets: { distanceMetres: [6437.4, 6437.4] } });
    const miles = { distanceUnit: "mi", poolUnit: "yd" } as const;
    expect(plannedVolumeLine(plannedVolume([tenK, fourMiles]), "running", miles)).toBe("10.2 mi");
    const easy = run({
      targets: { durationMs: [45 * MINUTE, 45 * MINUTE], paceSecondsPerKm: EASY },
    });
    expect(plannedVolumeLine(plannedVolume([tenK, fourMiles, easy]), "running", miles)).toBe(
      "≈ 14 mi",
    );
  });

  it("says only what there is", () => {
    const easy = run({ targets: { durationMs: [30 * MINUTE, 40 * MINUTE] } });
    expect(plannedVolumeLine(plannedVolume([easy]), "running", DEFAULT_SPORT_UNITS)).toBe("40 min");
    expect(plannedVolumeLine(plannedVolume([]), "running", DEFAULT_SPORT_UNITS)).toBeNull();
  });
});
