import { describe, expect, it } from "vitest";

import { RUN_TYPES, type RunType } from "./run-types";
import {
  continuousStretches,
  hasBreaks,
  repSummary,
  runReading,
  unlappedMs,
  type RecordedLap,
  type RecordedRun,
} from "./run-segments";

const lap = (
  metres: number | null,
  seconds: number | null,
  phase: RecordedLap["phase"] = null,
): RecordedLap => ({
  phase,
  distanceMetres: metres,
  durationMs: seconds === null ? null : seconds * 1000,
});

const run = (
  runType: RunType | null,
  metres: number,
  seconds: number,
  laps: RecordedLap[] = [],
): RecordedRun => ({ runType, distanceMetres: metres, durationMs: seconds * 1000, laps });

const parts = (value: RecordedRun) => continuousStretches(value).map((stretch) => stretch.part);

describe("each kind of run, as it is run", () => {
  it("takes a session run in pieces as its reps, and every other kind as one effort", () => {
    const pieces: RunType[] = ["intervals", "hills", "sprints", "run_walk"];
    for (const type of RUN_TYPES)
      expect([type, hasBreaks(run(type, 5000, 1500))]).toEqual([type, pieces.includes(type)]);
    // Not said is read as steady, unless a lap says otherwise.
    expect(hasBreaks(run(null, 5000, 1500))).toBe(false);
    expect(hasBreaks(run(null, 2000, 720, [lap(1000, 240), lap(200, 120, "recovery")]))).toBe(true);
    // A tempo run done as cruise intervals had breaks in it too.
    expect(
      hasBreaks(run("tempo", 8000, 2400, [lap(3000, 720, "work"), lap(400, 180, "recovery")])),
    ).toBe(true);
  });
});

describe("a session run in pieces", () => {
  it("counts each rep alone and never the whole, with the recoveries recorded", () => {
    // 3 × 2 minutes of 500 m, with a 2-minute walk after each of the first two.
    const session = run("intervals", 1900, 600, [
      lap(500, 120, "work"),
      lap(200, 120, "recovery"),
      lap(500, 120, "work"),
      lap(200, 120, "recovery"),
      lap(500, 120, "work"),
    ]);
    expect(continuousStretches(session)).toEqual([
      { metres: 500, ms: 120_000, part: "rep 1 of 3", rep: true },
      { metres: 500, ms: 120_000, part: "rep 2 of 3", rep: true },
      { metres: 500, ms: 120_000, part: "rep 3 of 3", rep: true },
    ]);
  });

  it("never joins reps whose recoveries were not recorded", () => {
    // Only the reps were recorded: the total is their sum, 1.5 km in 6:00, which was never run
    // as one effort.
    const session = run("intervals", 1500, 360, [lap(500, 120), lap(500, 118), lap(500, 122)]);
    expect(parts(session)).toEqual(["rep 1 of 3", "rep 2 of 3", "rep 3 of 3"]);
  });

  it("has nothing to count without laps", () => {
    expect(continuousStretches(run("intervals", 8000, 2700))).toEqual([]);
    expect(continuousStretches(run("run_walk", 5000, 2400))).toEqual([]);
  });

  it("leaves out warm-up, cool-down and recovery, and a rep with no distance", () => {
    const session = run("hills", 4000, 1800, [
      lap(1500, 600, "warmup"),
      lap(200, 60, "work"),
      lap(200, null, "recovery"),
      lap(null, 58, "work"),
      lap(1500, 600, "cooldown"),
    ]);
    expect(parts(session)).toEqual(["rep 1 of 2"]);
  });

  it("says what the reps came to", () => {
    const session = run("intervals", 1500, 360, [lap(500, 120), lap(500, 118), lap(500, 122)]);
    expect(repSummary(session)).toEqual({
      reps: 3,
      averageSeconds: 120,
      averagePaceSecondsPerKm: 240,
    });
    expect(repSummary(run("easy", 5000, 1800))).toBeNull();
  });
});

