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
import type { LoadPortability, LoadUnit } from "@/domain/types";
import type { ComparablePerformance } from "@/server/queries/comparable";

import type { programExercises } from "@/db/schema";

export type RuleInput = {
  planned: typeof programExercises.$inferSelect | null;
  exercise: {
    loadPortability: LoadPortability;
    defaultLoadIncrement: number | null;
    defaultRepMin: number | null;
    defaultRepMax: number | null;
    defaultRir: number | null;
  };
  /** The machine in use, or null for free weights, bodyweight and an undecided machine. */
  equipment: { id: string; unit: LoadUnit; loadIncrement: number | null } | null;
  plannedProgramExerciseId: string | null;
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
  const sameSlot = input.plannedProgramExerciseId
    ? history.filter((h) => h.plannedProgramExerciseId === input.plannedProgramExerciseId)
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

/** Today's prescription for the rule: the programme slot, else the exercise's own defaults. */
export function prescriptionFor(
  planned: typeof programExercises.$inferSelect | null,
  exercise: {
    defaultRepMin: number | null;
    defaultRepMax: number | null;
    defaultRir: number | null;
  },
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
      rirMin: planned.rirMin,
      rirMax: planned.rirMax,
      rule,
      loadIncrement: ruleIncrement ?? planned.loadIncrement ?? weightStep,
      unit,
    };
  }
  if (exercise.defaultRepMin === null || exercise.defaultRepMax === null) return null;
  return {
    sets: basis ? Math.max(1, workingSets(basis.sets).length) : 1,
    prescriptionType: "reps",
    repMin: exercise.defaultRepMin,
    repMax: exercise.defaultRepMax,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    rirMin: exercise.defaultRir,
    rirMax: exercise.defaultRir,
    rule: { kind: "double_progression", loadIncrement: null },
    loadIncrement: weightStep,
    unit,
  };
}
