import { describe, expect, it } from "vitest";

import {
  entryHeading,
  entrySize,
  equipmentFact,
  equipmentGlyph,
  figureColumn,
  headingText,
  logSize,
  operatorColumn,
  perSetLabel,
  prescriptionLabel,
  restText,
  rirTarget,
  rirTargetLabel,
  setNumber,
  supersetNext,
} from "./logger-model";
import type { RowState } from "./use-set-rows";
import type { ExerciseVM, SessionVM } from "./view-model";

const planned: NonNullable<ExerciseVM["planned"]> = {
  programExerciseId: "planned",
  plannedExerciseName: "Barbell bench press",
  sets: 4,
  prescriptionType: "reps",
  repMin: 3,
  repMax: 5,
  durationMinSeconds: null,
  durationMaxSeconds: null,
  distanceMinMeters: null,
  distanceMaxMeters: null,
  perSide: false,
  rirMin: 2,
  rirMax: 2,
  restMinSeconds: 180,
  restMaxSeconds: 240,
  targetLoadNote: null,
  progressionNotes: null,
  keyCue: null,
};

const exercise = (patch: Partial<ExerciseVM> = {}): ExerciseVM => ({
  id: "slot",
  orderIndex: 1,
  exercise: {
    id: "bench",
    name: "Barbell bench press",
    slug: "bench",
    modality: "barbell",
    loadPortability: "global",
    requiresEquipment: true,
    defaultPrescriptionType: "reps",
    rirNote: null,
  },
  equipment: null,
  planned,
  supersetGroup: null,
  substitutionReason: null,
  notes: null,
  completedAt: null,
  skippedAt: null,
  weightStep: 2.5,
  sets: [],
  previous: null,
  basis: null,
  suggestion: null,
  regressionStreak: 0,
  decision: null,
  coachNote: null,
  coachRestSeconds: null,
  ...patch,
});

const row = (setIndex: number, setType: RowState["setType"] = "working"): RowState => ({
  setIndex,
  setType,
  weight: "",
  reps: "",
  rir: "",
  rpe: "",
  duration: "",
  distance: "",
  touched: new Set(),
  logged: null,
  saving: false,
  error: null,
  dirty: false,
});

describe("what the header says", () => {
  it("gives the Log tab the range a set aims at, and the other tabs the whole prescription", () => {
    expect(perSetLabel(exercise())).toBe("3–5 reps");
    expect(prescriptionLabel(exercise())).toBe("4 × 3–5 @ 2 RIR");
    expect(restText(exercise())).toBe("3–4 min");
  });

  it("says a carry's range in metres and leaves RIR out of a prescription rated by RPE", () => {
    const carry = exercise({
      planned: {
        ...planned,
        sets: 3,
        prescriptionType: "distance",
        repMin: null,
        repMax: null,
        distanceMinMeters: 20,
        distanceMaxMeters: 40,
        restMinSeconds: 90,
        restMaxSeconds: 90,
      },
    });
    expect(perSetLabel(carry)).toBe("20–40 m");
    expect(prescriptionLabel(carry)).toBe("3 × 20–40 m");
    expect(restText(carry)).toBe("90 s");
  });

  it("says nothing it does not know: an exercise added on the spot has no range", () => {
    const adHoc = exercise({ planned: null });
    expect(perSetLabel(adHoc)).toBeNull();
    expect(prescriptionLabel(adHoc)).toBeNull();
    expect(restText(adHoc)).toBeNull();
  });

  it("names this gym's machine only where the exercise's name does not already", () => {
    const on = (name: string, equipment: string, modality: ExerciseVM["exercise"]["modality"]) =>
      equipmentFact(
        exercise({
          exercise: { ...exercise().exercise, name, modality },
          equipment: { name: equipment } as ExerciseVM["equipment"],
        }),
      );
    expect(on("High-bar barbell squat", "Barbell", "barbell")).toBeNull();
    expect(on("Smith machine calf raise", "Smith machine", "smith_machine")).toBeNull();
    expect(on("45° leg press", "45° leg press", "machine")).toBeNull();
    expect(on("Dumbbell curl", "Dumbbells", "dumbbell")).toBeNull();
    expect(on("Cable triceps pushdown", "Cable station", "cable")).toBe("on Cable station");
    expect(on("Hammer curl", "Dumbbells", "dumbbell")).toBe("with Dumbbells");
    expect(equipmentFact(exercise())).toBeNull();
  });

  it("draws the equipment as its glyph", () => {
    expect(equipmentGlyph(exercise())).toBe("dumbbell");
    const as = (modality: ExerciseVM["exercise"]["modality"], requiresEquipment = true) =>
      equipmentGlyph(
        exercise({ exercise: { ...exercise().exercise, modality, requiresEquipment } }),
      );
    expect(as("cable")).toBe("cable");
    expect(as("smith_machine")).toBe("smith");
    expect(as("machine")).toBe("machine");
    expect(as("bodyweight")).toBe("bodyweight");
    expect(as("mobility")).toBe("bodyweight");
    expect(as("cardio")).toBe("machine");
    expect(as("cardio", false)).toBe("bodyweight");
  });
});

