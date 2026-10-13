import { describe, expect, it } from "vitest";

import type { StoredPlanExercise } from "@/domain/session-plan";
import type { PrintedExercise, PrintedSession } from "@/domain/session-print";
import { FACT_SEPARATOR } from "@/lib/facts";
import type { LoggedActivity } from "@/server/repositories/activity-analytics";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { PlannedExercisePreview, TodayPlan } from "@/server/repositories/schedule";

import {
  cycleCells,
  cycleLabel,
  groupRows,
  loggedBesides,
  planRows,
  printLabel,
  rowPrescription,
  todayParts,
} from "./today-model";

// Easy Run + Arms (src/app/(preview)/preview/page.tsx): the day the boards draw.
const slot = (patch: Partial<PlannedExercisePreview>): PlannedExercisePreview => ({
  programExerciseId: "e1",
  exerciseId: "x1",
  name: "Barbell curl",
  modality: "barbell",
  sets: 3,
  prescriptionType: "reps",
  repMin: 8,
  repMax: 12,
  durationMinSeconds: null,
  durationMaxSeconds: null,
  distanceMinMeters: null,
  distanceMaxMeters: null,
  perSide: false,
  rirMin: 1,
  rirMax: 2,
  supersetGroup: null,
  ...patch,
});

const CURL = slot({});

/** The days the band is drawn for: one that runs first, one that lifts first. */
const EASY_RUN_ARMS = {
  name: "Easy Run + Arms",
  focus: "Aerobic + arms/forearms",
  includesLifting: true,
};
const LOWER_EASY_RUN = {
  name: "Lower + easy run",
  focus: "Squat + hinge, then 20 min easy",
  includesLifting: true,
};
const PUSHDOWN = slot({
  programExerciseId: "e2",
  name: "Rope triceps pushdown",
  modality: "cable",
  repMin: 12,
  repMax: 15,
  rirMin: 1,
  rirMax: 1,
});
const CARRY = slot({
  programExerciseId: "e3",
  name: "Farmer’s carry",
  modality: "dumbbell",
  prescriptionType: "distance",
  repMin: null,
  repMax: null,
  distanceMinMeters: 20,
  distanceMaxMeters: 40,
  supersetGroup: "forearms",
});
const WRIST = slot({
  programExerciseId: "e4",
  name: "Wrist curl",
  modality: "dumbbell",
  sets: 2,
  repMin: 12,
  repMax: 20,
  rirMin: 1,
  rirMax: 1,
  supersetGroup: "forearms",
});

/** The fields the squares read; the rest of a plan does not reach them. */
function plan(statuses: readonly ("completed" | "skipped" | "pending")[], offered: number) {
  return {
    program: { weeks: 8, cycles: 8 },
    behind: 0,
    missed: [],
    pickUpDay: null,
    suggestion: { slot: { cycleIndex: 1, dayIndex: offered } },
    suggestedDay: { dayIndex: offered },
    cycleDays: statuses.map((status, index) => ({ day: { dayIndex: index + 1 }, status })),
  } as unknown as TodayPlan;
}

describe("the cycle's squares", () => {
  it("inks the days done, dashes a skipped one and rings the day offered", () => {
    const week = plan(["completed", "skipped", "pending", "pending"], 3);
    expect(cycleCells(week)).toEqual(["done", "skipped", "today", "todo"]);
  });

  it("are read aloud with where the cycle stands, behind included", () => {
    const week = { ...plan(["completed", "completed", "pending"], 3), behind: 25 } as TodayPlan;
    expect(cycleLabel(week)).toBe(
      "Cycle 1 of 8, day 3 of 3, 25 sessions behind. Open the programme",
    );
  });
});

describe("a row's prescription", () => {
  it("writes RIR for sets counted in reps, and the work alone for a carry", () => {
    expect(rowPrescription(CURL, "m")).toBe("3 × 8–12 @ 1–2 RIR");
    expect(rowPrescription(CARRY, "m")).toBe("3 × 20–40 m");
    // An athlete reading yards (ADR 0055) reads the same carry in them; a curl is unchanged.
    expect(rowPrescription(CARRY, "yd")).toBe("3 × 22–44 yd");
    expect(rowPrescription(CURL, "yd")).toBe("3 × 8–12 @ 1–2 RIR");
  });
});

