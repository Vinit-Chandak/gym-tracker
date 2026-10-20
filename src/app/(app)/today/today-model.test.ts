import { describe, expect, it } from "vitest";

import type { StoredPlanExercise } from "@/domain/session-plan";
import { FACT_SEPARATOR } from "@/lib/facts";
import type { PlannedExercisePreview } from "@/server/repositories/schedule";

import { groupRows, planRows, rowPrescription } from "./today-model";

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

  it("lead a machine the coach named with its glyph when its type has one of its own", () => {
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
    const ROW = slot({ programExerciseId: "e7", name: "Rowing machine", modality: "cardio" });
    const rows = planRows(
      [EXTENSION, ROLLOUT, PUSHDOWN, ROW],
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
          entry({
            slotId: "e7",
            exerciseName: "Rowing machine",
            equipmentInstanceId: "rower",
            equipmentInstanceName: "Concept2 rower",
          }),
        ],
        machines: {
          bench: { typeSlug: "back_extension_bench", typeCategory: "accessory" },
          wheel: { typeSlug: "ab_wheel", typeCategory: "accessory" },
          cable: { typeSlug: "cable_station", typeCategory: "cable" },
          rower: { typeSlug: "rowing_machine", typeCategory: "cardio" },
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
      // A cardio machine is drawn as itself, never as the weight stack its movement was.
      ["rower", "Concept2 rower"],
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
