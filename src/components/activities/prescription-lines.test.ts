import { describe, expect, it } from "vitest";

import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import { maxZones } from "@/domain/heart-rate";

import { paceRangeLine, sessionIntensityLine, structureLines } from "./prescription-lines";

const KM = { distanceUnit: "km", poolUnit: "m" } as const;
const MI = { distanceUnit: "mi", poolUnit: "yd" } as const;

/** The line as it reads: the joiners and fixed spaces that hold figures together set aside. */
const plain = (text: string | null | undefined) =>
  text?.replace(/\u2060/g, "").replace(/\u00a0/g, " ");

const session = (nodes: unknown[], sessionTargets: Record<string, unknown> = {}) =>
  endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets,
    nodes,
  });

const step = (id: string, phase: string, target: unknown, extra: Record<string, unknown> = {}) => ({
  kind: "step",
  id,
  phase,
  action: "run",
  target,
  ...extra,
});

describe("a structured run, a line per block (ADR 0059)", () => {
  it("writes a repeated block once, with its pace and the rest between", () => {
    const lines = structureLines(
      session([
        step(
          "warm",
          "warmup",
          { kind: "duration", ms: [900_000, 900_000] },
          { heartRateZones: [1, 2] },
        ),
        {
          kind: "repeat",
          id: "reps",
          repetitions: 6,
          restBetweenMs: null,
          steps: [
            step(
              "rep",
              "work",
              { kind: "distance", metres: [800, 800] },
              { paceSecondsPerKm: [245, 255] },
            ),
            step("jog", "recovery", { kind: "duration", ms: [120_000, 120_000] }),
          ],
        },
        step("cool", "cooldown", { kind: "duration", ms: [600_000, 600_000] }),
      ]),
      KM,
    );
    expect(lines.map((line) => plain(line.lead))).toEqual(["Warm-up", "6 ×", "Cool-down"]);
    expect(plain(lines[1]!.text)).toBe("Run 800 m @ 4:05–4:15 /km, Jog 2 min");
    expect(plain(lines[0]!.text)).toBe("Run 15 min · Zones 1–2");
  });

  it("says a timed rep by its time and a zone in the athlete's beats", () => {
    const zones = maxZones(190);
    const [line] = structureLines(
      session([
        {
          kind: "repeat",
          id: "reps",
          repetitions: 8,
          restBetweenMs: 120_000,
          steps: [
            step(
              "rep",
              "work",
              { kind: "duration", ms: [120_000, 120_000] },
              { heartRateZones: [4, 4] },
            ),
          ],
        },
      ]),
      KM,
      zones,
    );
    expect(plain(line!.text)).toBe("Run 2 min · Zone 4 (152–170 bpm) · 2 min rest between");
  });

  it("reads a pace per mile for an athlete in miles", () => {
    expect(plain(paceRangeLine([300, 310], MI))).toBe("8:03–8:19 /mi");
  });

  it("gives an easy run without steps its whole pace and zone", () => {
    const easy = session([], {
      distanceMetres: [8000, 8000],
      paceSecondsPerKm: [360, 390],
      heartRateZones: [2, 3],
    });
    expect(structureLines(easy, KM)).toEqual([]);
    expect(plain(sessionIntensityLine(easy, KM))).toBe("@ 6:00–6:30 /km · Zones 2–3");
  });

  it("says a pace, zone or effort once where the session's own line already says it", () => {
    const strides = session(
      [
        step(
          "easy",
          "work",
          { kind: "duration", ms: [1_440_000, 1_680_000] },
          { paceSecondsPerKm: [450, 530], effort: [1, 2] },
        ),
        {
          kind: "repeat",
          id: "strides",
          repetitions: 6,
          restBetweenMs: null,
          steps: [
            step("stride", "work", { kind: "duration", ms: [15_000, 20_000] }, { effort: [3, 4] }),
            step(
              "walk",
              "recovery",
              { kind: "duration", ms: [48_000, 60_000] },
              { action: "walk", effort: [1, 1] },
            ),
          ],
        },
      ],
      { durationMs: [1_800_000, 2_100_000], paceSecondsPerKm: [450, 530], effort: [1, 2] },
    );
    const said = structureLines(strides, KM, null, strides.sessionTargets);
    expect(said.map((line) => plain(line.text))).toEqual([
      "Run 24–28 min",
      "Run 15–20 s · Effort 3–4 of 5, Walk 48–60 s · Effort 1 of 5",
    ]);
    // A screen that does not say the session's targets keeps every step whole.
    expect(plain(structureLines(strides, KM)[0]!.text)).toBe(
      "Run 24–28 min @ 7:30–8:50 /km · Effort 1–2 of 5",
    );
  });
});