/** One exercise of a coach's plan as stored, the curl kept unless said otherwise. */
const entry = (patch: Partial<StoredPlanExercise>): StoredPlanExercise => ({
  slotId: "e1",
  action: "keep",
  exerciseSlug: "barbell-curl",
  exerciseId: "x1",
  exerciseName: "Barbell curl",
  equipmentInstanceId: null,
  equipmentInstanceName: null,
  slotLineageId: null,
  note: "",
  sets: [],
  restSeconds: null,
  supersetGroup: null,
  perSide: null,
  unit: "kg",
  ...patch,
});
const set = (weight: number, reps: number, rir: number) => ({
  setType: "working" as const,
  weight,
  reps,
  rir,
  durationSeconds: null,
  distanceMeters: null,
});

describe("the day's rows", () => {
  it("keep the programme's order and word when there is no coach", () => {
    const rows = planRows([CURL, PUSHDOWN, CARRY, WRIST], null, "kg", "m");
    expect(rows.map((row) => [row.name, row.glyph, row.line])).toEqual([
      ["Barbell curl", "dumbbell", "3 × 8–12 @ 1–2 RIR"],
      ["Rope triceps pushdown", "cable", "3 × 12–15 @ 1 RIR"],
      ["Farmer’s carry", "dumbbell", "3 × 20–40 m"],
      ["Wrist curl", "dumbbell", "2 × 12–20 @ 1 RIR"],
    ]);
    expect(groupRows(rows).map((group) => group.length)).toEqual([1, 1, 2]);
  });

  it("say the coach's targets, its note, and a drop in its place", () => {
    const rows = planRows(
      [CURL, PUSHDOWN],
      {
        exercises: [
          entry({
            note: "Add 2.5 kg after clean sets.",
            sets: [set(30, 10, 2), set(30, 10, 2), set(30, 10, 1)],
          }),
          entry({
            slotId: "e2",
            action: "drop",
            exerciseName: "Rope triceps pushdown",
            note: "Elbow.",
          }),
        ],
      },
      "kg",
      "m",
    );
    expect(rows[0]).toMatchObject({
      line: "30 kg ·\u00a03 × 10 @ 2, 2, 1 RIR",
      note: "Add 2.5 kg after clean sets.",
      dropped: false,
      sets: 3,
    });
    expect(rows[1]).toMatchObject({ name: "Rope triceps pushdown", dropped: true, note: "Elbow." });
  });

  it("lead a machine the coach named with its glyph when it is an accessory", () => {
    // Back extension on its bench read "3 × 15 · Back extension bench" behind the pull-up
    // bar's figure, while the workout's row drew the bench.
    const EXTENSION = slot({
      programExerciseId: "e5",
      name: "Back extension",
      modality: "bodyweight",
    });
    const ROLLOUT = slot({
      programExerciseId: "e6",
      name: "Ab wheel rollout",
      modality: "bodyweight",
    });
    const rows = planRows(
      [EXTENSION, ROLLOUT, PUSHDOWN],
      {
        exercises: [
          entry({
            slotId: "e5",
            exerciseName: "Back extension",
            equipmentInstanceId: "bench",
            equipmentInstanceName: "Back extension bench",
            sets: [set(0, 15, 2)],
          }),
          entry({
            slotId: "e6",
            exerciseName: "Ab wheel rollout",
            equipmentInstanceId: "wheel",
            equipmentInstanceName: "Ab wheel",
          }),
          entry({
            slotId: "e2",
            exerciseName: "Rope triceps pushdown",
            equipmentInstanceId: "cable",
            equipmentInstanceName: "Cable station",
          }),
        ],
        machines: {
          bench: { typeSlug: "back_extension_bench", typeCategory: "accessory" },
          wheel: { typeSlug: "ab_wheel", typeCategory: "accessory" },
          cable: { typeSlug: "cable_station", typeCategory: "cable" },
        },
      },
      "kg",
      "m",
    );
    const machine = (line: string) => line.slice(line.lastIndexOf(FACT_SEPARATOR) + 3);
    expect(rows.map((row) => [row.glyph, machine(row.line)])).toEqual([
      ["accessory", "Back extension bench"],
      ["abWheel", "Ab wheel"],
      // Any other machine is drawn by what loads the movement, as the workout draws it.
      ["cable", "Cable station"],
    ]);
    // A machine whose type was not read, and the programme's own rows, keep the movement's.
    expect(
      planRows(
        [EXTENSION],
        { exercises: [entry({ slotId: "e5", equipmentInstanceId: "x" })] },
        "kg",
        "m",
      )[0]?.glyph,
    ).toBe("bodyweight");
  });
});