describe("a steady run", () => {
  it("is one effort whole, and so is every block of laps run back to back", () => {
    const steady = run("easy", 3000, 900, [lap(1000, 300), lap(1000, 290), lap(1000, 310)]);
    expect(parts(steady)).toEqual(["whole run", "lap 1", "laps 1–2", "lap 2", "laps 2–3", "lap 3"]);
    expect(continuousStretches(steady)[4]).toEqual({
      metres: 2000,
      ms: 600_000,
      part: "laps 2–3",
      rep: false,
    });
  });

  it("allows a watch's rounding of each lap", () => {
    const steady = run("long", 3000, 902, [lap(1000, 300), lap(1000, 300), lap(1000, 300)]);
    expect(unlappedMs(steady)).toBe(0);
    expect(parts(steady)).toContain("laps 1–2");
  });

  it("keeps the laps whole as their own effort when they differ from the totals", () => {
    // One 5,000 m lap of 20:00 under a total of 20:01: both were recorded, and both stand.
    const trial = run("time_trial", 5000, 1201, [lap(5000, 1200)]);
    expect(continuousStretches(trial)).toEqual([
      { metres: 5000, ms: 1_201_000, part: "whole run", rep: false },
      { metres: 5000, ms: 1_200_000, part: "lap 1", rep: false },
    ]);
    // Laps holding 10.0 km of a run the watch made 10.6 km: the laps are a 10K the total is not.
    const long = run("long", 10_600, 3000, [lap(5000, 1500), lap(5000, 1500)]);
    expect(parts(long)).toEqual(["whole run", "lap 1", "laps 1–2", "lap 2"]);
    // The same figures as the run are the whole run again, said once.
    expect(parts(run("easy", 2000, 600, [lap(1000, 300), lap(1000, 300)]))).toEqual([
      "whole run",
      "lap 1",
      "lap 2",
    ]);
  });

  it("keeps each lap's own time when the laps do not account for the run", () => {
    // A minute in the total that no lap holds: a stop that was not recorded. It slows no lap,
    // and no laps are joined across it, since nobody knows where it fell.
    const steady = run("easy", 3000, 960, [lap(1000, 300), lap(1000, 300), lap(1000, 300)]);
    expect(unlappedMs(steady)).toBe(60_000);
    expect(continuousStretches(steady)).toEqual([
      { metres: 3000, ms: 960_000, part: "whole run", rep: false },
      { metres: 1000, ms: 300_000, part: "lap 1", rep: false },
      { metres: 1000, ms: 300_000, part: "lap 2", rep: false },
      { metres: 1000, ms: 300_000, part: "lap 3", rep: false },
    ]);
  });

  it("joins no laps across one whose distance or time is unknown", () => {
    const untimed = run("easy", 3000, 900, [lap(1000, 300), lap(1000, null), lap(1000, 300)]);
    expect(unlappedMs(untimed)).toBeNull();
    expect(parts(untimed)).toEqual(["whole run", "lap 1", "lap 3"]);
    const unmeasured = run("easy", 3000, 900, [lap(1000, 300), lap(null, 300), lap(1000, 300)]);
    expect(parts(unmeasured)).toEqual(["whole run", "lap 1", "lap 3"]);
  });

  it("counts a fartlek whole, and its surges as laps", () => {
    const fartlek = run("fartlek", 2000, 600, [lap(1000, 270, "work"), lap(1000, 330)]);
    expect(parts(fartlek)).toEqual(["whole run", "lap 1", "lap 2"]);
  });
});

describe("a run as the coach reads it", () => {
  const stored = (metres: number | null, seconds: number | null, phase: RecordedLap["phase"]) => ({
    phase,
    distance: metres === null ? null : { value: metres, unit: "m" as const, metres },
    durationMs: seconds === null ? null : seconds * 1000,
    averageHeartRate: null,
    maxHeartRate: null,
  });

  it("gives a session's kind, reps and laps, and no pace for the whole", () => {
    const reading = runReading(
      {
        distanceMeters: 1200,
        // A minute more than the laps hold: a stop nobody lapped.
        durationSeconds: 460,
        runType: "intervals",
        laps: [stored(500, 120, "work"), stored(200, 160, "recovery"), stored(500, 118, "work")],
      },
      "laps",
    );
    expect(reading).toMatchObject({
      runType: "intervals",
      hadBreaks: true,
      wholeRunPace: false,
      reps: { reps: 2, averageSeconds: 119, averagePaceSecondsPerKm: 238 },
      unlappedSeconds: 62,
    });
    expect(reading.laps![0]).toEqual({
      lap: 1,
      phase: "work",
      distanceMeters: 500,
      durationSeconds: 120,
      paceSecondsPerKm: 240,
      averageHeartRate: null,
      maxHeartRate: null,
    });
  });

  it("says a steady run's pace is a pace, and leaves the laps out of a summary", () => {
    const reading = runReading(
      { distanceMeters: 5000, durationSeconds: 1500, runType: "easy", laps: [] },
      "summary",
    );
    expect(reading).toEqual({ runType: "easy", hadBreaks: false, wholeRunPace: true, reps: null });
  });
});
