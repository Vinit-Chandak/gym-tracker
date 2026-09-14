import { comparisonScope } from "@/domain/comparable-history";
import {
  suggestNext,
  workingSets,
  type Prescription,
  type ProgressionSuggestion,
  type SuggestionBasis,
} from "@/domain/progression";
import { weightStepFor } from "@/domain/sets";
import type { LoadPortability, LoadUnit, PrescriptionType } from "@/domain/types";
import type { ComparablePerformance } from "@/server/queries/comparable";
import { canConvertLoad, convertLoad, setInUnit } from "@/lib/units";

import type { programExercises } from "@/db/schema";
import { summarizeExerciseEvidence, TRAINING_POLICY } from "@/domain/training-evidence";
import { todayInTimeZone } from "@/domain/program-calendar";

export type RuleInput = {
  asOf?: Date;
  /** Accepted decisions for this account, oldest first. */
  changes?: readonly {
    createdAt: Date;
    changes: readonly import("@/db/schema").CoachingChangeRecord[];
  }[];
  exerciseSlug?: string;
  planned: RulePrescription | null;
  exercise: ExerciseDefaults & {
    loadPortability: LoadPortability;
    defaultLoadIncrement: number | null;
  };
  /** The machine in use, or null for free weights, bodyweight and an undecided machine. */
  equipment: {
    id: string;
    unit: LoadUnit;
    loadIncrement: number | null;
    availableLoads?: number[];
    loadConvention?: string;
  } | null;
  locationKind?: string;
  timeZone?: string;
  preferredUnit?: "kg" | "lb";
  /** The programme slot being performed, by its lineage, so a revision keeps its history. */
  slotLineageId: string | null;
  /** Comparable performances, newest first (same machine for machine work). */
  history: readonly ComparablePerformance[];
  /** The latest performance on any other machine: a starting guess only. */
  elsewhere: ComparablePerformance | null;
};
type RulePrescription = Pick<
  typeof programExercises.$inferSelect,
  | "sets"
  | "prescriptionType"
  | "repMin"
  | "repMax"
  | "durationMinSeconds"
  | "durationMaxSeconds"
  | "distanceMinMeters"
  | "distanceMaxMeters"
  | "rirMin"
  | "rirMax"
  | "progressionRule"
  | "loadIncrement"
