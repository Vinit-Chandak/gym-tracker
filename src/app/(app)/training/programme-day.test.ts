import { describe, expect, it } from "vitest";

import type { PrintedSession } from "@/domain/session-print";
import type { ProgramDayPlan, ScheduleDay } from "@/server/repositories/schedule";

import {
  atGymLines,
  dayOrder,
  dayPageMaxModule,
  dayPrintLabel,
  dayStateWord,
  logSports,
  programmeDayParts,
  REST_PAGE_MODULE,
  runLeads,
} from "./programme-day";

const day = (overrides: Partial<ScheduleDay>): ScheduleDay => ({
  id: "day-1",
  dayOfWeek: 1,
  dayIndex: 1,
  name: "Lower",
  focus: null,
  includesLifting: true,
  includesRun: false,
  timeNote: null,
  effortNote: null,
  notes: null,
  warmupProtocolId: null,
  ...overrides,
});

const plan = (
  overrides: Partial<ScheduleDay>,
): Pick<ProgramDayPlan, "day" | "exercises" | "status"> => ({
  day: day(overrides),
  exercises: [
    {
      programExerciseId: "pe-1",
      exerciseId: "e-1",
      name: "Back squat",
      modality: null,
      sets: 3,
      prescriptionType: "reps",
      repMin: 5,
      repMax: 8,
      durationMinSeconds: null,
      durationMaxSeconds: null,
      distanceMinMeters: null,
      distanceMaxMeters: null,
      perSide: false,
      rirMin: 1,
      rirMax: 2,
      supersetGroup: null,
    },
  ],
  status: "pending",
});

describe("the day being trained", () => {
  it("inks its open workout's sets and warm-up, as the workout's own print does", () => {
    // Sun 11 Oct, Squat day (kenji): four squats logged, the warm-up still to mark done.
    const squat = {
      ...plan({ name: "Squat day" }),
      run: null,
      exercises: [
        { ...plan({}).exercises[0]!, sets: 4 },
        { ...plan({}).exercises[0]!, programExerciseId: "pe-2", exerciseId: "e-2", sets: 4 },
      ],
    };
    const session = (warmupCompleted: boolean): PrintedSession => ({
      drills: 6,
      warmupCompleted,
      completed: false,
      exercises: [
        {
          slotId: "pe-1",
          exerciseId: "e-1",
          planned: 4,
          work: 4,
          warm: 3,
          skipped: false,
          supersetGroup: null,
        },
      ],
    });
    const parts = programmeDayParts(squat, { drills: 6, warmup: true, session: session(false) });
    expect(parts).toEqual([
      { kind: "mobility", segments: 6, segmentsDone: 0, state: "todo", modules: 3 },
      {
        kind: "strength",
        columns: [
          { sets: 4, done: 4, skipped: false, pair: false },
          { sets: 4, done: 0, skipped: false, pair: false },
        ],
      },
    ]);
    expect(dayPrintLabel(squat, parts, 6)).toBe(
      "Squat day: the warm-up, 2 exercises, the sets done inked",
    );
    // Marked done in the workout, the fan is full here too.
    expect(
      programmeDayParts(squat, { drills: 6, warmup: true, session: session(true) })[0],
    ).toEqual({ kind: "mobility", segments: 6, segmentsDone: 6, state: "done", modules: 3 });
    // Training's tile draws no warm-up for a lifting day, open or not.
    expect(
      programmeDayParts(squat, { drills: 6, session: session(true) }).map((p) => p.kind),
    ).toEqual(["strength"]);
    // The warm-up marked done and no set yet: the label says the warm-up, never the sets.
    const warmedUp = programmeDayParts(squat, {
      drills: 6,
      warmup: true,
      session: { ...session(true), exercises: [] },
    });
    expect(dayPrintLabel(squat, warmedUp, 6)).toBe(
      "Squat day: the warm-up, 2 exercises, the warm-up done",
    );
  });

  it("draws a day done once and being done again from the workout under way", () => {
    // "Do again" on Pull A, done this cycle: the next cycle's workout is open for it, one set in.
    const pull = { ...plan({ name: "Pull A" }), run: null, status: "completed" as const };
    const open: PrintedSession = {
      drills: 4,
      warmupCompleted: false,
      completed: false,
      exercises: [
        {
          slotId: "pe-1",
          exerciseId: "e-1",
          planned: 3,
          work: 1,
          warm: 0,
          skipped: false,
          supersetGroup: null,
        },
      ],
    };
    const parts = programmeDayParts(pull, { drills: 4, warmup: true, session: open });
    expect(parts).toEqual([
      { kind: "mobility", segments: 4, segmentsDone: 0, state: "todo", modules: 3 },
      { kind: "strength", columns: [{ sets: 3, done: 1, skipped: false, pair: false }] },
    ]);
    // Said as the workout under way, not as the day done.
    expect(dayPrintLabel(pull, parts, 4, true)).toBe(
      "Pull A: the warm-up, 1 exercise, the sets done inked",
    );
  });
});

