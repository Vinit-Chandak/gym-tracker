import { describe, expect, it } from "vitest";

import type { ProgramDayPlan, ScheduleDay } from "@/server/repositories/schedule";

import {
  atGymLines,
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

  it("reads the focus when the name does not say, and runs first when neither does", () => {
    expect(runLeads({ name: "Day 4", focus: "Upper body, then an easy run" })).toBe(false);
    expect(runLeads({ name: "Day 4", focus: "Jog then press" })).toBe(true);
    expect(runLeads({ name: "Hybrid", focus: null })).toBe(true);
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
      ["ohp", "At Planet Fitness: not available, and no fallback fits"],
    ]);
  });
});
