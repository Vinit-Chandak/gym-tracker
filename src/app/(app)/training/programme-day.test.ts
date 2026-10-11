import { describe, expect, it } from "vitest";

import type { ProgramDayPlan, ScheduleDay } from "@/server/repositories/schedule";

import { dayStateWord, logSports, programmeDayParts, runLeads } from "./programme-day";

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
