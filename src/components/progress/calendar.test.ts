import { describe, expect, it } from "vitest";

import type { PrintedExercise, PrintedSession } from "@/domain/session-print";

import {
  dayParts,
  dayPrintLabel,
  monthDays,
  monthEnd,
  monthsBetween,
  saidOf,
  tally,
  tallyDistance,
  tallyName,
  type DayActivity,
} from "./calendar";

const activity = (patch: Partial<DayActivity>): DayActivity => ({
  sport: "strength",
  occurredOn: "2026-09-04",
  durationMs: null,
  distanceMetres: null,
  environment: null,
  ...patch,
});

describe("a day, read out", () => {
  it("says each activity as the calendar names it", () => {
    expect(saidOf(activity({ durationMs: 42 * 60_000 }))).toBe("lifting 42 min");
    expect(
      saidOf(activity({ sport: "running", distanceMetres: 3000, environment: "treadmill" })),
    ).toBe("run 3 km indoors");
    expect(saidOf(activity({ sport: "cycling", distanceMetres: 25_000 }))).toBe("ride 25 km");
    expect(saidOf(activity({ sport: "cycling", durationMs: 30 * 60_000 }))).toBe("ride 30 min");
    expect(saidOf(activity({ sport: "swimming", distanceMetres: 1500 }))).toBe("swim 1,500 m");
  });
});

