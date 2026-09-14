import type { LoadUnit, PrescriptionType, ProgressionRule, SetType } from "./types";
import {
  summarizeExerciseEvidence,
  TRAINING_POLICY,
  type EvidencePerformance,
} from "./training-evidence";

/**
 * Deterministic progression engine (Phase 5).
 *
 * Given today's prescription and the last comparable performance, it says what to do next
 * and prefills the set rows accordingly. Nothing here mutates the programme; the user can
 * always override the prefilled values, and the check-in only ever produces advice.
 */

/** Set types that count towards progression decisions. Warm-up, back-off and drop sets do not. */
export const WORKING_SET_TYPES: ReadonlySet<SetType> = new Set<SetType>([
  "working",
  "amrap",
  "failure",
]);

/** Seconds added per set when a timed hold is progressing. */
export const TIME_STEP_SECONDS = 5;

/** Metres added per set when a carry is progressing. */
export const DISTANCE_STEP_METERS = 5;

/** An achieved RIR this far below the planned minimum (or hitting failure) counts as much worse. */
export const RIR_MUCH_WORSE_GAP = 2;

export type Prescription = {
  sets: number;
  prescriptionType: PrescriptionType;
  repMin: number | null;
  repMax: number | null;
  durationMinSeconds: number | null;
  durationMaxSeconds: number | null;
  distanceMinMeters: number | null;
  distanceMaxMeters: number | null;
  /** Lowest RIR the plan allows; the "target" of "at or easier than target". */
  rirMin: number | null;
  rirMax: number | null;
  rule: ProgressionRule | null;
  /** Smallest load jump for this exercise on this equipment, already resolved. */
  loadIncrement: number;
  unit: LoadUnit;
  availableLoads?: readonly number[];
  requireConfirmedLoads?: boolean;
};