describe("the day's print", () => {
  it("draws the programme's run first, then a column for each exercise, a superset closer", () => {
    const run = {
      sport: "running",
      disposition: "pending",
      resolution: { kind: "incomplete" },
      prescription: null,
    } as unknown as ScheduledOccurrence;
    const parts = todayParts({
      day: EASY_RUN_ARMS,
      programme: [run],
      rows: planRows([CURL, PUSHDOWN, CARRY, WRIST], null, "kg", "m"),
      standalone: [],
    });
    expect(parts.map((part) => part.kind)).toEqual(["run", "strength"]);
    const strength = parts[1];
    expect(strength?.kind === "strength" && strength.columns).toEqual([
      { sets: 3, done: 0, skipped: false, pair: false },
      { sets: 3, done: 0, skipped: false, pair: false },
      { sets: 3, done: 0, skipped: false, pair: true },
      { sets: 2, done: 0, skipped: false, pair: false },
    ]);
  });

  it("draws the run after the lifting on a day written to lift first, as its tile does", () => {
    // Meera's Lower + easy run: the band drew the runner first, where Training's tile, the day's
    // page and Today's own cards all put the lifting first.
    const run = {
      sport: "running",
      disposition: "pending",
      resolution: { kind: "incomplete" },
      prescription: null,
    } as unknown as ScheduledOccurrence;
    const ride = { ...run, sport: "cycling" } as ScheduledOccurrence;
    const parts = todayParts({
      day: LOWER_EASY_RUN,
      programme: [run],
      rows: planRows([CURL, PUSHDOWN], null, "kg", "m"),
      standalone: [ride],
    });
    // Anything else dated today still comes after the day.
    expect(parts.map((part) => part.kind)).toEqual(["strength", "run", "ride"]);
    expect(printLabel("Lower + easy run", parts)).toBe(
      "Lower + easy run: 2 exercises as columns of their sets, to do, then a run to do, then a ride to do.",
    );
    // A rest day's routine leads whatever else is dated on it.
    expect(
      todayParts({
        day: { name: "Rest", focus: null, includesLifting: false },
        programme: [],
        rows: [],
        standalone: [ride],
        restDrills: 5,
      }).map((part) => part.kind),
    ).toEqual(["mobility", "ride"]);
  });

  it("draws no run a revision withdrew, and a run history answered as done", () => {
    const run = (resolution: ScheduledOccurrence["resolution"]["kind"]) =>
      ({
        sport: "running",
        disposition: resolution === "incomplete" ? "pending" : resolution,
        resolution: { kind: resolution },
        prescription: null,
      }) as unknown as ScheduledOccurrence;
    const parts = todayParts({
      day: EASY_RUN_ARMS,
      programme: [run("cancelled"), run("legacy_completed")],
      rows: planRows([CURL], null, "kg", "m"),
      standalone: [],
    });
    // The withdrawn run has no card under the print, so the print does not owe it either.
    expect(parts).toEqual([
      { kind: "run", state: "done" },
      expect.objectContaining({ kind: "strength" }),
    ]);
    expect(printLabel("Easy Run + Arms", parts)).toBe(
      "Easy Run + Arms: a run done, then 1 exercise as columns of their sets, to do.",
    );
  });

  it("inks what the open workout has logged on each row's column, as its own print does", () => {
    // Easy Run + Arms under way: four curls (one past the plan, its warm-ups not drawn), one
    // pushdown, the carry skipped in the workout, the wrist curl still owed.
    const done = (patch: Partial<PrintedExercise>): PrintedExercise => ({
      slotId: "e1",
      exerciseId: "x1",
      planned: 3,
      work: 0,
      warm: 0,
      skipped: false,
      supersetGroup: null,
      ...patch,
    });
    const session: PrintedSession = {
      drills: 0,
      warmupCompleted: false,
      completed: false,
      exercises: [
        done({ work: 4, warm: 2 }),
        done({ slotId: "e2", work: 1 }),
        done({ slotId: "e3", skipped: true }),
        done({ slotId: "e4", planned: 2 }),
      ],
    };
    const parts = todayParts({
      day: EASY_RUN_ARMS,
      programme: [],
      rows: planRows([CURL, PUSHDOWN, CARRY, WRIST], null, "kg", "m"),
      standalone: [],
      session,
    });
    expect(parts).toEqual([
      {
        kind: "strength",
        columns: [
          { sets: 4, done: 4, skipped: false, pair: false },
          { sets: 3, done: 1, skipped: false, pair: false },
          { sets: 3, done: 0, skipped: true, pair: true },
          { sets: 2, done: 0, skipped: false, pair: false },
        ],
      },
    ]);
    // Begun, it is never said to be all to do.
    expect(printLabel("Upper A", parts)).toBe(
      "Upper A: 4 exercises as columns of their sets, the sets done inked.",
    );

    // A coach's added exercise is the workout's own of that movement that no slot claims.
    const added = entry({
      slotId: null,
      exerciseId: "x9",
      exerciseName: "Hammer curl",
      sets: [set(10, 10, 2), set(10, 10, 2), set(10, 10, 1)],
    });
    const coached = planRows([CURL], { exercises: [entry({}), added] }, "kg", "m");
    const columns = todayParts({
      day: EASY_RUN_ARMS,
      programme: [],
      rows: coached,
      standalone: [],
      session: {
        ...session,
        exercises: [done({ work: 2 }), done({ slotId: null, exerciseId: "x9", work: 3 })],
      },
    });
    expect(columns[0]?.kind === "strength" && columns[0].columns.map((c) => c.done)).toEqual([
      2, 3,
    ]);
  });

  it("draws the day's finished workout as its record while its run is still owed", () => {
    // Easy Run + Arms, its workout finished: three curls after a warm-up set, the pushdown
    // never done, the run still to come.
    const record: PrintedSession = {
      drills: 0,
      warmupCompleted: false,
      completed: true,
      exercises: [
        {
          slotId: "e1",
          exerciseId: "x1",
          planned: 3,
          work: 3,
          warm: 1,
          skipped: false,
          supersetGroup: null,
        },
      ],
    };
    const parts = todayParts({
      day: EASY_RUN_ARMS,
      programme: [],
      rows: planRows([CURL, PUSHDOWN], null, "kg", "m"),
      standalone: [],
      lifted: true,
      session: record,
    });
    // As its own page draws it, not every planned set inked: the curls done (a plan's print
    // draws no warm-up sets), the pushdown dashed.
    expect(parts).toEqual([
      {
        kind: "strength",
        columns: [
          { sets: 3, done: 3, pair: false },
          { sets: 3, done: 0, skipped: true, pair: false },
        ],
      },
    ]);
    expect(printLabel("Easy Run + Arms", parts)).toBe(
      "Easy Run + Arms: 2 exercises as columns of their sets, done.",
    );
  });

  it("says a rest day's print as rest, never as a session", () => {
    expect(printLabel("Rest", [{ kind: "rest", state: "done" }])).toBe("Rest: rest done.");
  });
});

