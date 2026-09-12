import type { LoadUnit, PrescriptionType, ProgressionRule, SetType } from "./types";

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
};

export type PerformedSet = {
  setIndex: number;
  setType: SetType;
  weight: number | null;
  reps: number | null;
  rir: number | null;
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
    const lighter = Math.max(0, round((worse.weight ?? 0) - inc));
    return base(
      "repeat",
      basis,
      `Set ${worse.setIndex} was ${worse.rir} RIR against a ${targetRir} RIR plan`,
      `Or drop to ${lighter} ${p.unit}`,
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

function forTime(
  p: Prescription,
  previous: readonly PerformedSet[],
  working: readonly PerformedSet[],
  basis: SuggestionBasis,
): ProgressionSuggestion {
  const inc = p.loadIncrement;
  const targetRir = p.rirMin;
  const max = p.durationMaxSeconds;
  const min = p.durationMinSeconds;
  const first = working[0];
  if (!first) throw new Error("forTime needs at least one working set");
  const atMax = (s: PerformedSet) =>
    max !== null &&
    s.durationSeconds !== null &&
    s.durationSeconds >= max &&
    rirSatisfied(s, targetRir);

  if (max !== null && working.length >= p.sets && working.every(atMax)) {
    return base(
      "hold",
      basis,
      `Every set held ${max} s${targetRir === null ? "" : ` at ≥${targetRir} RIR`}`,
      `Time is maxed; add load (e.g. ${inc} ${p.unit}) and drop back to ${min ?? max} s when you want more`,
      inc,
      copy(previous),
    );
  }

  if (min !== null && first.durationSeconds !== null && first.durationSeconds < min) {
    return base(
      "repeat",
      basis,
      `First set stopped at ${first.durationSeconds} s, below the ${min} s minimum`,
      null,
      inc,
      copy(previous),
    );
  }

  const worse = working.find((s) => muchWorseRir(s, targetRir));
  if (worse) {
    return base(
      "repeat",
      basis,
      `Set ${worse.setIndex} was ${worse.rir} RIR against a ${targetRir} RIR plan`,
      null,
      inc,
      copy(previous),
    );
  }

  const sets = copy(previous).map((s) =>
    WORKING_SET_TYPES.has(s.setType) && s.durationSeconds !== null
      ? {
          ...s,
          durationSeconds:
            max === null
              ? s.durationSeconds + TIME_STEP_SECONDS
              : Math.min(max, s.durationSeconds + TIME_STEP_SECONDS),
        }
      : s,
  );
  return base(
    "extend",
    basis,
    `Add ${TIME_STEP_SECONDS} s per set${max === null ? "" : ` up to ${max} s`}`,
    null,
    inc,
    sets,
  );
}

/**
 * Carries and sled work: cover the distance before you add the load.
 *
 * Same shape as the timed rule, in metres. A carry has no reps to leave in reserve, so RIR is
 * read as ground left rather than repetitions left, and the rule never asks for one more step
 * once the planned distance is being covered at the planned quality.
 */
function forDistance(
  p: Prescription,
  previous: readonly PerformedSet[],
  working: readonly PerformedSet[],
  basis: SuggestionBasis,
): ProgressionSuggestion {
  const inc = p.loadIncrement;
  const targetRir = p.rirMin;
  const max = p.distanceMaxMeters;
  const min = p.distanceMinMeters;
  const first = working[0];
  if (!first) throw new Error("forDistance needs at least one working set");
  const atMax = (s: PerformedSet) =>
    max !== null &&
    s.distanceMeters !== null &&
    s.distanceMeters >= max &&
    rirSatisfied(s, targetRir);

  if (max !== null && working.length >= p.sets && working.every(atMax)) {
    return base(
      "increase",
      basis,
      `Every set covered ${max} m${targetRir === null ? "" : ` at ≥${targetRir} RIR`}`,
      `Distance is maxed; add ${inc} ${p.unit} per hand and drop back to ${min ?? max} m`,
      inc,
      shiftLoad(previous, inc, p).map((s) => ({ ...s, distanceMeters: min ?? s.distanceMeters })),
    );
  }

  if (min !== null && first.distanceMeters !== null && first.distanceMeters < min) {
    return base(
      "repeat",
      basis,
      `First carry stopped at ${first.distanceMeters} m, short of the ${min} m minimum`,
      null,
      inc,
      copy(previous),
    );
  }

  const worse = working.find((s) => muchWorseRir(s, targetRir));
  if (worse) {
    return base(
      "repeat",
      basis,
      `Set ${worse.setIndex} was ${worse.rir} RIR against a ${targetRir} RIR plan`,
      null,
      inc,
      copy(previous),
    );
  }

  const sets = copy(previous).map((s) =>
    WORKING_SET_TYPES.has(s.setType) && s.distanceMeters !== null
      ? {
          ...s,
          distanceMeters:
            max === null
              ? s.distanceMeters + DISTANCE_STEP_METERS
              : Math.min(max, s.distanceMeters + DISTANCE_STEP_METERS),
        }
      : s,
  );
  return base(
    "lengthen",
    basis,
    `Add ${DISTANCE_STEP_METERS} m per carry${max === null ? "" : ` up to ${max} m`}`,
    null,
    inc,
    sets,
  );
}

/**
 * What to do next for one exercise. `previous` is the basis performance (same machine for
 * machine work, any gym for free weights) or a different-machine guess when `basis` says so.
 */
export function suggestNext(
  prescription: Prescription,
  previous: readonly PerformedSet[] | null,
  basis: SuggestionBasis,
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
      "Different machine last time, so this is a starting guess",
      "Adjust by feel and log honest RIR; the rule starts once this machine has history",
      inc,
      copy(previous),
    );
  }
  switch (prescription.prescriptionType) {
    case "duration":
      return forTime(prescription, previous, working, basis);
    case "distance":
      return forDistance(prescription, previous, working, basis);
    default:
      return forReps(prescription, previous, working, basis);
  }
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
