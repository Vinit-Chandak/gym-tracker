import { comparisonScope } from "@/domain/comparable-history";
import {
  afterBreak,
  prescriptionLadder,
  readAddedLoad,
  suggestNext,
  workingSets,
  type Prescription,
  type ProgressionSuggestion,
  type SuggestionBasis,
} from "@/domain/progression";
import { bodyLoad } from "@/domain/body-load";
import { weightStepFor } from "@/domain/sets";
import type { LoadPortability, LoadUnit, PrescriptionType } from "@/domain/types";
import type { ComparablePerformance } from "@/server/queries/comparable";
import { canConvertLoad, convertLoad, loadStepIn } from "@/lib/units";

import type { programExercises } from "@/db/schema";
import {
  lighterSessions,
  summarizeExerciseEvidence,
  TRAINING_POLICY,
} from "@/domain/training-evidence";
import { difficultyChange, harderAllowance, type LoadLadder } from "@/domain/load-steps";
import { todayInTimeZone } from "@/domain/program-calendar";
import { readPerformance } from "@/domain/warmup-ramp";

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
    /** What says whether the body is part of the load (ADR 0040). */
    modality?: string | null;
    movementPattern?: string | null;
  };
  /** The athlete's latest body weight, for the part of it a bodyweight movement lifts. */
  bodyWeightKg?: number | null;
  /**
   * The machine in use, or null for an undecided one. A registered bar or set of dumbbells may be
   * here too: its unit and loads are today's, but which history counts is the exercise's to say.
   */
  equipment: {
    id: string;
    unit: LoadUnit;
    loadIncrement: number | null;
  } | null;
  /** The machine's loads (ADR 0028); null or absent steps by the increment alone. */
  ladder?: LoadLadder | null;
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
  // The library's step is in kilograms: in pounds it is the plate jump, with a machine registered
  // without its own increment as much as without one.
  const weightStep = weightStepFor({
    equipmentLoadIncrement: input.equipment?.loadIncrement ?? null,
    exerciseDefaultIncrement: input.exercise.defaultLoadIncrement,
    unit,
  });
  const ladder = input.equipment ? (input.ladder ?? null) : null;
  /**
   * A load logged in another unit, read in this one. Converted, 100 kg is 220.46 lb, which
   * nobody can load and which a step turns into 225.46; it lands on the nearest load that
   * exists here, never on nothing.
   */
  const loadIn = (value: number, from: LoadUnit) => {
    if (from === unit) return value;
    const converted = convertLoad(value, from, unit);
    const known = ladder?.known ?? [];
    if (known.length > 0)
      return known.reduce((best, load) =>
        Math.abs(load - converted) < Math.abs(best - converted) ? load : best,
      );
    if (!(weightStep > 0) || converted <= 0) return converted;
    const snapped = Math.round(converted / weightStep) * weightStep;
    return Math.max(weightStep, Math.round(snapped * 100) / 100);
  };
  const normalize = (performance: ComparablePerformance): ComparablePerformance | null =>
    performance.sets.some((set) => set.weight !== null && !canConvertLoad(set.unit, unit))
      ? null
      : {
          ...performance,
          sets: performance.sets.map((set) =>
            canConvertLoad(set.unit, unit)
              ? { ...set, unit, weight: set.weight === null ? null : loadIn(set.weight, set.unit) }
              : set,
          ),
        };
  const scope = comparisonScope(input.exercise.loadPortability);
  const now = input.asOf ?? new Date();
  // Free weights and bodyweight are the same lift at any gym, on whichever bar or none was
  // registered there; only a machine's numbers are its own (ADR 0006 §5).
  const comparable = input.history
    .filter((h) => scope === "exercise" || h.equipmentInstanceId === (input.equipment?.id ?? null))
    .map(normalize)
    .filter((item) => item !== null);
  const history = comparable.filter(
    (h) => h.performedAt.getTime() >= now.getTime() - TRAINING_POLICY.trendDays * 86_400_000,
  );
  // Last time is last time, however long ago it was.
  const previous = comparable[0] ?? null;
  const sameSlot = input.slotLineageId
    ? history.filter((h) => h.plannedSlotLineageId === input.slotLineageId)
    : [];
  let basisHistory = sameSlot.length > 0 ? sameSlot : history;
  // On a split squat or a pull-up the curve runs through the body as well as what is added to
  // it, so a dumbbell step is read as the small step it is (ADR 0040).
  const body = bodyLoad(input.exercise, input.bodyWeightKg, unit);
  const prescribe = (from: ComparablePerformance | null) => {
    const prescription = prescriptionFor(input.planned, input.exercise, from, weightStep, unit);
    if (prescription) {
      // Explicit programme increments, like library defaults, are specified in kilograms.
      prescription.loadIncrement = prescribedIncrement(input.planned, weightStep, unit);
      prescription.ladder = ladder;
      prescription.requireKnownLoads = input.locationKind === "home";
      if (body > 0) prescription.bodyLoad = body;
    }
    return prescription;
  };
  const decisions = (input.changes ?? []).flatMap((record) =>
    record.changes
      .filter((change) => change.scope === `slot:${input.slotLineageId}`)
      .map((change) => ({ ...change, at: record.createdAt })),
  );
  /**
   * The working loads a session's own plan prescribed, in the unit the rule reads, with the loads
   * a temporary change asked for after it was made: that lighter session was the coach's, not a
   * lighter day of the athlete's own (ADR 0048).
   */
  const plannedLoads = (performance: ComparablePerformance) => [
    // A plan saved before units were recorded was written in the unit it is read in.
    ...(performance.planned ?? []).flatMap(({ weight, unit: from }) =>
      canConvertLoad(from ?? unit, unit) ? [loadIn(weight, from ?? unit)] : [],
    ),
    ...decisions.flatMap((change) =>
      change.kind === "temporary" &&
      performance.performedAt > change.at &&
      change.unit &&
      canConvertLoad(change.unit, unit)
        ? (change.after.loads ?? []).map((item) => convertLoad(item.load, change.unit!, unit))
        : [],
    ),
  ];
  // A performance is read as it was trained, as the coach's evidence reads it (ADR 0038): the
  // warm-up in front of the work as warm-ups, whatever they were logged as, and a back-off after
  // it as a back-off; and a bodyweight set saved without a load as the body alone. Only what the
  // rule decides from is read this way; `previous` is returned as it was logged, because that is
  // what the athlete is shown.
  const readAs = prescribe(null);
  const asTrained = (performance: ComparablePerformance) =>
    readPerformance(
      readAs ? readAddedLoad(performance.sets, input.exercise, readAs) : performance.sets,
      {
        assisted: ladder?.assisted ?? false,
        planned: plannedLoads(performance),
      },
    );
  const asEvidence = (h: ComparablePerformance) => ({
    ...h,
    sets: asTrained(h),
    planned: plannedLoads(h),
    performedOn: todayInTimeZone(input.timeZone ?? "Asia/Kolkata", h.performedAt),
  });
  // A single session lighter than a load just held in the range is not where the next one
  // starts (ADR 0048): the rule builds on the session before it, as the coach's trend does.
  const provisional = prescribe(basisHistory[0] ?? null);
  const aside = provisional
    ? new Set(
        lighterSessions(provisional, basisHistory.map(asEvidence)).map((item) => item.sourceId),
      )
    : new Set<string>();
  if (aside.size > 0)
    basisHistory = basisHistory.filter((h) => !aside.has(`workout:${h.workoutSessionId}`));
  let basisPerformance = basisHistory[0] ?? null;
  // Nothing in the weeks the rule reads, but there was before them: back after a break, from
  // the last time, the same slot's first (owner decision).
  const beforeBreak = basisPerformance
    ? null
    : ((input.slotLineageId
        ? comparable.find((h) => h.plannedSlotLineageId === input.slotLineageId)
        : undefined) ??
      comparable[0] ??
      null);
  if (beforeBreak) basisPerformance = beforeBreak;
  let basis: SuggestionBasis = basisPerformance
    ? scope === "equipment_instance"
      ? "same_equipment"
      : "exercise"
    : "none";
  if (
    !basisPerformance &&
    scope === "equipment_instance" &&
    input.equipment &&
    input.elsewhere &&
    // This machine's own session is its history, never a guess from another machine.
    input.elsewhere.equipmentInstanceId !== input.equipment.id
  ) {
    basisPerformance = normalize(input.elsewhere);
    if (basisPerformance) basis = "other_equipment";
  }
  const prescription = prescribe(basisPerformance);
  const evidenceHistory = basisHistory.map(asEvidence);
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
  // What an accepted change was already made on earns nothing twice. The engine still sees it,
  // because a step that did not hold goes back to a load from before the change.
  const spent = new Set(
    evidenceHistory
      .filter((h) => !freshHistory.includes(h))
      .map((h) => `workout:${h.workoutSessionId}`),
  );
  let suggestion = !prescription
    ? null
    : beforeBreak
      ? afterBreak(prescription, asTrained(beforeBreak), basis)
      : suggestNext(
          prescription,
          basisPerformance ? asTrained(basisPerformance) : null,
          basis,
          freshHistory,
          { full: evidenceHistory, spent },
        );
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
      const old = workingSets(asTrained(original)).find((item) => item.setIndex === set.setIndex);
      return (
        old?.weight != null &&
        old.weight > 0 &&
        set.weight != null &&
        difficultyChange(ladder, old.weight, set.weight) >
          harderAllowance(
            TRAINING_POLICY.maxCumulativeLoadIncrease,
            old.weight,
            prescriptionLadder(prescription!),
            TRAINING_POLICY.maxCumulativeLoadSteps,
          ) +
            1e-9
      );
    })
  )
    suggestion = {
      ...suggestion,
      kind: "hold",
      reason: "Combined load increases over 14 days need review.",
      advice: "Repeat the current load until the coach reviews the recent progression.",
      sets: asTrained(basisPerformance).map((set) => ({
        ...set,
        rir: prescription?.rirMin ?? null,
      })),
    };
  const lastLoadDecision = decisions
    .filter(
      (change) =>
        change.exerciseSlug === input.exerciseSlug &&
        // A free weight's decision holds wherever the lift is done, as its history does.
        (scope === "exercise" || change.equipmentId === (input.equipment?.id ?? null)) &&
        change.unit &&
        canConvertLoad(change.unit, unit) &&
        (change.before.loads?.length || change.after.loads?.length),
    )
    .at(-1);
  // The loads a decision set are where the next session starts: the ones it moved to, or the
  // baseline a temporary session keeps. Only that next session. Once the athlete has trained
  // since, the rule goes on from what they did, as it does everywhere else; otherwise any step
  // the rule takes afterwards, up or back, would be pulled back to the decision's loads.
  const since = lastLoadDecision
    ? basisHistory.filter((h) => h.performedAt > lastLoadDecision.at).length
    : 0;
  // Back after a break, the baseline a temporary session kept is from before it, and the lighter
  // return stands; a lasting change made since still sets where the next session starts.
  const referenceLoads =
    lastLoadDecision?.kind === "temporary"
      ? since <= 1 && !beforeBreak
        ? lastLoadDecision.before.loads
        : undefined
      : since === 0
        ? lastLoadDecision?.after.loads
        : undefined;
  const currentWorking = basisPerformance ? workingSets(asTrained(basisPerformance)) : [];
  if (
    suggestion &&
    prescription &&
    referenceLoads?.some(
      (load) => currentWorking[load.index]?.weight !== loadIn(load.load, lastLoadDecision!.unit!),
    )
  ) {
    const temporary = lastLoadDecision!.kind === "temporary";
    suggestion = {
      ...suggestion,
      kind: "hold",
      reason: temporary
        ? "Return to the retained baseline after the temporary session; reassess current readiness."
        : "Start from the loads the coach's last accepted change set.",
      advice: temporary
        ? "A lighter session does not permanently lower the plan. Report current recovery before training."
        : "The rule goes on from what you log here.",
      sets: suggestion.sets.map((set) => {
        const index = currentWorking.findIndex((item) => item.setIndex === set.setIndex);
        const load = referenceLoads.find((item) => item.index === index);
        return load
          ? {
              ...set,
              weight: loadIn(load.load, lastLoadDecision!.unit!),
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
      sets: asTrained(basisPerformance).map((set) => ({
        ...set,
        rir: prescription?.rirMin ?? null,
      })),
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

/**
 * The jump a prescription's load moves by, in `unit`: the programme's own increment, else
 * `weightStep`. Explicit programme increments, like library defaults, are specified in
 * kilograms, so in pounds each is the plate jump nearest it, whether or not a machine is
 * registered.
 */
export function prescribedIncrement(
  planned: RulePrescription | null,
  weightStep: number,
  unit: LoadUnit,
): number {
  const rule = planned?.progressionRule;
  const increment =
    (rule && "loadIncrement" in rule ? rule.loadIncrement : null) ?? planned?.loadIncrement;
  if (increment == null) return weightStep;
  return unit === "lb" ? loadStepIn(increment, unit) : increment;
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
    // A library RIR between two whole reps (1.5) is the two it sits between, as the screen says
    // it: nobody logs half a rep in reserve, and a target of 1.5 was never reached exactly.
    rirMin: exercise.defaultRir === null ? null : Math.floor(exercise.defaultRir),
    rirMax: exercise.defaultRir === null ? null : Math.ceil(exercise.defaultRir),
    rule:
      measure === "reps"
        ? { kind: "double_progression", loadIncrement: null }
        : { kind: "time_first" },
    loadIncrement: weightStep,
    unit,
  };
}