describe("what was logged today besides the cards", () => {
  const logged = (patch: Partial<LoggedActivity>): LoggedActivity => ({
    id: "a1",
    sport: "cycling",
    startedAt: new Date("2026-10-11T08:48:00Z"),
    durationMs: 3_092_000,
    distanceMetres: null,
    environment: "indoor",
    occurrenceId: null,
    sessionId: null,
    programDayId: null,
    dayName: null,
    title: null,
    gymName: null,
    ...patch,
  });
  const answered = {
    id: "o1",
    sport: "running",
    resolution: { kind: "logged", activityId: "a2", outcome: "logged", occurredOn: "2026-10-11" },
  } as unknown as ScheduledOccurrence;

  it("keeps a ride nobody scheduled and an unplanned workout, which no card stands for", () => {
    // Sofia's rest day in the year audit: an indoor ride, and Today said only "Rest".
    const ride = logged({});
    const unplanned = logged({ id: "a3", sport: "strength", sessionId: "a3" });
    expect(loggedBesides([ride, unplanned], { occurrences: [], doneDayIds: [] })).toEqual([
      ride,
      unplanned,
    ]);
  });

  it("leaves out a run its session's card shows, and a workout its day's card shows", () => {
    const run = logged({ id: "a2", sport: "running", occurrenceId: "o1" });
    const workout = logged({ id: "a4", sport: "strength", sessionId: "a4", programDayId: "d1" });
    // Logged today against a session from a day long gone, which no card here shows.
    const late = logged({ id: "a5", sport: "running", occurrenceId: "o-old" });
    expect(
      loggedBesides([run, workout, late], { occurrences: [answered], doneDayIds: ["d1"] }),
    ).toEqual([late]);
  });
});
