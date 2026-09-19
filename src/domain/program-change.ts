import {
  programBlueprintSchema,
  type BlueprintDay,
  type ProgramBlueprint,
} from "./program-blueprint";
import { diffPrograms } from "./program-diff";
import { MUSCLE_GROUPS, type MuscleGroup } from "./types";
import { TRAINING_POLICY } from "./training-evidence";

/** Confirmed policy: prescription autonomy, with best-effort preservation of planned muscles. */
export const WEEKLY_CHANGE_POLICY_VERSION = 2;

export type ProgramChangeAuthority = "unchanged" | "automatic" | "review_required";
export type StructuralChange =
  | "program_identity"
  | "block_length"
  | "split_or_schedule"
  | "run_schedule"
  | "slot_moved_between_days";

export type ExerciseMuscleReference = {
  slug: string;
  /** Empty or missing coverage is unknown, never inferred from an exercise name. */
  primaryMuscles: readonly string[] | null;
};

function normalized(input: unknown): ProgramBlueprint {
  const plan = programBlueprintSchema.parse(input);
  plan.days.sort((a, b) => a.dayIndex - b.dayIndex);
  plan.runs.sort((a, b) => a.weekIndex - b.weekIndex || a.dayOfWeek - b.dayOfWeek);
  return plan;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Exercise order and targets may change; the days' identity and training intent may not. */
function split(plan: ProgramBlueprint) {
  return plan.days.map((day) => ({
    dayIndex: day.dayIndex,
    dayOfWeek: day.dayOfWeek,
    name: day.name,
    focus: day.focus,
    includesLifting: day.includesLifting,
    includesRun: day.includesRun,
    hasLiftingPrescription: day.exercises.length > 0,
  }));
}

function runSchedule(plan: ProgramBlueprint) {
  return plan.runs.map((run) => [run.weekIndex, run.dayOfWeek]);
}

function primaryCoverage(
  day: BlueprintDay | undefined,
  library: Map<string, ExerciseMuscleReference>,
) {
  const sets: Partial<Record<MuscleGroup, number>> = {};
  const unknownExercises = new Set<string>();
  for (const exercise of day?.exercises ?? []) {
    const muscles = library.get(exercise.exerciseSlug)?.primaryMuscles;
    const known = new Set(
      (muscles ?? []).filter((muscle): muscle is MuscleGroup =>
        (MUSCLE_GROUPS as readonly string[]).includes(muscle),
      ),
    );
    if (known.size === 0 || known.size !== new Set(muscles ?? []).size)
      unknownExercises.add(exercise.exerciseSlug);
    for (const muscle of known) sets[muscle] = (sets[muscle] ?? 0) + exercise.sets;
  }
  return { sets, unknownExercises: [...unknownExercises].sort() };
}

/**
 * Classifies the actual blueprint difference, never a model's description of it. This is
 * an authority assessment, not permission to activate: job scope, confirmed constraints,
 * equipment, input revisions, future boundary, and open-workout checks remain mandatory.
 *
 * Muscle coverage is advisory. A substitution without a matching muscle can still be
 * automatic; the coach must prefer feasible matches and explain changes or missing data.
 */
export function assessProgramChange(
  current: unknown,
  proposed: unknown,
  exerciseLibrary: readonly ExerciseMuscleReference[],
) {
  const before = normalized(current);
  const after = normalized(proposed);
  const structuralChanges: StructuralChange[] = [];
  const doseChanges: string[] = [];
  if (before.slug !== after.slug) structuralChanges.push("program_identity");
  if (before.weeks !== after.weeks) structuralChanges.push("block_length");
  if (!same(split(before), split(after))) structuralChanges.push("split_or_schedule");
  if (!same(runSchedule(before), runSchedule(after))) structuralChanges.push("run_schedule");
  const oldSlotDays = new Map(
    before.days.flatMap((day) =>
      day.exercises
        .filter((exercise) => exercise.lineageId !== undefined)
        .map((exercise) => [exercise.lineageId!, day.dayIndex] as const),
    ),
  );
  if (
    after.days.some((day) =>
      day.exercises.some((exercise) => {
        const oldDay = exercise.lineageId ? oldSlotDays.get(exercise.lineageId) : undefined;
        return oldDay !== undefined && oldDay !== day.dayIndex;
      }),
    )
  )
    structuralChanges.push("slot_moved_between_days");

  const library = new Map(exerciseLibrary.map((exercise) => [exercise.slug, exercise]));
  const priorSlots = new Map(
    before.days.flatMap((day) =>
      day.exercises.map((e, index) => [e.lineageId ?? `${day.dayIndex}:${index}`, e] as const),
    ),
  );
  const nextSlots = after.days.flatMap((day) =>
    day.exercises.map((e, index) => ({
      key: e.lineageId ?? `${day.dayIndex}:${index}`,
      exercise: e,
    })),
  );
  const oldTotal = before.days.reduce(
    (sum, day) => sum + day.exercises.reduce((n, e) => n + e.sets, 0),
    0,
  );
  const newTotal = nextSlots.reduce((sum, slot) => sum + slot.exercise.sets, 0);
  if (oldTotal > 0 && Math.abs(newTotal / oldTotal - 1) > TRAINING_POLICY.maxTotalSetChange + 1e-9)
    doseChanges.push("Total working sets change by more than 20%.");
  if (priorSlots.size !== nextSlots.length)
    doseChanges.push("Adding or removing exercise slots needs review.");
  for (const { key, exercise: next } of nextSlots) {
    const old = priorSlots.get(key);
    if (!old) {
      doseChanges.push("A new slot needs review.");
      continue;
    }
    if (
      Math.abs(next.sets - old.sets) > 1 ||
      Math.abs(next.sets / old.sets - 1) > TRAINING_POLICY.maxExerciseSetChange + 1e-9
    )
      doseChanges.push(`${next.exerciseSlug}: set change exceeds one set or 25%.`);
    for (const metric of ["reps", "duration", "distance"] as const) {
      const a = old[metric],
        b = next[metric];
      if (
        !!a !== !!b ||
        (a &&
          b &&
          a.some(
            (v, i) => Math.abs(b[i]! - v) > Math.max(metric === "reps" ? 1 : 0, v * 0.1) + 1e-9,
          ))
      )
        doseChanges.push(`${next.exerciseSlug}: ${metric} range needs review.`);
    }
    if (
      !!old.rir !== !!next.rir ||
      (old.rir && next.rir && old.rir.some((v, i) => Math.abs(next.rir![i]! - v) > 1))
    )
      doseChanges.push(`${next.exerciseSlug}: effort changes by more than one RIR.`);
  }
  for (const next of after.runs) {
    const old = before.runs.find(
      (run) => run.weekIndex === next.weekIndex && run.dayOfWeek === next.dayOfWeek,
    );
    if (
      old &&
      (!!old.distanceKm !== !!next.distanceKm ||
        (old.distanceKm &&
          next.distanceKm &&
          old.distanceKm.some(
            (value, i) =>
              Math.abs(next.distanceKm![i]! / value - 1) > TRAINING_POLICY.maxRunChange + 1e-9,
          )))
    )
      doseChanges.push(
        `Run ${next.weekIndex}/${next.dayOfWeek}: distance changes need calibration or exceed the automatic limit.`,
      );
    if (
      old &&
      (old.duration.some(
        (value, i) => Math.abs(next.duration[i]! / value - 1) > TRAINING_POLICY.maxRunChange + 1e-9,
      ) ||
        old.rpe.some((value, i) => Math.abs(next.rpe[i]! - value) > 1))
    )
      doseChanges.push(
        `Run ${next.weekIndex}/${next.dayOfWeek}: duration or effort exceeds the automatic limit.`,
      );
  }
  const dayIndexes = [...new Set([...before.days, ...after.days].map((day) => day.dayIndex))].sort(
    (a, b) => a - b,
  );
  const muscleCoverage = dayIndexes.map((dayIndex) => {
    const planned = primaryCoverage(
      before.days.find((day) => day.dayIndex === dayIndex),
      library,
    );
    const next = primaryCoverage(
      after.days.find((day) => day.dayIndex === dayIndex),
      library,
    );
    const plannedMuscles = MUSCLE_GROUPS.filter((muscle) => planned.sets[muscle] !== undefined);
    return {
      dayIndex,
      planned,
      next,
      retainedPrimaryMuscles: plannedMuscles.filter((muscle) => next.sets[muscle] !== undefined),
      // Unknown exercises might cover a target: report a gap in confirmation, not proven loss.
      unconfirmedPrimaryMuscles: plannedMuscles.filter((muscle) => next.sets[muscle] === undefined),
      addedPrimaryMuscles: MUSCLE_GROUPS.filter(
        (muscle) => next.sets[muscle] !== undefined && planned.sets[muscle] === undefined,
      ),
    };
  });
  // One definition of "nothing changed", shared with the screen that shows the difference.
  // A revision that only mints slot lineage is not a change the athlete can see, and it must
  // not leave behind a draft offering to apply nothing.
  const authority: ProgramChangeAuthority = diffPrograms(before, after).empty
    ? "unchanged"
    : structuralChanges.length > 0 || doseChanges.length > 0
      ? "review_required"
      : "automatic";
  return {
    policyVersion: WEEKLY_CHANGE_POLICY_VERSION,
    authority,
    structuralChanges,
    doseChanges,
    muscleCoverage,
  };
}

export type ProgramChangeAssessment = ReturnType<typeof assessProgramChange>;
