import type { LoadUnit, PrescriptionType, ProgressionRule, SetType } from "./types";
import { difficultyChange, stepEasier, stepHarder, type LoadLadder } from "./load-steps";
import {
  capacityAt,
  repCeiling,
  repTarget,
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
  /**
   * The machine's loads (ADR 0028). Absent for free weights and bodyweight, which step by
   * `loadIncrement`; a stack steps along what has been lifted on it.
   */
  ladder?: Omit<LoadLadder, "increment"> | null;
  /** At home only a load known to exist may be prescribed, never a step worked out. */
  requireKnownLoads?: boolean;
};

/** The ladder the engine steps along: the machine's, or the plain increment. */
export function prescriptionLadder(prescription: Prescription): LoadLadder {
  return {
    known: prescription.ladder?.known ?? [],
    stack: prescription.ladder?.stack ?? false,
    assisted: prescription.ladder?.assisted ?? false,
    increment: prescription.loadIncrement > 0 ? prescription.loadIncrement : null,
  };
}

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
  /** Back to the load that last worked, after a step up that missed the range twice. */
  | "revert"
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
 * The next session, read from what every set had in hand: its reps plus its reps in reserve
 * (ADR 0039). Null when the latest session does not have them all, or fell below the range,
 * and the older rule decides: one low session holds, a repeated decline goes to review.
 *
 * A rep to spare beyond the top of the range at the target effort, on the hardest set, steps
 * the load up now; exactly on target steps it up once seen twice. Inside the range the load
 * holds and each set is asked for what it had in hand. A step that missed the range twice in
 * its first three sessions goes back to the load before it. A step so coarse it would land
 * below the range waits while reps build past the top.
 */
