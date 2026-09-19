import { describe, expect, it } from "vitest";

import type { BlueprintDay, BlueprintExercise, ProgramBlueprint } from "./program-blueprint";
import { diffPrograms, hasProgramChange, programDiffSummary } from "./program-diff";

const LINEAGE = {
  squat: "11111111-1111-4111-8111-111111111111",
  curl: "22222222-2222-4222-8222-222222222222",
  press: "33333333-3333-4333-8333-333333333333",
  plank: "44444444-4444-4444-8444-444444444444",
} as const;

function exercise(input: Partial<BlueprintExercise> & { exerciseSlug: string }): BlueprintExercise {
  return {
    sets: 3,
    reps: [8, 12],
    rir: [1, 2],
    rest: [90, 120],
    ...input,
  } as BlueprintExercise;
}

function day(input: Partial<BlueprintDay> & { dayIndex: number }): BlueprintDay {
  return {
    dayOfWeek: input.dayIndex,
    name: `Day ${input.dayIndex}`,
    focus: "",
    timeNote: "",
    effortNote: "",
    notes: "",
    includesLifting: true,
    includesRun: false,
    warmupSlug: "",
    exercises: [],
    ...input,
  };
}

function plan(input: Partial<ProgramBlueprint> & { days: BlueprintDay[] }): ProgramBlueprint {
  return {
    blueprintVersion: 1,
    slug: "test-plan",
    name: "Test plan",
    weeks: 4,
    notes: "",
    runs: [],
    ...input,
  };
}

const base = plan({
  days: [
    day({
      dayIndex: 1,
      name: "Lower",
      exercises: [
        exercise({ exerciseSlug: "high-bar-squat", lineageId: LINEAGE.squat, sets: 3 }),
        exercise({ exerciseSlug: "seated-leg-curl", lineageId: LINEAGE.curl, sets: 3 }),
      ],
    }),
    day({
      dayIndex: 2,
      name: "Upper",
      exercises: [exercise({ exerciseSlug: "overhead-press", lineageId: LINEAGE.press, sets: 4 })],
    }),
  ],
});

/** Deep copy so a test can edit one version without touching the other. */
const copy = (input: ProgramBlueprint): ProgramBlueprint =>
  JSON.parse(JSON.stringify(input)) as ProgramBlueprint;

describe("identity", () => {
  it("reports nothing for two identical programmes", () => {
    const diff = diffPrograms(base, copy(base));
    expect(diff.empty).toBe(true);
    expect(diff.days).toEqual([]);
    expect(programDiffSummary(diff)).toBe("No programme changes");
    expect(hasProgramChange(base, copy(base))).toBe(false);
  });

  it("ignores day and run ordering that carries no meaning", () => {
    const shuffled = copy(base);
    shuffled.days.reverse();
    expect(diffPrograms(base, shuffled).empty).toBe(true);
  });

  it("calls a slot whose exercise changed a replacement, naming both sides once", () => {
    const next = copy(base);
    next.days[0]!.exercises[1]!.exerciseSlug = "lying-leg-curl";
    const diff = diffPrograms(base, next);
    expect(diff.days).toHaveLength(1);
    const [operation] = diff.days[0]!.operations;
    expect(operation).toMatchObject({
      kind: "replaced",
      from: { exerciseSlug: "seated-leg-curl" },
      to: { exerciseSlug: "lying-leg-curl" },
    });
    expect(diff.counts).toMatchObject({ replaced: 1, added: 0, removed: 0 });
  });

  it("keeps a replacement one operation when its targets changed too", () => {
    const next = copy(base);
    next.days[0]!.exercises[1]!.exerciseSlug = "lying-leg-curl";
    next.days[0]!.exercises[1]!.sets = 4;
    const diff = diffPrograms(base, next);
    expect(diff.days[0]!.operations).toHaveLength(1);
    expect(diff.days[0]!.operations[0]).toMatchObject({
      kind: "replaced",
      fields: [{ field: "sets", from: "3", to: "4" }],
    });
  });

  it("tells two slots of the same exercise apart by lineage, not by name", () => {
    const twice = plan({
      days: [
        day({
          dayIndex: 1,
          exercises: [
            exercise({ exerciseSlug: "cable-curl", lineageId: LINEAGE.curl, sets: 3 }),
            exercise({ exerciseSlug: "cable-curl", lineageId: LINEAGE.press, sets: 2 }),
          ],
        }),
      ],
    });
    const next = copy(twice);
    next.days[0]!.exercises[1]!.sets = 4;
    const diff = diffPrograms(twice, next);
    expect(diff.days[0]!.operations).toHaveLength(1);
    expect(diff.days[0]!.operations[0]).toMatchObject({
      kind: "retargeted",
      to: { lineageId: LINEAGE.press, position: 2 },
    });
  });

  it("never guesses a replacement pair when lineage is missing", () => {
    const next = copy(base);
    delete next.days[0]!.exercises[1]!.lineageId;
    next.days[0]!.exercises[1]!.exerciseSlug = "lying-leg-curl";
    const diff = diffPrograms(base, next);
    const kinds = diff.days[0]!.operations.map((operation) => operation.kind).sort();
    expect(kinds).toEqual(["added", "removed"]);
    expect(diff.counts).toMatchObject({ replaced: 0, added: 1, removed: 1 });
  });

  it("reads an addition and a removal as themselves", () => {
    const next = copy(base);
    next.days[0]!.exercises.push(
      exercise({ exerciseSlug: "cable-crunch", sets: 3, reps: [10, 15] }),
    );
    next.days[1]!.exercises = [];
    const diff = diffPrograms(base, next);
    expect(diff.counts).toMatchObject({ added: 1, removed: 1 });
    expect(diff.days.map((group) => group.dayIndex)).toEqual([1, 2]);
    expect(diff.days[0]!.operations[0]).toMatchObject({
      kind: "added",
      to: { exerciseSlug: "cable-crunch", targets: "3 × 10–15 reps · RIR 1–2 · rest 90–120 s" },
    });
  });
});