describe("a day its workout has done", () => {
  // Lower volume (jordan, Fri 2 Oct): the squat done, warm-ups first, the leg press skipped.
  const lower = {
    ...plan({ name: "Lower volume" }),
    run: null,
    status: "completed" as const,
    exercises: [
      plan({}).exercises[0]!,
      { ...plan({}).exercises[0]!, programExerciseId: "pe-2", exerciseId: "e-2", sets: 4 },
    ],
  };
  const finished = (warmupCompleted: boolean): PrintedSession => ({
    drills: 4,
    warmupCompleted,
    completed: true,
    exercises: [
      {
        slotId: "pe-1",
        exerciseId: "e-1",
        planned: 3,
        work: 3,
        warm: 2,
        skipped: false,
        supersetGroup: null,
      },
      {
        slotId: "pe-2",
        exerciseId: "e-2",
        planned: 4,
        work: 0,
        warm: 0,
        skipped: true,
        supersetGroup: null,
      },
    ],
  });

  it("is drawn as the workout's record, not every set inked", () => {
    const parts = programmeDayParts(lower, {
      drills: 4,
      warmup: true,
      session: finished(false),
    });
    // As its own page and its day draw it: the fan dashed, the squats done, the leg press
    // dashed at the size the plan asks for. A plan's print, it leaves out the warm-up sets the
    // record greys, so Training's tiles keep the module their plans need.
    expect(parts).toEqual([
      { kind: "mobility", segments: 4, segmentsDone: 0, state: "skipped", modules: 3 },
      {
        kind: "strength",
        columns: [
          { sets: 3, done: 3, pair: false },
          { sets: 4, done: 0, skipped: true, pair: false },
        ],
      },
    ]);
    expect(dayPrintLabel(lower, parts, 4)).toBe(
      "Lower volume: the warm-up, 2 exercises, done, the warm-up not done, dashed, 1 exercise not done, dashed",
    );
    // Its warm-up done, the fan is full.
    expect(
      programmeDayParts(lower, { drills: 4, warmup: true, session: finished(true) })[0],
    ).toMatchObject({ state: "done", segmentsDone: 4 });
    // A done day with no workout to read (one done before prints were read) is all ink.
    expect(programmeDayParts(lower)).toEqual([
      {
        kind: "strength",
        columns: [
          { sets: 3, done: 3, skipped: false, pair: false },
          { sets: 4, done: 4, skipped: false, pair: false },
        ],
      },
    ]);
  });
});

