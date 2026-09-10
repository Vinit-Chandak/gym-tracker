import { comparisonScope } from "@/domain/comparable-history";
import {
  regressionStreak,
  suggestNext,
  workingSets,
  type Prescription,
  type ProgressionSuggestion,
  type SuggestionBasis,
} from "@/domain/progression";
import { weightStepFor } from "@/domain/sets";
import type { LoadPortability, LoadUnit, PrescriptionType } from "@/domain/types";
import type { ComparablePerformance } from "@/server/queries/comparable";

import type { programExercises } from "@/db/schema";

export type RuleInput = {
  planned: typeof programExercises.$inferSelect | null;
  exercise: ExerciseDefaults & {
    loadPortability: LoadPortability;
    defaultLoadIncrement: number | null;
  };
  /** The machine in use, or null for free weights, bodyweight and an undecided machine. */
  equipment: { id: string; unit: LoadUnit; loadIncrement: number | null } | null;
  /** The programme slot being performed, by its lineage, so a revision keeps its history. */
  slotLineageId: string | null;
  /** Comparable performances, newest first (same machine for machine work). */
  history: readonly ComparablePerformance[];
  /** The latest performance on any other machine: a starting guess only. */
  elsewhere: ComparablePerformance | null;
};

export type RuleOutcome = {
  weightStep: number;
  previous: ComparablePerformance | null;
  basis: SuggestionBasis;
  basisPerformance: ComparablePerformance | null;
  suggestion: ProgressionSuggestion | null;
  regressionStreak: number;
};

/**
 * The deterministic rule for one exercise: picks the basis performance (the same programme
 * slot first, so a rep range is judged against its own history; a different machine only as
 * a starting guess) and asks the engine what to do next. Shared by the session view and the
 * coach's planning context, so the coach starts from exactly what the athlete would see.
 */
export function applyRule(input: RuleInput): RuleOutcome {
  const weightStep = weightStepFor({
    equipmentLoadIncrement: input.equipment?.loadIncrement ?? null,
    exerciseDefaultIncrement: input.exercise.defaultLoadIncrement,
  });
  const scope = comparisonScope(input.exercise.loadPortability);
  const history = input.history;
  const previous = history[0] ?? null;
  const sameSlot = input.slotLineageId
    ? history.filter((h) => h.plannedSlotLineageId === input.slotLineageId)
    : [];
  const basisHistory = sameSlot.length > 0 ? sameSlot : history;
  let basisPerformance = basisHistory[0] ?? null;
  let basis: SuggestionBasis = basisPerformance
    ? scope === "equipment_instance"
      ? "same_equipment"
      : "exercise"
    : "none";
  if (!basisPerformance && scope === "equipment_instance" && input.equipment && input.elsewhere) {
    basisPerformance = input.elsewhere;
    basis = "other_equipment";
  }
  const prescription = prescriptionFor(
    input.planned,
    input.exercise,
    basisPerformance,
    weightStep,
    input.equipment?.unit ?? "kg",
  );
  return {
    weightStep,
    previous,
    basis,
    basisPerformance,
    suggestion: prescription
      ? suggestNext(prescription, basisPerformance?.sets ?? null, basis)
      : null,
    regressionStreak: regressionStreak(basisHistory.map((h) => h.sets)),
  };
}

/**
 * What the library says about an exercise nothing is planned for: how it is measured, and the
 * range it is normally done in. An exercise added to a session on the spot is prescribed from
 * this, so a carry asks for metres rather than for reps it does not have.
 */
export type ExerciseDefaults = {
  defaultPrescriptionType: PrescriptionType;
  defaultRepMin: number | null;
  defaultRepMax: number | null;
  defaultDurationMinSeconds: number | null;
  defaultDurationMaxSeconds: number | null;
  defaultDistanceMinMeters: number | null;
  defaultDistanceMaxMeters: number | null;
  defaultRir: number | null;
};

/** The range the exercise's own measure is normally worked in, or null when it has none. */
function defaultRange(exercise: ExerciseDefaults): [number, number] | null {
  const pick = (min: number | null, max: number | null): [number, number] | null =>
    min === null || max === null ? null : [min, max];
  switch (exercise.defaultPrescriptionType) {
    case "duration":
      return pick(exercise.defaultDurationMinSeconds, exercise.defaultDurationMaxSeconds);
    case "distance":
      return pick(exercise.defaultDistanceMinMeters, exercise.defaultDistanceMaxMeters);
    default:
      return pick(exercise.defaultRepMin, exercise.defaultRepMax);
  }
}

/** Today's prescription for the rule: the programme slot, else the exercise's own defaults. */
export function prescriptionFor(
  planned: typeof programExercises.$inferSelect | null,
  exercise: ExerciseDefaults,
  basis: ComparablePerformance | null,
  weightStep: number,
  unit: LoadUnit,
): Prescription | null {
  if (planned) {
    const rule = planned.progressionRule ?? null;
    const ruleIncrement = rule && "loadIncrement" in rule ? rule.loadIncrement : null;
    return {
      sets: planned.sets,
      prescriptionType: planned.prescriptionType,
      repMin: planned.repMin,
      repMax: planned.repMax,
      durationMinSeconds: planned.durationMinSeconds,
      durationMaxSeconds: planned.durationMaxSeconds,
      distanceMinMeters: planned.distanceMinMeters,
      distanceMaxMeters: planned.distanceMaxMeters,
      rirMin: planned.rirMin,
      rirMax: planned.rirMax,
      rule,
      loadIncrement: ruleIncrement ?? planned.loadIncrement ?? weightStep,
      unit,
    };
  }
  const range = defaultRange(exercise);
  if (!range) return null;
  const measure = exercise.defaultPrescriptionType;
  return {
    sets: basis ? Math.max(1, workingSets(basis.sets).length) : 1,
    prescriptionType: measure,
    repMin: measure === "reps" ? range[0] : null,
    repMax: measure === "reps" ? range[1] : null,
    durationMinSeconds: measure === "duration" ? range[0] : null,
    durationMaxSeconds: measure === "duration" ? range[1] : null,
    distanceMinMeters: measure === "distance" ? range[0] : null,
    distanceMaxMeters: measure === "distance" ? range[1] : null,
    rirMin: exercise.defaultRir,
    rirMax: exercise.defaultRir,
    rule:
      measure === "reps"
        ? { kind: "double_progression", loadIncrement: null }
        : { kind: "time_first" },
    loadIncrement: weightStep,
    unit,
  };
}
