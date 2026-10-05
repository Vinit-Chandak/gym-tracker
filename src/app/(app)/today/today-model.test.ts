import { describe, expect, it } from "vitest";

import type { StoredPlanExercise } from "@/domain/session-plan";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { PlannedExercisePreview, TodayPlan } from "@/server/repositories/schedule";

import {
  cycleCells,
  cycleLabel,
  groupRows,
  planRows,
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
    program: { weeks: 8 },
    behind: 0,
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
    expect(cycleLabel(week)).toBe("Cycle 1 of 8, day 3 of 3, 25 days behind. Open the programme");
  });
});

describe("a row's prescription", () => {
  it("writes RIR for sets counted in reps, and the work alone for a carry", () => {
    expect(rowPrescription(CURL)).toBe("3 × 8–12 @ 1–2 RIR");
    expect(rowPrescription(CARRY)).toBe("3 × 20–40 m");
  });
});

describe("the day's rows", () => {
  it("keep the programme's order and word when there is no coach", () => {
    const rows = planRows([CURL, PUSHDOWN, CARRY, WRIST], null, "kg");
    expect(rows.map((row) => [row.name, row.glyph, row.line])).toEqual([
      ["Barbell curl", "dumbbell", "3 × 8–12 @ 1–2 RIR"],
      ["Rope triceps pushdown", "cable", "3 × 12–15 @ 1 RIR"],
      ["Farmer’s carry", "dumbbell", "3 × 20–40 m"],
      ["Wrist curl", "dumbbell", "2 × 12–20 @ 1 RIR"],
    ]);
    expect(groupRows(rows).map((group) => group.length)).toEqual([1, 1, 2]);
  });

  it("say the coach's targets, its note, and a drop in its place", () => {
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
    );
    expect(rows[0]).toMatchObject({
      line: "30 kg · 3 × 10 @ 2, 2, 1 RIR",
      note: "Add 2.5 kg after clean sets.",
      dropped: false,
      sets: 3,
    });
    expect(rows[1]).toMatchObject({ name: "Rope triceps pushdown", dropped: true, note: "Elbow." });
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
      programme: [run],
      rows: planRows([CURL, PUSHDOWN, CARRY, WRIST], null, "kg"),
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
});