describe("a day that lifts and runs, in the order it is written", () => {
  it("says its print in that order, for a screen reader", () => {
    const run = { durationMinutes: 20 } as unknown as ProgramDayPlan["run"];
    const meera = { name: "Lower + easy run", focus: "Squat + hinge, then 20 min easy" };
    const lifted = { ...plan({ ...meera, includesRun: true }), run };
    expect(dayPrintLabel(lifted, programmeDayParts(lifted), 4)).toBe(
      "Lower + easy run: the warm-up, 1 exercise, the run",
    );
    const easy = { ...plan({ name: "Easy Run + Arms", includesRun: true }), run };
    expect(dayPrintLabel(easy, programmeDayParts(easy), 0)).toBe(
      "Easy Run + Arms: the run, 1 exercise",
    );
  });

  it("runs first when the run is named first", () => {
    expect(runLeads({ name: "Easy Run + Arms", focus: "Aerobic + arms/forearms" })).toBe(true);
    expect(
      programmeDayParts(plan({ name: "Easy Run + Arms", includesRun: true })).map((p) => p.kind),
    ).toEqual(["run", "strength"]);
  });

  it("lifts first when the run is named after the lifting", () => {
    // Meera's day in the year audit: the page listed the run first.
    const meera = { name: "Lower + easy run", focus: "Squat + hinge, then 20 min easy" };
    expect(runLeads(meera)).toBe(false);
    expect(programmeDayParts(plan({ ...meera, includesRun: true })).map((p) => p.kind)).toEqual([
      "strength",
      "run",
    ]);
  });

  it("keeps the lifting's warm-up with the lifting, wherever the run stands", () => {
    expect(dayOrder({ name: "Easy Run + Arms", focus: null, includesLifting: true })).toEqual([
      "run",
      "warm-up",
      "lifting",
    ]);
    expect(dayOrder({ name: "Lower + easy run", focus: null, includesLifting: true })).toEqual([
      "warm-up",
      "lifting",
      "run",
    ]);
    const easy = plan({ name: "Easy Run + Arms", includesRun: true });
    expect(programmeDayParts(easy, { drills: 5, warmup: true }).map((p) => p.kind)).toEqual([
      "run",
      "mobility",
      "strength",
    ]);
  });

  it("reads the focus when the name does not say, and runs first when neither does", () => {
    expect(runLeads({ name: "Day 4", focus: "Upper body, then an easy run" })).toBe(false);
    expect(runLeads({ name: "Day 4", focus: "Jog then press" })).toBe(true);
    expect(runLeads({ name: "Hybrid", focus: null })).toBe(true);
  });
});

describe("a day that only runs", () => {
  // Liam's Easy run in the year audit: its page and its tile drew the runner, then the fan of
  // its "Run warm-up", and listed the warm-up after the run, as if a cool-down.
  const easy = (status: ProgramDayPlan["status"] = "pending") => ({
    ...plan({ name: "Easy run", focus: "Zone 2", includesLifting: false, includesRun: true }),
    exercises: [],
    status,
  });
  const run = { durationMinMinutes: 40 } as unknown as ProgramDayPlan["run"];

  it("warms up before it runs, on its page and on Training's tile", () => {
    expect(dayOrder(easy().day)).toEqual(["warm-up", "run", "lifting"]);
    expect(programmeDayParts(easy(), { drills: 5, warmup: true }).map((p) => p.kind)).toEqual([
      "mobility",
      "run",
    ]);
    // Training's tiles draw a day's fan only where it is not a lifting day's.
    expect(programmeDayParts(easy(), { drills: 5 })).toEqual([
      { kind: "mobility", segments: 5, segmentsDone: 0, state: "todo", modules: 3 },
      { kind: "run", state: "todo" },
    ]);
  });

  it("says its warm-up before its run, and as a warm-up rather than a rest day's routine", () => {
    const day = { ...easy(), run };
    expect(dayPrintLabel(day, programmeDayParts(day, { drills: 5, warmup: true }), 5)).toBe(
      "Easy run: the warm-up, the run",
    );
    const done = { ...easy("completed"), run };
    expect(dayPrintLabel(done, programmeDayParts(done, { drills: 5, warmup: true }), 5)).toBe(
      "Easy run: the warm-up, the run, done",
    );
  });
});