describe("the month", () => {
  // Fri 4 Sept (the audit's September): a run, then a lift.
  const september = [
    activity({ sport: "running", distanceMetres: 3100 }),
    activity({ durationMs: 48 * 60_000 }),
    activity({ occurredOn: "2026-09-25", sport: "swimming", distanceMetres: 1500 }),
    activity({ occurredOn: "2026-08-31" }),
  ];

  it("puts each day's marks in its cell, in the order they were done", () => {
    const days = monthDays(september, "2026-09");
    expect(Object.keys(days)).toEqual(["4", "25"]);
    expect(days[4]).toEqual([
      { sport: "run", said: "run 3.1 km" },
      { sport: "strength", said: "lifting 48 min" },
    ]);
  });

  it("draws the workout still open on its day, and counts it once it is finished", () => {
    const open = activity({ occurredOn: "2026-09-25", inProgress: true });
    // Marked as under way, so it does not look like one of the sessions the month counts.
    expect(monthDays([...september, open], "2026-09")[25]).toEqual([
      { sport: "swim", said: "swim 1,500 m" },
      { sport: "strength", said: "lifting in progress", open: true },
    ]);
    expect(tally([...september.slice(0, 3), open])).toEqual(tally(september.slice(0, 3)));
  });

  it("counts each sport, its distance and its time, in the legend's order", () => {
    expect(tally(september.slice(0, 3))).toEqual([
      { sport: "strength", count: 1, metres: null, ms: 48 * 60_000 },
      { sport: "running", count: 1, metres: 3100, ms: null },
      { sport: "swimming", count: 1, metres: 1500, ms: null },
    ]);
    // What was recorded adds up; an activity without a time adds none, rather than zero.
    expect(
      tally([
        activity({ sport: "running", durationMs: 26 * 60_000 }),
        activity({ sport: "running", durationMs: null }),
      ])[0]?.ms,
    ).toBe(26 * 60_000);
    expect(tallyName("running", 8)).toBe("Runs");
    expect(tallyName("cycling", 1)).toBe("Ride");
    expect(tallyDistance(30_800)).toBe("30.8 km");
  });

  it("walks the months between two dates", () => {
    expect(monthsBetween("2025-11-20", "2026-02-03")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2026-09")).toBe("2026-09-30");
  });
});

/** A workout as its print reads it: its warm-up, and each exercise's plan and sets. */
const workout = ({
  exercises,
  ...patch
}: Partial<Omit<PrintedSession, "exercises">> & {
  exercises: Partial<PrintedExercise>[];
}): PrintedSession => ({
  drills: 0,
  warmupCompleted: false,
  completed: true,
  ...patch,
  exercises: exercises.map((exercise) => ({
    slotId: null,
    exerciseId: "x",
    planned: null,
    work: 0,
    warm: 0,
    skipped: false,
    supersetGroup: null,
    ...exercise,
  })),
});

describe("a day's print", () => {
  it("draws what was done in the day's order, two workouts as one block", () => {
    // Fri 25 Sept (Day board): a run, a swim, then the lift.
    const parts = dayParts([
      { sport: "running" },
      { sport: "swimming" },
      { sport: "strength", session: workout({ exercises: [{ work: 2, warm: 1 }] }) },
      { sport: "strength", session: workout({ exercises: [{ work: 2 }] }) },
    ]);
    expect(parts).toEqual([
      { kind: "run", state: "done" },
      { kind: "swim", state: "done" },
      {
        kind: "strength",
        columns: [
          { sets: 3, done: 3, warm: 1, pair: false },
          { sets: 2, done: 2, warm: 0, pair: false },
        ],
      },
    ]);
  });

  it("leads a workout with its warm-up's fan, as the workout's own page does", () => {
    // Sat 10 Oct, Legs A: the warm-up done, the hip thrust with three warm-ups at its foot.
    const legs = workout({
      drills: 6,
      warmupCompleted: true,
      exercises: [{ work: 4, warm: 3 }, { work: 3 }],
    });
    expect(dayParts([{ sport: "running" }, { sport: "strength", session: legs }])).toEqual([
      { kind: "run", state: "done" },
      { kind: "mobility", segments: 6, segmentsDone: 6, state: "done", modules: 3 },
      {
        kind: "strength",
        columns: [
          { sets: 7, done: 7, warm: 3, pair: false },
          { sets: 3, done: 3, warm: 0, pair: false },
        ],
      },
    ]);
    // A second workout's fan stands with the first's, before the one block of columns.
    const second = workout({ drills: 4, exercises: [{ work: 2 }] });
    expect(
      dayParts([
        { sport: "strength", session: legs },
        { sport: "strength", session: second },
      ]).map((part) => part.kind),
    ).toEqual(["mobility", "mobility", "strength"]);
  });

  it("draws the workout still open as the plan it is inking, as the workout does", () => {
    // Sun 11 Oct, Squat day: four squats in (three warm-ups not drawn), three exercises owed.
    const squat = workout({
      drills: 6,
      completed: false,
      exercises: [{ planned: 4, work: 4, warm: 3 }, { planned: 4 }, { planned: 2 }, { planned: 3 }],
    });
    expect(dayParts([{ sport: "strength", session: squat }])).toEqual([
      { kind: "mobility", segments: 6, segmentsDone: 0, state: "todo", modules: 3 },
      {
        kind: "strength",
        columns: [
          { sets: 4, done: 4, skipped: false, pair: false },
          { sets: 4, done: 0, skipped: false, pair: false },
          { sets: 2, done: 0, skipped: false, pair: false },
          { sets: 3, done: 0, skipped: false, pair: false },
        ],
      },
    ]);
  });

  it("says what it holds in the day's order, telling one name from the next", () => {
    expect(
      dayPrintLabel("Mon 12 Oct 2026", [
        "Hotel gym push day: dumbbell bench, overhead press and dips",
        "Run",
      ]),
    ).toBe(
      "Mon 12 Oct 2026 in full ink, in the day's order: Hotel gym push day: dumbbell bench, " +
        "overhead press and dips, then Run",
    );
    expect(dayPrintLabel("Mon 12 Oct 2026", ["Lower A"])).toBe(
      "Mon 12 Oct 2026 in full ink, in the day's order: Lower A",
    );
    // A workout still open is not in full ink.
    expect(dayPrintLabel("Sun 11 Oct", ["Squat day"], true)).toBe(
      "Sun 11 Oct with a workout in progress, in the day's order: Squat day",
    );
  });
});

it("says a month's distances in the athlete's units where they are known", () => {
  const units = {
    running: { distanceUnit: "mi", poolUnit: "yd" },
    swimming: { distanceUnit: "mi", poolUnit: "yd" },
  } as const;
  expect(tallyDistance(8046.72, "running", units)).toBe("5\u00a0mi");
  expect(tallyDistance(8046.72)).toBe("8 km");
  expect(
    saidOf(
      {
        sport: "swimming",
        occurredOn: "2026-09-25",
        durationMs: null,
        distanceMetres: 914.4,
        environment: "pool",
      },
      units,
    ),
  ).toBe("swim 1,000\u00a0yd");
});