>;

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
  const unit = input.equipment?.unit ?? input.preferredUnit ?? "kg";
  const defaultStep = weightStepFor({
    equipmentLoadIncrement: input.equipment?.loadIncrement ?? null,
    exerciseDefaultIncrement: input.exercise.defaultLoadIncrement,
  });
  const weightStep = input.equipment ? defaultStep : convertLoad(defaultStep, "kg", unit);
  const normalize = (performance: ComparablePerformance): ComparablePerformance | null =>
    performance.sets.some((set) => set.weight !== null && !canConvertLoad(set.unit, unit))
      ? null
      : { ...performance, sets: performance.sets.map((set) => setInUnit(set, unit)) };
  const scope = comparisonScope(input.exercise.loadPortability);
  const now = input.asOf ?? new Date();
  const history = input.history
    .filter(
      (h) =>
        h.equipmentInstanceId === (input.equipment?.id ?? null) &&
        h.performedAt.getTime() >= now.getTime() - TRAINING_POLICY.trendDays * 86_400_000,
    )
    .map(normalize)
    .filter((item) => item !== null);
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
    basisPerformance = normalize(input.elsewhere);
    if (basisPerformance) basis = "other_equipment";
  }
  const prescription = prescriptionFor(
    input.planned,
    input.exercise,
    basisPerformance,
    weightStep,
    unit,
  );
  if (prescription && !input.equipment && unit === "lb") {
    // Explicit programme increments, like library defaults, are specified in kilograms.
    const rule = input.planned?.progressionRule;
    const increment =
      (rule && "loadIncrement" in rule ? rule.loadIncrement : null) ?? input.planned?.loadIncrement;
    if (increment != null) prescription.loadIncrement = convertLoad(increment, "kg", unit);
  }
  if (prescription) {
    prescription.availableLoads = input.equipment?.availableLoads;
    prescription.requireConfirmedLoads = input.locationKind === "home";
    if (prescription.requireConfirmedLoads && input.equipment?.loadConvention === "unknown")
      prescription.availableLoads = [];
    if (
      input.equipment &&
      ["assistance", "stack_label"].includes(input.equipment.loadConvention ?? "")
    ) {
      prescription.requireConfirmedLoads = true;
      prescription.availableLoads = [];
    }
  }
  const evidenceHistory = basisHistory.map((h) => ({
    ...h,
    performedOn: todayInTimeZone(input.timeZone ?? "Asia/Kolkata", h.performedAt),
  }));
  const decisions = (input.changes ?? []).flatMap((record) =>
    record.changes
      .filter((change) => change.scope === `slot:${input.slotLineageId}`)
      .map((change) => ({ ...change, at: record.createdAt })),
  );
  const lastDecision = decisions.filter((change) => change.kind !== "temporary").at(-1);
  const freshHistory = lastDecision
    ? evidenceHistory.filter(
        (h) =>
          h.performedAt > lastDecision.at &&
          !decisions.some(
            (change) =>
              change.kind !== "temporary" &&
              change.evidenceIds.includes(`workout:${h.workoutSessionId}`),
          ),
      )
    : evidenceHistory;
  let suggestion = prescription
    ? suggestNext(prescription, basisPerformance?.sets ?? null, basis, freshHistory)
    : null;
  const original = basisHistory
    .filter(
      (h) => h.performedAt.getTime() >= now.getTime() - TRAINING_POLICY.cumulativeDays * 86_400_000,
    )
    .at(-1);
  if (
    suggestion?.kind === "increase" &&
    original &&
    basisPerformance &&
    suggestion.sets.some((set) => {
      const old = workingSets(original.sets).find((item) => item.setIndex === set.setIndex);
      return (
        old?.weight != null &&
        old.weight > 0 &&
        set.weight != null &&
        set.weight / old.weight - 1 > TRAINING_POLICY.maxCumulativeLoadIncrease + 1e-9
      );
    })
  )
    suggestion = {
      ...suggestion,
      kind: "hold",
      reason: "Combined load increases over 14 days need review.",
      advice: "Repeat the current load until the coach reviews the recent progression.",
      sets: basisPerformance.sets.map((set) => ({ ...set, rir: prescription?.rirMin ?? null })),
    };
  const lastLoadDecision = decisions
    .filter(
      (change) =>
        change.exerciseSlug === input.exerciseSlug &&
        change.equipmentId === (input.equipment?.id ?? null) &&
        change.unit &&
        canConvertLoad(change.unit, unit) &&
        (change.before.loads?.length || change.after.loads?.length),
    )
    .at(-1);
  const referenceLoads =
    lastLoadDecision?.kind === "temporary"
      ? lastLoadDecision.before.loads
      : lastLoadDecision?.after.loads;
  const currentWorking = workingSets(basisPerformance?.sets ?? []);
  if (
    suggestion &&
    prescription &&
    referenceLoads?.some(
      (load) =>
        currentWorking[load.index]?.weight !==
        convertLoad(load.load, lastLoadDecision!.unit!, unit),
    )
  ) {
    suggestion = {
      ...suggestion,
      kind: "hold",
      reason:
        "Return to the retained baseline after the temporary session; reassess current readiness.",
      advice:
        "A lighter session does not permanently lower the plan. Report current recovery before training.",
      sets: suggestion.sets.map((set) => {
        const index = currentWorking.findIndex((item) => item.setIndex === set.setIndex);
        const load = referenceLoads.find((item) => item.index === index);
        return load
          ? {
              ...set,
              weight: convertLoad(load.load, lastLoadDecision!.unit!, unit),
              rir: prescription.rirMin,
            }
          : set;
      }),
    };
  }
  // The fallback can flag decline but cannot create an unrecorded lasting reduction.
  if (suggestion?.kind === "reduce" && basisPerformance)
    suggestion = {
      ...suggestion,
      kind: "hold",
      reason: "Repeated decline needs a coach review against the retained reference.",
      advice: "Keep the baseline pending review; a recovery adjustment can still be temporary.",
      sets: basisPerformance.sets.map((set) => ({ ...set, rir: prescription?.rirMin ?? null })),
    };
  return {
    weightStep,
    previous,
    basis,
    basisPerformance,
    suggestion,
    regressionStreak:
      prescription && summarizeExerciseEvidence(prescription, evidenceHistory).declineCandidate
        ? 2
        : 0,
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
  planned: RulePrescription | null,
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