function byCapacity(
  p: Prescription,
  previous: readonly PerformedSet[],
  working: readonly PerformedSet[],
  basis: SuggestionBasis,
  history: readonly EvidencePerformance[],
  spent: ReadonlySet<string> | undefined,
): ProgressionSuggestion | null {
  const evidence = summarizeExerciseEvidence(p, history);
  const inc = p.loadIncrement;
  const unspent = (ids: readonly string[]) => ids.length > 0 && ids.every((id) => !spent?.has(id));
  const ladder = prescriptionLadder(p);
  const targetRir = p.rirMin ?? 2;
  const top = p.rule?.kind === "conservative_strength" ? p.rule.repsRequired : p.repMax;
  const order = new Map(working.map((set, index) => [set.setIndex, index]));
  const onWork = (map: (set: TargetSet, index: number) => TargetSet) =>
    copy(previous).map((set) =>
      WORKING_SET_TYPES.has(set.setType) ? map(set, order.get(set.setIndex) ?? -1) : set,
    );

  const revert = evidence.revert;
  if (revert && unspent(revert.evidenceIds)) {
    const reps =
      top === null || revert.capacity === null
        ? top
        : Math.max(p.repMin ?? 1, Math.min(top, revert.capacity - targetRir));
    return base(
      "revert",
      basis,
      `${label(evidence.comparison.load, p.unit)} missed the range twice: back to ${label(revert.load, p.unit)}.`,
      "The last weight that worked. The step is tried again after two sessions at the top of the range.",
      inc,
      onWork((set, index) => ({
        ...set,
        weight: revert.loads[index] ?? revert.load,
        reps: reps ?? set.reps,
        rir: p.rirMin,
      })),
    );
  }
  if (evidence.readiness === "unknown" || evidence.readiness === "below") return null;

  const first = working.find((set) => set.weight != null && set.weight > 0);
  const next = first ? stepHarder(ladder, first.weight!) : null;
  const ceiling =
    repCeiling(
      p,
      first?.weight ?? null,
      next && !(p.requireKnownLoads && next.source !== "known") ? next.load : null,
      ladder.assisted,
    ) ?? Infinity;
  const coarse = top !== null && ceiling > top;
  // Two sessions in the range at the target effort add a rep where nothing was left in hand.
  const nudge = evidence.repeatedCompletion && unspent(evidence.evidenceIds);
  const aim = (set: TargetSet) => {
    const target = repTarget(set, targetRir, ceiling);
    if (target === null || set.reps === null) return set.reps;
    return nudge && target <= set.reps ? Math.min(ceiling, set.reps + 1) : target;
  };
  /** The same load, each set asked for what it had in hand at the target effort. */
  const build = (kind: SuggestionKind, reason: string, advice: string | null = null) =>
    base(
      kind,
      basis,
      reason,
      advice,
      inc,
      onWork((set) => ({ ...set, reps: aim(set), rir: p.rirMin })),
    );

  if (evidence.loadReady && unspent(evidence.stepEvidenceIds)) {
    if (working.every((set) => set.weight === 0))
      return build(
        "hold",
        "Every set had a rep to spare at the top of the range.",
        "Bodyweight has no next weight here: add load you can measure, a vest or a plate, and log it, or ask the coach for a harder variation.",
      );
    let unknown = false,
      short = false;
    const stepped = onWork((set) => {
      if (set.weight == null || set.weight <= 0) {
        unknown = true;
        return set;
      }
      const step = stepHarder(ladder, set.weight);
      if (!step || (p.requireKnownLoads && step.source !== "known")) {
        unknown = true;
        return set;
      }
      const inHand = set.reps != null && set.rir != null ? set.reps + set.rir : null;
      const after =
        inHand === null || ladder.assisted ? null : capacityAt(inHand, set.weight, step.load);
      if (after !== null && p.repMin != null && after < p.repMin + targetRir - 1e-9) short = true;
      // What the set should have in hand at the new load, asked for at the target effort.
      const reps =
        after === null
          ? (p.repMin ?? set.reps)
          : Math.max(
              p.repMin ?? 1,
              Math.min(top ?? Infinity, Math.floor(after - targetRir + 1e-9)),
            );
      return { ...set, weight: step.load, reps, rir: p.rirMin };
    });
    if (unknown)
      return build(
        "hold",
        p.requireKnownLoads
          ? "Keep the current load; the next one is not a weight you have listed for this machine."
          : "Keep the current load; the next weight on this machine is not known yet.",
        p.ladder?.stack
          ? "Enter the next weight up under the exercise once your sets are done, or add reps within the range."
          : "Add reps within the range, or list the weights this equipment has.",
      );
    if (!short)
      return base(
        "increase",
        basis,
        evidence.loadReady === "spare"
          ? "Every set had a rep to spare at the top of the range."
          : "On target at the top of the range two sessions running.",
        null,
        inc,
        stepped,
      );
    return build(
      "hold",
      "The next weight on this machine is a big jump.",
      `Build to ${ceiling} reps at this weight first, so the step lands inside the range.`,
    );
  }

  const worse = working.find((set) => muchWorseRir(set, p.rirMin));
  if (worse && evidence.readiness === "building")
    return build(
      "repeat",
      `Set ${worse.setIndex} was ${worse.rir} RIR against a ${p.rirMin} RIR plan`,
      "Keep the baseline and reassess the next comparable session; one harder set is not a persistent decline.",
    );
  if (evidence.readiness === "building")
    return build(
      "hold",
      working.some((set) => (repTarget(set, targetRir, ceiling) ?? 0) > (set.reps ?? 0))
        ? "Same weight: aim for the reps you had in hand last time."
        : nudge
          ? "Two comparable sessions met the target; add one rep within the range."
          : "Same weight: reps build before load.",
    );
  const latest = evidence.observations[0]?.sourceId;
  if (latest && !unspent([latest]))
    return build("hold", "Same weight: this session already earned the last change.");
  if (coarse)
    return build(
      "hold",
      "The next weight on this machine is a big jump.",
      `Build to ${ceiling} reps at this weight first, so the step lands inside the range.`,
    );
  return evidence.readiness === "spare"
    ? build(
        "hold",
        "A rep to spare, but the step above this weight didn't hold last time.",
        "Show it once more at this weight first.",
      )
    : build(
        "hold",
        "On target at the top of the range.",
        "Repeat it once more and the weight goes up.",
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
  history: readonly EvidencePerformance[] = [],
  options: {
    /**
     * Every comparable session, including those an earlier change already spent. A step that
     * did not hold is read from here, because the load it goes back to came before the step.
     */
    full?: readonly EvidencePerformance[];
    /** Source IDs an accepted change has already been made on: they earn nothing twice. */
    spent?: ReadonlySet<string>;
  } = {},
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
  const decided = byCapacity(
    prescription,
    previous,
    working,
    basis,
    options.full ?? history,
    options.spent,
  );
  if (decided) return decided;
  // Sessions without every set's reps in reserve keep the rule they were logged under.
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
    // One real step along the machine's own loads: the next stop on a stack, the typed jump
    // on plates and free weights. Every working set moves one stop from where it was, so a
    // pyramid stays a pyramid, and an assisted machine gets harder by giving less help.
    const harder = candidate.kind === "increase";
    const ladder = prescriptionLadder(prescription);
    let unknown = false;
    let tooFar = false;
    const targetSets = candidate.sets.map((set) => {
      const old = working.find((item) => item.setIndex === set.setIndex);
      if (!old) return set;
      if (old.weight == null || old.weight <= 0) {
        unknown = true;
        return set;
      }
      const step = harder ? stepHarder(ladder, old.weight) : stepEasier(ladder, old.weight);
      if (!step || (prescription.requireKnownLoads && step.source !== "known")) {
        unknown = true;
        return set;
      }
      if (
        !harder &&
        -difficultyChange(ladder, old.weight, step.load) > TRAINING_POLICY.maxLoadReduction + 1e-9
      )
        tooFar = true;
      return { ...set, weight: step.load };
    });
    if (unknown)
      return hold(
        prescription.requireKnownLoads
          ? "Keep the current load; the next one is not a weight you have listed for this machine."
          : "Keep the current load; the next weight on this machine is not known yet.",
        prescription.ladder?.stack
          ? "Enter the next weight up under the exercise once your sets are done, or add reps within the range."
          : "Add reps within the range, or list the weights this equipment has.",
      );
    if (tooFar)
      return hold(
        "Keep the current load; the next lighter step is more than the automatic cut.",
        "Repeat the planned range; a larger reduction needs a coach review.",
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