export type PerformedSet = {
  setIndex: number;
  setType: SetType;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe?: number | null;
  effortReported?: boolean;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

/**
 * Where the basis performance comes from.
 * - `same_equipment`: this machine (the only valid comparison for machine work).
 * - `exercise`: free weights or bodyweight, comparable across gyms.
 * - `other_equipment`: a different machine; a starting guess only, never a progression basis.
 * - `none`: nothing comparable yet.
 */
export type SuggestionBasis = "same_equipment" | "exercise" | "other_equipment" | "none";

export type SuggestionKind =
  | "increase"
  | "hold"
  | "repeat"
  | "reduce"
  | "extend"
  /** A carry that should cover more ground before it takes more load. */
  | "lengthen"
  | "transfer"
  | "start"
  /** Targets written by the AI coach's plan for this session, in place of the rule's. */
  | "coach";

export type TargetSet = {
  setIndex: number;
  setType: SetType;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe?: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type ProgressionSuggestion = {
  kind: SuggestionKind;
  basis: SuggestionBasis;
  /** Plain-words reason, e.g. "All 3 sets hit 10 at ≥1 RIR last time". */
  reason: string;
  /** Extra advice that does not change the prefill. */
  advice: string | null;
  loadIncrement: number;
  /** Prefill per set index of the basis performance; empty when there is nothing to prefill. */
  sets: TargetSet[];
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function workingSets(sets: readonly PerformedSet[]): PerformedSet[] {
  return sets
    .filter((s) => WORKING_SET_TYPES.has(s.setType))
    .sort((a, b) => a.setIndex - b.setIndex);
}

function copy(sets: readonly PerformedSet[]): TargetSet[] {
  return sets.map((s) => ({
    setIndex: s.setIndex,
    setType: s.setType,
    weight: s.weight,
    reps: s.reps,
    rir: s.rir,
    rpe: s.rpe,
    durationSeconds: s.durationSeconds,
    distanceMeters: s.distanceMeters,
  }));
}

/** Shifts the load of every working set; reps and RIR reset to the plan's floor. */
function shiftLoad(
  sets: readonly PerformedSet[],
  delta: number,
  prescription: Prescription,
): TargetSet[] {
  return copy(sets).map((s) =>
    WORKING_SET_TYPES.has(s.setType)
      ? {
          ...s,
          weight: Math.max(0, round((s.weight ?? 0) + delta)),
          reps: prescription.repMin ?? s.reps,
          rir: prescription.rirMin ?? s.rir,
        }
      : s,
  );
}

function label(weight: number | null, unit: LoadUnit): string {
  return weight === null ? "the same load" : `${weight} ${unit}`;
}

function muchWorseRir(set: PerformedSet, targetRir: number | null): boolean {
  if (targetRir === null || set.rir === null) return false;
  return set.rir <= targetRir - RIR_MUCH_WORSE_GAP || (set.rir === 0 && targetRir >= 1);
}

function rirSatisfied(set: PerformedSet, targetRir: number | null): boolean {
  return targetRir === null || (set.rir !== null && set.rir >= targetRir);
}

function base(
  kind: SuggestionKind,
  basis: SuggestionBasis,
  reason: string,
  advice: string | null,
  loadIncrement: number,
  sets: TargetSet[],
): ProgressionSuggestion {
  return { kind, basis, reason, advice, loadIncrement, sets };
}

function forReps(
  p: Prescription,
  previous: readonly PerformedSet[],
  working: readonly PerformedSet[],
  basis: SuggestionBasis,
): ProgressionSuggestion {
  const inc = p.loadIncrement;
  const targetRir = p.rirMin;
  const repsNeeded = p.rule?.kind === "conservative_strength" ? p.rule.repsRequired : p.repMax;
  const first = working[0];
  if (!first) throw new Error("forReps needs at least one working set");
  const hit = (s: PerformedSet) =>
    repsNeeded !== null && s.reps !== null && s.reps >= repsNeeded && rirSatisfied(s, targetRir);
  const enoughSets = working.length >= p.sets;
  const rirText = targetRir === null ? "" : ` at ≥${targetRir} RIR`;

  if (repsNeeded !== null && enoughSets && working.every(hit)) {
    const strength = p.rule?.kind === "conservative_strength";
    return base(
      "increase",
      basis,
      `All ${working.length} sets hit ${repsNeeded}${rirText} last time`,
      strength ? "Conservative jump: stay shy of failure and keep the RIR honest" : null,
      inc,
      shiftLoad(previous, inc, p),
    );
  }

  if (p.repMin !== null && first.reps !== null && first.reps < p.repMin) {
    return base(
      "reduce",
      basis,
      `First set stopped at ${first.reps}, below the ${p.repMin} minimum`,
      `Or repeat ${label(first.weight, p.unit)} and aim for ${p.repMin}+`,
      inc,
      shiftLoad(previous, -inc, p),
    );
  }

  const worse = working.find((s) => muchWorseRir(s, targetRir));
  if (worse) {
    return base(
      "repeat",
      basis,
      `Set ${worse.setIndex} was ${worse.rir} RIR against a ${targetRir} RIR plan`,
      "Keep the baseline and reassess the next comparable session; one harder set is not a persistent decline.",
      inc,
      copy(previous),
    );
  }

  let reason: string;
  if (!enoughSets) {
    reason = `Only ${working.length} of ${p.sets} sets logged last time`;
  } else if (repsNeeded === null) {
    reason = "Keep the load and add reps";
  } else if (working.some((s) => s.reps !== null && s.reps >= repsNeeded && s.rir === null)) {
    reason = `Reps are there; log RIR on every set to unlock the next jump`;
  } else {
    const hits = working.filter(hit).length;
    reason = `${hits} of ${working.length} sets at ${repsNeeded}${rirText}; add reps before load`;
  }
  return base("hold", basis, reason, null, inc, copy(previous));
}

/**
 * What to do next for one exercise. `previous` is the basis performance (same machine for
 * machine work, any gym for free weights) or a different-machine guess when `basis` says so.
 */
export function suggestNext(
  prescription: Prescription,
  previous: readonly PerformedSet[] | null,
  basis: SuggestionBasis,
  history: readonly EvidencePerformance[] = [],
): ProgressionSuggestion {
  const inc = prescription.loadIncrement;
  if (!previous || basis === "none") {
    return base("start", "none", "No comparable history yet", null, inc, []);
  }
  const working = workingSets(previous);
  if (working.length === 0) {
    return base("start", basis, "No working sets logged last time", null, inc, []);
  }
  if (basis === "other_equipment") {
    return base(
      "transfer",
      basis,
      "This machine needs its own starting load",
      "Calibrate with an available load and report actual effort. Loads on different machines are not equivalent.",
      inc,
      copy(previous).map((set) => ({ ...set, weight: null })),
    );
  }
  const evidence = summarizeExerciseEvidence(prescription, history);
  const hold = (reason: string, advice: string | null = null) =>
    base(
      "hold",
      basis,
      reason,
      advice,
      inc,
      copy(previous).map((set) => ({
        ...set,
        rir: prescription.prescriptionType === "reps" ? prescription.rirMin : null,
        rpe: prescription.prescriptionType === "reps" ? undefined : null,
        reps:
          set.reps === null || prescription.repMin === null
            ? set.reps
            : Math.max(prescription.repMin, set.reps),
      })),
    );
  let candidate: ProgressionSuggestion;
  if (prescription.prescriptionType !== "reps") {
    if (!evidence.repeatedCompletion)
      return hold(
        "Repeat the target until two comparable sessions meet it with reported effort.",
        "Log RPE for timed sets and carries; RIR counts repetitions only.",
      );
    const max =
      prescription.prescriptionType === "duration"
        ? prescription.durationMaxSeconds
        : prescription.distanceMaxMeters;
    const field =
      prescription.prescriptionType === "duration" ? "durationSeconds" : "distanceMeters";
    if (evidence.progressionReady)
      return hold(
        "The upper target was met twice.",
        "Review a feasible load or exercise variation before increasing beyond this range.",
      );
    return base(
      prescription.prescriptionType === "duration" ? "extend" : "lengthen",
      basis,
      "Two comparable sessions met the target with suitable effort.",
      null,
      inc,
      copy(previous).map((set) =>
        !WORKING_SET_TYPES.has(set.setType)
          ? set
          : {
              ...set,
              rir: null,
              rpe: null,
              [field]:
                set[field] === null
                  ? null
                  : Math.min(
                      max ?? Infinity,
                      set[field]! + Math.min(5, Math.max(1, Math.floor(set[field]! * 0.1))),
                    ),
            },
      ),
    );
  }
  candidate = forReps(prescription, previous, working, basis);
  if (candidate.kind === "reduce" && !evidence.declineCandidate)
    return hold(
      "One low performance does not lower the baseline.",
      "Repeat the planned range and check effort, rest and why the set stopped. A persistent reduction needs repeated comparable evidence.",
    );
  if (candidate.kind === "increase" && !evidence.progressionReady)
    return hold("Confirm the upper rep target in two comparable sessions before increasing load.");
  if (candidate.kind === "hold" && evidence.repeatedCompletion && prescription.repMax !== null)
    return {
      ...candidate,
      reason: "Two comparable sessions met the target; add one rep within the range.",
      sets: copy(previous).map((set) =>
        WORKING_SET_TYPES.has(set.setType) && set.reps !== null
          ? { ...set, reps: Math.min(prescription.repMax!, set.reps + 1), rir: prescription.rirMin }
          : set,
      ),
    };
  if (candidate.kind === "increase" || candidate.kind === "reduce") {
    const direction = candidate.kind === "increase" ? 1 : -1;
    const targetSets = candidate.sets.map((set) => {
      const old = working.find((item) => item.setIndex === set.setIndex);
      if (!old || old.weight == null || old.weight <= 0) return set;
      const loads = [...(prescription.availableLoads ?? [])].sort((a, b) => a - b);
      const selectable =
        direction > 0
          ? loads.find((load) => load > old.weight!)
          : loads.filter((load) => load < old.weight!).pop();
      return selectable === undefined ? set : { ...set, weight: selectable };
    });
    const invalid = targetSets.some((set) => {
      const old = working.find((item) => item.setIndex === set.setIndex);
      if (!old) return false;
      if (old.weight == null || old.weight <= 0 || set.weight == null) return true;
      const relative = Math.abs(set.weight / old.weight - 1);
      return (
        relative >
          (direction > 0 ? TRAINING_POLICY.maxLoadIncrease : TRAINING_POLICY.maxLoadReduction) +
            1e-9 ||
        (!!prescription.requireConfirmedLoads &&
          !(prescription.availableLoads ?? []).includes(set.weight))
      );
    });
    if (invalid)
      return hold(
        "Keep the current load; the next available jump needs review.",
        "Confirm available weights and the load convention. Progress reps within the range or review a feasible variation.",
      );
    candidate = { ...candidate, sets: targetSets };
  }
  return {
    ...candidate,
    sets: candidate.sets.map((set) =>
      WORKING_SET_TYPES.has(set.setType) ? { ...set, rir: prescription.rirMin } : set,
    ),
  };
}

/**
 * Comparison score for one performance: best-set estimated 1RM (Epley) for loaded sets,
 * else total working reps, else total metres carried, else total seconds held. Only used to
 * compare like with like.
 */
export function performanceScore(sets: readonly PerformedSet[]): number {
  let best = 0;
  let reps = 0;
  let seconds = 0;
  let meters = 0;
  for (const s of workingSets(sets)) {
    if (s.weight !== null && s.weight > 0 && s.reps !== null) {
      best = Math.max(best, s.weight * (1 + s.reps / 30));
    }
    reps += s.reps ?? 0;
    seconds += s.durationSeconds ?? 0;
    meters += s.distanceMeters ?? 0;
  }
  if (best > 0) return best;
  if (reps > 0) return reps;
  // A loaded carry is compared on the work done: metres at the load they were carried at.
  if (meters > 0) {
    const load = workingSets(sets).reduce((sum, s) => sum + (s.weight ?? 0), 0);
    return load > 0 ? meters * (1 + load / 100) : meters;
  }
  return seconds;
}

/** How many sessions in a row (newest first) scored below the one before them. */
export function regressionStreak(history: readonly (readonly PerformedSet[])[]): number {
  let streak = 0;
  for (let i = 0; i + 1 < history.length; i++) {
    const current = history[i];
    const earlier = history[i + 1];
    if (!current || !earlier) break;
    if (performanceScore(current) < performanceScore(earlier)) streak++;
    else break;
  }
  return streak;
}

/** Sessions in a row below the previous one before the engine warns. */
export const REGRESSION_WARNING_STREAK = 2;