describe("order and movement", () => {
  it("reports one moved row rather than every row beneath an insertion", () => {
    const next = copy(base);
    next.days[0]!.exercises.unshift(
      exercise({ exerciseSlug: "hip-thrust", sets: 3, reps: [8, 10] }),
    );
    const diff = diffPrograms(base, next);
    expect(diff.counts).toMatchObject({ added: 1, reordered: 0 });
  });

  it("names a genuine within-day reorder", () => {
    const next = copy(base);
    next.days[0]!.exercises.reverse();
    const diff = diffPrograms(base, next);
    expect(diff.counts.reordered).toBe(1);
    // Either row of a swapped pair is a defensible reading; exactly one is reported, so the
    // athlete reads "this moved" rather than "everything moved".
    expect(diff.days[0]!.operations[0]).toMatchObject({
      kind: "reordered",
      from: { position: 1, exerciseSlug: "high-bar-squat" },
      to: { position: 2, exerciseSlug: "high-bar-squat" },
    });
  });

  it("links a cross-day move from both ends and counts it once", () => {
    const next = copy(base);
    const [moved] = next.days[0]!.exercises.splice(1, 1);
    next.days[1]!.exercises.push(moved!);
    const diff = diffPrograms(base, next);
    expect(diff.counts).toMatchObject({ moved: 1, added: 0, removed: 0 });
    expect(diff.days[0]!.operations[0]).toMatchObject({
      kind: "moved_out",
      otherDayIndex: 2,
      otherDayName: "Upper",
    });
    expect(diff.days[1]!.operations[0]).toMatchObject({
      kind: "moved_in",
      otherDayIndex: 1,
      otherDayName: "Lower",
    });
    const ids = new Set(diff.days.flatMap((group) => group.operations.map((entry) => entry.id)));
    expect(ids.size).toBe(1);
  });

  it("shows a day added and a day removed with their own status", () => {
    const next = copy(base);
    next.days.pop();
    next.days.push(
      day({
        dayIndex: 3,
        dayOfWeek: 5,
        name: "Conditioning",
        includesLifting: false,
        includesRun: true,
      }),
    );
    const diff = diffPrograms(base, next);
    expect(diff.days.map((group) => [group.dayIndex, group.status])).toEqual([
      [2, "removed"],
      [3, "added"],
    ]);
  });

  it("names the day fields that changed and leaves the unchanged days out", () => {
    const next = copy(base);
    next.days[1]!.dayOfWeek = 4;
    next.days[1]!.warmupSlug = "upper-body-primer";
    const diff = diffPrograms(base, next);
    expect(diff.days).toHaveLength(1);
    expect(diff.days[0]!.fields).toEqual([
      { field: "dayOfWeek", label: "Weekday", from: "Tuesday", to: "Thursday" },
      { field: "warmupSlug", label: "Warm-up", from: "None", to: "upper-body-primer" },
    ]);
  });
});

