import { describe, expect, it } from "vitest";

import {
  countTargetLabel,
  entryHeading,
  entrySize,
  equipmentFact,
  equipmentLabel,
  equipmentGlyph,
  figureColumn,
  headingText,
  logSize,
  operatorColumn,
  perSetLabel,
  prescriptionLabel,
  restSecondsOf,
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
    defaults: {
      repMin: null,
      repMax: null,
      durationMinSeconds: null,
      durationMaxSeconds: null,
      distanceMinMeters: null,
      distanceMaxMeters: null,
      rir: null,
      restSeconds: null,
    },
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
  coachPerSide: null,
  guidance: null,
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

  it("says nothing it does not know: an exercise with no plan and no defaults has no range", () => {
    const adHoc = exercise({ planned: null });
    expect(perSetLabel(adHoc)).toBeNull();
    expect(prescriptionLabel(adHoc)).toBeNull();
    expect(restText(adHoc)).toBeNull();
    expect(restSecondsOf(adHoc)).toBeNull();
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

  it("says the machine aloud only where the name does not already", () => {
    const row = (name: string, equipment: string, modality: ExerciseVM["exercise"]["modality"]) =>
      equipmentLabel(
        exercise({
          exercise: { ...exercise().exercise, name, modality },
          equipment: { name: equipment } as ExerciseVM["equipment"],
        }),
      );
    expect(row("45° leg press", "45° leg press", "machine")).toBe("Machine");
    expect(row("Cable triceps pushdown", "Cable station", "cable")).toBe("Cable station");
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

/** The coach's sets for today, as a coach-planned session carries them. */
const coachSets = (
  sets: { weight: number | null; reps: number | null; rir: number | null }[],
  warmups = 0,
): NonNullable<ExerciseVM["suggestion"]> => ({
  kind: "coach",
  basis: "exercise",
  reason: "Coach plan for today",
  advice: null,
  loadIncrement: 2.5,
  sets: [
    ...Array.from({ length: warmups }, (_, index) => ({
      setIndex: index + 1,
      setType: "warmup" as const,
      weight: 20,
      reps: 8,
      rir: null,
      durationSeconds: null,
      distanceMeters: null,
    })),
    ...sets.map((set, index) => ({
      setIndex: warmups + index + 1,
      setType: "working" as const,
      ...set,
      durationSeconds: null,
      distanceMeters: null,
    })),
  ],
});

describe("today's targets: every number from one source (plan: today's targets)", () => {
  it("takes a coach-planned exercise's line, prescription and rest from the coach's plan", () => {
    const coached = exercise({
      suggestion: coachSets(
        [
          { weight: 60, reps: 5, rir: 2 },
          { weight: 60, reps: 5, rir: 2 },
          { weight: 60, reps: 5, rir: 2 },
        ],
        1,
      ),
      coachRestSeconds: 150,
    });
    // The programme says 4 × 3–5 @ 2 RIR, rest 3–4 min; the coach wrote 3 × 5 @ 60 kg, 150 s.
    expect(perSetLabel(coached)).toBe("5 reps");
    expect(prescriptionLabel(coached, "kg")).toBe("60 kg · 3 × 5 @ 2 RIR");
    expect(restText(coached)).toBe("2.5 min");
    expect(restSecondsOf(coached)).toBe(150);
    expect(countTargetLabel(coached, 3)).toBe("5");
    // The coach's warm-up asks for its own reps.
    expect(countTargetLabel(coached, 1)).toBe("8");
  });

  it("says each set when the coach's sets differ", () => {
    const coached = exercise({
      suggestion: coachSets([
        { weight: 60, reps: 8, rir: 3 },
        { weight: 65, reps: 6, rir: 2 },
        { weight: 70, reps: 4, rir: 1 },
      ]),
    });
    expect(perSetLabel(coached)).toBe("8/6/4 reps");
    expect(prescriptionLabel(coached, "kg")).toBe("60/65/70 kg · 3 × 8/6/4 @ 3, 2, 1 RIR");
    expect(countTargetLabel(coached, 3)).toBe("4");
    // The coach gave no rest: the programme's stands.
    expect(restText(coached)).toBe("3–4 min");
  });

  it("gives an exercise the coach added the coach's numbers", () => {
    const added = exercise({
      planned: null,
      suggestion: coachSets([
        { weight: 20, reps: 12, rir: 2 },
        { weight: 20, reps: 12, rir: 2 },
      ]),
      coachRestSeconds: 60,
    });
    expect(perSetLabel(added)).toBe("12 reps");
    expect(prescriptionLabel(added, "kg")).toBe("20 kg · 2 × 12 @ 2 RIR");
    expect(restText(added)).toBe("60 s");
  });

  it("keeps the programme's numbers where the coach left the sets to the programme", () => {
    const left = exercise({ coachRestSeconds: 120 });
    expect(perSetLabel(left)).toBe("3–5 reps");
    expect(prescriptionLabel(left, "kg")).toBe("4 × 3–5 @ 2 RIR");
    // The coach's rest still wins, so the timer and the line agree.
    expect(restText(left)).toBe("2 min");
    expect(restSecondsOf(left)).toBe(120);
  });

  it("shows a programme-only exercise the programme's numbers, and its rest to the timer", () => {
    expect(perSetLabel(exercise())).toBe("3–5 reps");
    expect(countTargetLabel(exercise(), 1)).toBe("3–5");
    expect(restSecondsOf(exercise())).toBe(180);
  });

  it("shows an exercise added on the spot its own defaults", () => {
    const adHoc = exercise({
      planned: null,
      exercise: {
        ...exercise().exercise,
        defaults: {
          repMin: 8,
          repMax: 12,
          durationMinSeconds: null,
          durationMaxSeconds: null,
          distanceMinMeters: null,
          distanceMaxMeters: null,
          rir: 2,
          restSeconds: 90,
        },
      },
    });
    expect(perSetLabel(adHoc)).toBe("8–12 reps");
    // Per side is today's figure too: the coach's word for the session, else the programme's.
    const planned = exercise();
    const coachSides = exercise({
      coachPerSide: true,
      planned: { ...planned.planned!, perSide: false },
    });
    expect(perSetLabel(coachSides)).toBe("3–5 reps per side");
    expect(prescriptionLabel(coachSides, "kg")).toBe("4 × 3–5 per side @ 2 RIR");
    const coachBoth = exercise({
      coachPerSide: false,
      planned: { ...planned.planned!, perSide: true },
    });
    expect(perSetLabel(coachBoth)).toBe("3–5 reps");
    expect(prescriptionLabel(adHoc, "kg")).toBe("8–12 reps @ 2 RIR");
    // Half a rep in reserve is not a target anyone can hold: it reads as the two either side.
    const half = {
      ...adHoc,
      exercise: { ...adHoc.exercise, defaults: { ...adHoc.exercise.defaults, rir: 1.5 } },
    };
    expect(prescriptionLabel(half, "kg")).toBe("8–12 reps @ 1–2 RIR");
    expect(restText(adHoc)).toBe("90 s");
    expect(restSecondsOf(adHoc)).toBe(90);
    expect(countTargetLabel(adHoc, 1)).toBe("8–12");
    const hold = exercise({
      planned: null,
      exercise: {
        ...exercise().exercise,
        defaultPrescriptionType: "duration",
        defaults: { ...adHoc.exercise.defaults, durationMinSeconds: 20, durationMaxSeconds: 45 },
      },
    });
    expect(perSetLabel(hold)).toBe("20–45 s");
    expect(prescriptionLabel(hold, "kg")).toBe("20–45 s");
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