describe("a rest day", () => {
  const rest = (status: ProgramDayPlan["status"] = "pending") => ({
    ...plan({ name: "Rest", includesLifting: false }),
    exercises: [],
    status,
  });

  it("prints as rest, in its state, so its tile is never blank paper", () => {
    expect(programmeDayParts(rest())).toEqual([{ kind: "rest", state: "todo" }]);
    expect(programmeDayParts(rest("completed"))).toEqual([{ kind: "rest", state: "done" }]);
  });

  it("stands quiet on its own page, and says itself as rest", () => {
    // The crescent alone filled its band, the largest thing on the page.
    expect(dayPageMaxModule(programmeDayParts(rest()))).toBe(REST_PAGE_MODULE);
    expect(dayPageMaxModule(programmeDayParts(plan({})))).toBeUndefined();
    expect(dayPageMaxModule(programmeDayParts(rest(), { drills: 5 }))).toBeUndefined();
    const day = { ...rest(), run: null };
    expect(dayPrintLabel(day, programmeDayParts(day), 0)).toBe("Rest: nothing to train");
    const done = { ...rest("completed"), run: null };
    expect(dayPrintLabel(done, programmeDayParts(done), 0)).toBe("Rest: nothing to train, done");
    const routine = { ...rest(), run: null };
    expect(dayPrintLabel(routine, programmeDayParts(routine, { drills: 5 }), 5)).toBe(
      "Rest: the routine",
    );
  });

  it("prints its routine instead, when it has one, and a day that trains never as rest", () => {
    expect(programmeDayParts(rest(), { drills: 5 }).map((p) => p.kind)).toEqual(["mobility"]);
    expect(programmeDayParts({ ...plan({}), exercises: [] })).toEqual([]);
    expect(
      programmeDayParts({ ...plan({ includesLifting: false, includesRun: true }), exercises: [] }),
    ).toEqual([{ kind: "run", state: "todo" }]);
  });
});

it("says a day whose workout is open is in progress, before it is next", () => {
  expect(dayStateWord({ isNext: true, status: "pending" }, true)).toBe("in progress");
  expect(dayStateWord({ isNext: true, status: "pending" })).toBe("next");
  expect(dayStateWord({ isNext: false, status: "completed" })).toBe("done");
});

describe("the sports Training offers to log", () => {
  const sports = ["running", "cycling", "swimming"] as const;

  it("are the ones switched on, which is the tidying the Sports screen promises", () => {
    expect(logSports(sports, ["strength"], [])).toEqual([]);
    expect(logSports(sports, ["strength", "swimming", "running"], [])).toEqual([
      "running",
      "swimming",
    ]);
  });

  it("keep running while the programme has a day that runs", () => {
    const days = [{ day: day({ includesRun: true }) }];
    expect(logSports(sports, ["strength"], days)).toEqual(["running"]);
  });
});

describe("a day's exercises at the default gym", () => {
  const exercise = { id: "bench", modality: "barbell", requiresEquipment: true } as const;
  const resolved = (
    programExerciseId: string,
    resolution: Record<string, unknown>,
    resolvedExerciseName = "Barbell bench press",
  ) =>
    ({
      programExerciseId,
      decision: { resolution: { exercise, ...resolution }, resolvedExerciseName },
    }) as unknown as Parameters<typeof atGymLines>[0][number];

  it("says the fallback the gym will use, and nothing where the exercise is itself", () => {
    // Jordan's Upper heavy at Planet Fitness, which has no barbell (year audit).
    const lines = atGymLines(
      [
        resolved(
          "bench",
          {
            status: "fallback",
            equipmentInstance: { id: "smith", name: "Smith machine" },
          },
          "Smith machine bench press",
        ),
        resolved(
          "row",
          {
            status: "fallback",
            equipmentInstance: { id: "csr", name: "Chest-supported row machine" },
          },
          "Chest-supported row (machine)",
        ),
        resolved("pulldown", { status: "direct", equipmentInstance: null }, "Lat pulldown"),
        resolved("ohp", { status: "unavailable" }, "Standing overhead press"),
      ],
      "Planet Fitness",
    );
    expect([...lines]).toEqual([
      ["bench", "At Planet Fitness: Smith machine bench press"],
      ["row", "At Planet Fitness: Chest-supported row (machine)"],
      ["ohp", "Not at Planet Fitness ·\u00a0no fallback"],
    ]);
  });
});