describe("completeness", () => {
  const changed = (edit: (next: ProgramBlueprint) => void) => {
    const next = copy(base);
    edit(next);
    const diff = diffPrograms(base, next);
    const operation = diff.days[0]!.operations[0]!;
    return "fields" in operation ? operation.fields : [];
  };

  it("keeps a measurement change one field with both units named", () => {
    expect(
      changed((next) => {
        delete next.days[0]!.exercises[0]!.reps;
        next.days[0]!.exercises[0]!.duration = [30, 45];
      }),
    ).toEqual([{ field: "target", label: "Target", from: "8–12 (reps)", to: "30–45 s (time)" }]);
  });

  it("records per-side, effort and rest", () => {
    expect(
      changed((next) => {
        next.days[0]!.exercises[0]!.perSide = true;
        next.days[0]!.exercises[0]!.rir = [0, 1];
        next.days[0]!.exercises[0]!.rest = [60, 60];
      }),
    ).toEqual([
      { field: "perSide", label: "Per side", from: "No", to: "Yes" },
      { field: "rir", label: "Effort (RIR)", from: "1–2", to: "0–1" },
      { field: "rest", label: "Rest", from: "90–120 s", to: "60 s" },
    ]);
  });

  it("moves an unknown effort to a known one without inventing a number", () => {
    const from = plan({
      days: [
        day({
          dayIndex: 1,
          exercises: [exercise({ exerciseSlug: "plank", lineageId: LINEAGE.plank, rir: null })],
        }),
      ],
    });
    const next = copy(from);
    next.days[0]!.exercises[0]!.rir = [2, 3];
    const operation = diffPrograms(from, next).days[0]!.operations[0]!;
    expect("fields" in operation ? operation.fields : []).toEqual([
      { field: "rir", label: "Effort (RIR)", from: "Unspecified", to: "2–3" },
    ]);
  });

  it("treats a superset, a load note and a fallback list as changes", () => {
    expect(
      changed((next) => {
        next.days[0]!.exercises[0]!.supersetGroup = "A";
        next.days[0]!.exercises[0]!.targetLoadNote = "Start at 60 kg";
        next.days[0]!.exercises[0]!.fallbacks = [{ exerciseSlug: "hack-squat", rank: 1 }];
      }).map((field) => field.field),
    ).toEqual(["supersetGroup", "targetLoadNote", "fallbacks"]);
  });

  it("treats an instruction-only edit as a real change", () => {
    const next = copy(base);
    next.days[0]!.exercises[0]!.progressionNotes = "Add 2.5 kg when all sets hit 12.";
    const diff = diffPrograms(base, next);
    expect(diff.empty).toBe(false);
    expect(diff.days[0]!.operations[0]).toMatchObject({
      kind: "retargeted",
      fields: [{ field: "progressionNotes" }],
    });
  });

  it("records a progression rule change in words", () => {
    expect(
      changed((next) => {
        next.days[0]!.exercises[0]!.progressionRule = {
          kind: "conservative_strength",
          loadIncrement: 2.5,
          repsRequired: 8,
        };
      }),
    ).toEqual([
      {
        field: "progressionRule",
        label: "Progression rule",
        from: "—",
        to: "Conservative strength, +2.5 after 8 reps",
      },
    ]);
  });

  it("reports programme-level fields that belong to no exercise row", () => {
    const next = copy(base);
    next.name = "Autumn block";
    next.weeks = 6;
    const diff = diffPrograms(base, next);
    expect(diff.days).toEqual([]);
    expect(diff.empty).toBe(false);
    expect(diff.program).toEqual([
      { field: "name", label: "Name", from: "Test plan", to: "Autumn block" },
      { field: "weeks", label: "Length", from: "4 weeks", to: "6 weeks" },
    ]);
  });
});

describe("runs", () => {
  const withRuns = plan({
    days: [
      day({ dayIndex: 1, name: "Lower" }),
      day({
        dayIndex: 2,
        dayOfWeek: 6,
        name: "Long run",
        includesLifting: false,
        includesRun: true,
      }),
    ],
    runs: [
      {
        weekIndex: 1,
        dayOfWeek: 6,
        duration: [30, 30],
        rpe: [4, 5],
        paceNote: "Easy",
        progressionNote: "",
        shinRule: "",
      },
      {
        weekIndex: 2,
        dayOfWeek: 6,
        duration: [35, 35],
        rpe: [4, 5],
        paceNote: "Easy",
        progressionNote: "",
        shinRule: "",
      },
    ],
  });

  it("groups a changed run under its day and leaves unchanged weeks out", () => {
    const next = copy(withRuns);
    next.runs[1]!.duration = [40, 40];
    next.runs[1]!.distanceKm = [6, 6];
    const diff = diffPrograms(withRuns, next);
    expect(diff.days).toHaveLength(1);
    expect(diff.days[0]!.dayIndex).toBe(2);
    expect(diff.days[0]!.operations).toEqual([
      {
        id: "run:2:6",
        kind: "run_changed",
        weekIndex: 2,
        fields: [
          { field: "duration", label: "Minutes", from: "35", to: "40" },
          { field: "distanceKm", label: "Distance", from: "—", to: "6 km" },
        ],
      },
    ]);
  });

  it("shows a moved run occurrence as a removal and an addition", () => {
    const next = copy(withRuns);
    next.runs[0]!.dayOfWeek = 3;
    next.days[1]!.dayOfWeek = 3;
    const diff = diffPrograms(withRuns, next);
    const kinds = diff.days.flatMap((group) =>
      group.operations.filter((entry) => entry.kind.startsWith("run_")).map((entry) => entry.kind),
    );
    expect(kinds.sort()).toEqual(["run_added", "run_removed"]);
  });
});

describe("summary", () => {
  it("counts a replacement and an addition across the days they touch", () => {
    const next = copy(base);
    next.days[0]!.exercises[1]!.exerciseSlug = "lying-leg-curl";
    next.days[1]!.exercises.push(exercise({ exerciseSlug: "cable-crunch" }));
    expect(programDiffSummary(diffPrograms(base, next))).toBe(
      "1 added, 1 replacement across 2 days",
    );
  });
});