describe("the RIR a set aims at", () => {
  it("is the programme's, or the coach's for that set", () => {
    expect(rirTarget(exercise(), 3)).toBe(2);
    expect(rirTargetLabel(exercise({ planned: { ...planned, rirMax: 3 } }), 3)).toBe("2–3");
    const coached = exercise({
      suggestion: {
        kind: "coach",
        basis: "exercise",
        reason: "Planned by the coach",
        advice: null,
        loadIncrement: 2.5,
        sets: [
          {
            setIndex: 1,
            setType: "working",
            weight: 60,
            reps: 5,
            rir: 3,
            durationSeconds: null,
            distanceMeters: null,
          },
        ],
      },
    });
    expect(rirTarget(coached, 1)).toBe(3);
    expect(rirTargetLabel(coached, 1)).toBe("3");
    expect(rirTargetLabel(exercise({ planned: null }), 1)).toBeNull();
  });
});

describe("which set the entry is on", () => {
  it("numbers sets among the work, the warm-ups on their own", () => {
    const rows = [row(1, "warmup"), row(2, "warmup"), row(3, "warmup"), row(4), row(5), row(6)];
    expect(setNumber(rows, rows[4]!)).toBe(2);
    expect(headingText(entryHeading(rows, rows[1]!, exercise()))).toBe("Warm-up 2 of 3");
    expect(headingText(entryHeading(rows, rows[5]!, exercise()))).toBe("Set 3 of 4");
  });

  it("says a set past the plan, or one without a plan, by its number alone", () => {
    const rows = [1, 2, 3, 4, 5].map((i) => row(i));
    expect(headingText(entryHeading(rows, rows[4]!, exercise()))).toBe("Set 5");
    expect(headingText(entryHeading(rows, rows[0]!, exercise({ planned: null })))).toBe("Set 1");
  });

  it("counts the coach's working sets, not the programme's", () => {
    const coached = exercise({
      suggestion: {
        kind: "coach",
        basis: "exercise",
        reason: "Planned by the coach",
        advice: null,
        loadIncrement: 2.5,
        sets: [1, 2].map((setIndex) => ({
          setIndex,
          setType: setIndex === 1 ? ("warmup" as const) : ("working" as const),
          weight: 60,
          reps: 5,
          rir: 2,
          durationSeconds: null,
          distanceMeters: null,
        })),
      },
    });
    const rows = [row(1, "warmup"), row(2)];
    expect(headingText(entryHeading(rows, rows[1]!, coached))).toBe("Set 1 of 1");
  });
});

describe("a superset", () => {
  it("goes on to the next of its group in the workout's order, and round to the first", () => {
    const carry = exercise({ id: "carry", orderIndex: 3, supersetGroup: "forearms" });
    const curl = exercise({ id: "curl", orderIndex: 4, supersetGroup: "forearms" });
    const alone = exercise({ id: "row", orderIndex: 1 });
    const session = { exercises: [alone, curl, carry] } as SessionVM;
    expect(supersetNext(session, carry)?.id).toBe("curl");
    expect(supersetNext(session, curl)?.id).toBe("carry");
    expect(supersetNext(session, alone)).toBeNull();
  });
});

describe("figures fit their columns", () => {
  it("lays the columns out as the boards do", () => {
    expect(operatorColumn(402)).toBe(18);
    expect(operatorColumn(375)).toBe(14);
    expect(figureColumn(402)).toBeCloseTo(102.67, 1);
    expect(figureColumn(320)).toBeCloseTo(80.67, 1);
  });

  it("steps the entry down the ramp, never under 28", () => {
    expect(entrySize(["62.5", "3", "–"], 402)).toBe(42);
    expect(entrySize(["62.5", "3", "–"], 375)).toBe(36);
    expect(entrySize(["140", "6", "–"], 320)).toBe(36);
    // At 150% text figures are drawn a quarter larger, so they step down to stay whole.
    expect(entrySize(["62.5", "3", "–"], 402, 1.25)).toBe(34);
    expect(entrySize(["1002.5", "3", "–"], 320)).toBe(28);
  });

  it("steps the log down until the widest load fits (DESIGN.md: 102.5 at 360 and 320)", () => {
    expect(logSize(["60", "60"], 402)).toBe(32);
    expect(logSize(["102.5"], 360)).toBe(28);
    expect(logSize(["102.5"], 320)).toBe(26);
    expect(logSize(["62.5"], 402, 1, 26)).toBe(26);
  });
});
