import type { PerformedSet, Prescription } from "./progression";
import type { LoadUnit, SetType } from "./types";
import { canConvertLoad, convertLoad } from "@/lib/units";

/** Versioned product limits to evaluate, not physiological optima or injury guarantees. */
export const TRAINING_POLICY = {
  version: "2026-09-27",
  detailDays: 7,
  trendDays: 56,
  /**
   * Sessions a programme change, an endurance step, or a load step that was exactly on target
   * must be seen in. A session with a rep to spare needs only itself (ADR 0039).
   */
  confirmationExposures: 2,
  /** Reps beyond the top of the range at the target effort that earn a load step at once. */
  spareReps: 1,
  /** A new load that misses the range this often in its first sessions goes back one step. */
  revertMisses: 2,
  revertWindow: 3,
  /** Only sets this close to failure estimate a maximum: past it the curve is a guess. */
  estimateMaxReps: 12,
  recentExposures: 3,
  referenceExposures: 3,
  minimumRelativeChange: 0.05,
  noiseMultiplier: 2,
  maxLoadIncrease: 0.05,
  maxLoadReduction: 0.1,
  maxCumulativeLoadIncrease: 0.1,
  /** Real steps the 14-day brake always allows, however coarse they are. */
  maxCumulativeLoadSteps: 2,
  maxCumulativeLoadReduction: 0.15,
  maxExerciseSetChange: 0.25,
  maxTotalSetChange: 0.2,
  maxRunChange: 0.1,
  /** Reps a target may gain in one session on repeated completion; a decline still cuts one. */
  maxRepIncrease: 2,
  cumulativeDays: 14,
} as const;

export type EvidencePerformance = {
  workoutExerciseId: string;
  workoutSessionId: string;
  performedAt: Date;
  /** Local date, when available. Same-day sets/bouts are one confirmation occasion. */
  performedOn?: string;
  /**
   * `loggedAs` is set on a set read as something other than what it was logged as: a warm-up
   * ramp logged as working sets, read as the warm-up it was (warmup-ramp.ts).
   */
  sets: readonly (PerformedSet & { unit?: LoadUnit; loggedAs?: SetType })[];
};
export type ReferenceEvidence = {
  values: number[];
  sourceIds: string[];
  establishedAt: string;
};

/**
 * Where a performance leaves its load, read from the hardest working set's reps plus reps in
 * reserve — how many it could have done — against the top of the range at the target effort.
 *
 * - `spare`: a rep beyond that top in hand. The load can step up now.
 * - `on_target`: exactly the top at the target. It steps up once it has been seen twice.
 * - `building`: inside the range. Hold the load; reps go to what was in hand.
 * - `below`: under the bottom of the range at the target effort.
 * - `unknown`: a set without its reps or reps in reserve, or not every set logged.
 */
export type Readiness = "spare" | "on_target" | "building" | "below" | "unknown";

/**
 * Reps to failure expected at `to`, from `capacity` reps to failure at `from`, along Epley's
 * curve. Good for the few percent of one load step; not a claim about anybody's maximum.
 */
export function capacityAt(capacity: number, from: number, to: number): number {
  return 30 * ((from * (1 + capacity / 30)) / to - 1);
}

/** Reps to failure needed at `from` to still have `floor` in hand after moving to `to`. */
export function capacityNeeded(floor: number, from: number, to: number): number {
  return 30 * ((to * (1 + floor / 30)) / from - 1);
}

/**
 * The most reps a set of this prescription is asked for at `load` before the load steps up.
 *
 * Normally the top of the range. When the next real step is so coarse that stepping at the top
 * would land below the bottom of the range — a 30 to 35 kg stack is a sixth of the load — the
 * set keeps building reps past the top until one step lands inside it (ADR 0039).
 */
export function repCeiling(
  p: Pick<Prescription, "repMin" | "repMax" | "rirMin" | "rule">,
  load: number | null,
  next: number | null,
  assisted = false,
): number | null {
  const top = p.rule?.kind === "conservative_strength" ? p.rule.repsRequired : p.repMax;
  if (top == null) return null;
  if (load == null || next == null || load <= 0 || next <= load || assisted || p.repMin == null)
    return top;
  const targetRir = p.rirMin ?? 2;
  const needed = capacityNeeded(p.repMin + targetRir, load, next) - targetRir;
  return Math.max(top, Math.ceil(needed - 1e-9));
}

/**
 * The reps a set is asked for next time at the same load: what it had in hand at the target
 * effort, never fewer than it did, and never past the ceiling. Without its reps in reserve it
 * is asked for what it did.
 */
export function repTarget(
  set: { reps: number | null; rir: number | null },
  targetRir: number,
  ceiling: number,
): number | null {
  if (set.reps == null) return null;
  const inHand = set.rir == null ? set.reps : set.reps + set.rir - targetRir;
  return Math.min(ceiling, Math.max(set.reps, inHand));
}

/** Two loads that are the same load, once unit conversion and rounding are allowed for. */
export function sameLoad(a: number | null, b: number | null): boolean {
  return (
    a === b || (a !== null && b !== null && Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.005))
  );
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const working = (sets: EvidencePerformance["sets"]) =>
  sets
    .filter((s) => ["working", "amrap", "failure"].includes(s.setType))
    .sort((a, b) => a.setIndex - b.setIndex);
const valueOf = (set: PerformedSet, p: Prescription) =>
  p.prescriptionType === "duration"
    ? set.durationSeconds
    : p.prescriptionType === "distance"
      ? set.distanceMeters
      : set.reps;
const effortOf = (set: PerformedSet, p: Prescription) =>
  p.prescriptionType === "reps" ? set.rir : (set.rpe ?? null);
const rangeOf = (p: Prescription) =>
  p.prescriptionType === "duration"
    ? [p.durationMinSeconds, p.durationMaxSeconds]
    : p.prescriptionType === "distance"
      ? [p.distanceMinMeters, p.distanceMaxMeters]
      : [p.repMin, p.repMax];

/** Raw matching first-set performance, with completion/effort assessed separately. */
export function summarizeExerciseEvidence(
  p: Prescription,
  input: readonly EvidencePerformance[],
  reference?: ReferenceEvidence | null,
  options: {
    /** An assisted machine: less help is harder, and no maximum is estimated from it. */
    assisted?: boolean;
  } = {},
) {
  const assisted = options.assisted ?? p.ladder?.assisted ?? false;
  const days = new Set<string>();
  const observations = [...input]
    .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
    .filter((h) => {
      const day = h.performedOn ?? h.performedAt.toISOString().slice(0, 10);
      if (days.has(day)) return false;
      days.add(day);
      return true;
    });
  const [minimum, rangeMaximum] = rangeOf(p);
  const maximum = p.rule?.kind === "conservative_strength" ? p.rule.repsRequired : rangeMaximum;
  const reps = p.prescriptionType === "reps";
  /** The effort the plan asks for at the hardest; what "on target" is measured against. */
  const targetRir = p.rirMin ?? 2;
  const base = observations.map((h) => {
    const sets = working(h.sets);
    const first = sets[0];
    const validUnit = first?.weight == null || !first.unit || canConvertLoad(first.unit, p.unit);
    const load =
      first?.weight == null
        ? null
        : validUnit
          ? convertLoad(first.weight, first.unit ?? p.unit, p.unit)
          : null;
    const effort = first ? effortOf(first, p) : null;
    const selected = sets.slice(0, p.sets);
    const loadProfile = selected.map((set) =>
      set.weight == null
        ? null
        : canConvertLoad(set.unit ?? p.unit, p.unit)
          ? convertLoad(set.weight, set.unit ?? p.unit, p.unit)
          : NaN,
    );
    const complete = selected.length === p.sets;
    /**
     * Whether there is an effort number to compare at all, and whether the app recorded that
     * the athlete entered it.
     *
     * These are two different facts and were one. `effortReported` is false by default on
     * every row written before the app recorded the answer, so it means "nobody wrote down
     * where this came from" — not "this was copied from the target". Treating the two as the
     * same excluded a real logged RIR from every comparison, which left an exercise on
     * insufficient evidence for as long as its history was old, and the athlete reading that
     * the effort they remember giving had been copied from the prescription.
     */
    const effortPresent = complete && selected.every((set) => effortOf(set, p) !== null);
    const effortConfirmed = effortPresent && selected.every((set) => set.effortReported !== false);
    const effortFits =
      effortPresent &&
      selected.every((set) =>
        p.prescriptionType === "reps" ? set.rir! >= (p.rirMin ?? 2) : (set.rpe ?? 11) <= 8,
      );
    // What each set could have done: its reps plus the reps it had in reserve.
    const inHand = selected.map((set) =>
      reps && set.reps != null && set.rir != null ? set.reps + set.rir : null,
    );
    const known = inHand.filter((value): value is number => value !== null);
    // The hardest set is the one that limits a prescription of straight sets.
    const capacity = complete && known.length === selected.length ? Math.min(...known) : null;
    // A maximum is only estimated from sets close enough to failure for the curve to hold, on
    // a load that is lifted rather than a machine's help.
    const estimates = assisted
      ? []
      : selected.flatMap((_, index) => {
          const weight = loadProfile[index];
          const toFailure = inHand[index];
          return weight != null &&
            !Number.isNaN(weight) &&
            weight > 0 &&
            toFailure != null &&
            toFailure <= TRAINING_POLICY.estimateMaxReps
            ? [weight * (1 + toFailure / 30)]
            : [];
        });
    return {
      sourceId: `workout:${h.workoutSessionId}`,
      exerciseSourceId: `exercise:${h.workoutExerciseId}`,
      performedAt: h.performedAt.toISOString(),
      date: h.performedOn ?? h.performedAt.toISOString().slice(0, 10),
      value: first ? valueOf(first, p) : null,
      load,
      loadProfile: loadProfile.map((value) => (Number.isNaN(value) ? null : value)),
      effort,
      validUnit: validUnit && !loadProfile.some(Number.isNaN),
      complete,
      effortPresent,
      effortConfirmed,
      attained:
        maximum != null &&
        complete &&
        effortFits &&
        selected.every((set) => (valueOf(set, p) ?? -1) >= maximum),
      completedMinimum:
        minimum != null &&
        complete &&
        effortFits &&
        selected.every((set) => (valueOf(set, p) ?? -1) >= minimum),
      belowMinimum: minimum != null && first != null && (valueOf(first, p) ?? Infinity) < minimum,
      /** Reps to failure on the hardest working set, when every set has its reps and RIR. */
      capacity,
      /** Estimated maximum from the best set of 12 reps to failure or fewer (Epley). */
      estimatedMax: estimates.length ? Math.round(Math.max(...estimates) * 10) / 10 : null,
    };
  });

  // Runs of consecutive sessions at one load, newest first: what a load step, a step that did
  // not hold, and what came of the last step are all read from.
  const harder = (a: number, b: number) => (assisted ? a < b - 0.05 : a > b + 0.05);
  const runs: { load: number | null; points: typeof base }[] = [];
  for (const point of base) {
    const run = runs.at(-1);
    if (run && sameLoad(point.load, run.load)) run.points.push(point);
    else runs.push({ load: point.load, points: [point] });
  }
  // How the first session at each new load compared with what the one before it predicted: the
  // athlete's own reading of their reps in reserve, checked against what they then did. Below
  // zero they had less in hand than they said.
  const errors: number[] = [];
  for (let i = 0; i + 1 < runs.length; i++) {
    const first = runs[i]!.points.at(-1)!,
      before = runs[i + 1]!.points[0]!;
    if (
      !assisted &&
      first.capacity !== null &&
      before.capacity !== null &&
      first.load !== null &&
      before.load !== null &&
      before.load > 0 &&
      harder(first.load, before.load)
    )
      errors.push(first.capacity - capacityAt(before.capacity, before.load, first.load));
  }
  const calibration = {
    steps: errors.length,
    meanError: errors.length
      ? Math.round((errors.reduce((sum, e) => sum + e, 0) / errors.length) * 10) / 10
      : null,
  };
  // An athlete whose reported reserve has twice run out after a step needs one more rep in
  // hand before the next step is taken on a single session's word.
  const spare =
    TRAINING_POLICY.spareReps + (calibration.steps >= 2 && calibration.meanError! <= -1 ? 1 : 0);
  const top = maximum == null ? null : maximum + targetRir;
  const floor = (minimum ?? 1) + targetRir;
  const readinessOf = (point: (typeof base)[number]): Readiness =>
    !reps || point.capacity === null || point.load === null || !point.validUnit || top === null
      ? "unknown"
      : point.capacity >= top + spare
        ? "spare"
        : point.capacity >= top
          ? "on_target"
          : point.capacity >= floor
            ? "building"
            : "below";
  const points = base.map((point) => ({ ...point, readiness: readinessOf(point) }));
  const latest = points[0] ?? null;
  const matching = latest
    ? points.filter(
        (point) =>
          point.value !== null &&
          point.value > 0 &&
          point.validUnit &&
          point.effortPresent &&
          (p.prescriptionType !== "reps" || point.load !== null) &&
          point.effort !== null &&
          latest.effort !== null &&
          Math.abs(point.effort - latest.effort) <= 1 &&
          point.loadProfile.length === latest.loadProfile.length &&
          point.loadProfile.every((value, index) => {
            const other = latest.loadProfile[index];
            return (
              value === other ||
              (value != null &&
                other != null &&
                Math.abs(value - other) <= Math.max(0.05, Math.abs(other) * 0.005))
            );
          }) &&
          (point.load === latest.load ||
            (point.load !== null &&
              latest.load !== null &&
              Math.abs(point.load - latest.load) <= Math.max(0.05, Math.abs(latest.load) * 0.005))),
      )
    : [];
  const latestComparable = !!latest && matching[0]?.sourceId === latest.sourceId;
  const recent = matching
    .filter((point) => !reference?.sourceIds.includes(point.sourceId))
    .slice(0, TRAINING_POLICY.recentExposures);
  // Establish once from preceding eligible observations; persist this reference at acceptance.
  const referencePoints = matching.slice(3, 6);
  const candidateReference: ReferenceEvidence | null =
    referencePoints.length === 3
      ? {
          values: referencePoints.map((point) => point.value!),
          sourceIds: referencePoints.map((point) => point.sourceId),
          establishedAt: latest!.performedAt,
        }
      : null;
  const retainedReference = reference ?? candidateReference;
  const baseline = median(retainedReference?.values ?? []);
  const recentMedian = recent.length === 3 ? median(recent.map((point) => point.value!)) : null;
  const mad =
    baseline !== null ? median(retainedReference!.values.map((v) => Math.abs(v - baseline))) : null;
  const threshold =
    baseline !== null && baseline > 0
      ? Math.max(
          TRAINING_POLICY.minimumRelativeChange,
          1 / baseline,
          (TRAINING_POLICY.noiseMultiplier * (mad ?? 0)) / baseline,
        )
      : null;
  const relativeChange =
    baseline !== null && baseline > 0 && recentMedian !== null ? recentMedian / baseline - 1 : null;
  const low =
    threshold === null || baseline === null
      ? []
      : recent.filter((point) => point.value! < baseline * (1 - threshold));
  // A decline reads the same comparison as a progression and is held to the same bar. An
  // effort the athlete entered is evidence in either direction; one nobody labelled is not
  // suddenly worth less because the conclusion points down.
  const declineCandidate =
    !!latest &&
    latest.effortPresent &&
    latest.belowMinimum &&
    recent.length === 3 &&
    low.length >= 2 &&
    low.some((point) => point.sourceId === latest.sourceId) &&
    relativeChange !== null &&
    relativeChange < -threshold!;
  const progressionReady =
    latestComparable &&
    points.length >= 2 &&
    points.slice(0, 2).every((point) => point.attained) &&
    matching.some((point) => point.sourceId === points[1]!.sourceId);
  const repeatedCompletion =
    latestComparable &&
    points.length >= 2 &&
    points.slice(0, 2).every((point) => point.completedMinimum) &&
    matching.some((point) => point.sourceId === points[1]!.sourceId);

  // The same runs, now that each session says where it left the load.
  const loadRuns: { load: number | null; points: typeof points }[] = [];
  for (const point of points) {
    const run = loadRuns.at(-1);
    if (run && sameLoad(point.load, run.load)) run.points.push(point);
    else loadRuns.push({ load: point.load, points: [point] });
  }
  const misses = (run: (typeof loadRuns)[number]) =>
    run.points.filter((point) => point.readiness === "below");
  const current = loadRuns[0],
    before = loadRuns[1];
  /**
   * A step that did not hold goes back to the load that last worked: missed twice in its first
   * three sessions, the latest of them one of the misses. Only ever to that load, never below
   * it, and never on one bad day.
   */
  const revert =
    current &&
    before &&
    current.load !== null &&
    before.load !== null &&
    harder(current.load, before.load) &&
    current.points.length <= TRAINING_POLICY.revertWindow &&
    current.points[0]!.readiness === "below" &&
    misses(current).length >= TRAINING_POLICY.revertMisses
      ? {
          load: before.load,
          /** Each working set's load the last time at that load, in order. */
          loads: before.points[0]!.loadProfile,
          /** Reps to failure the hardest set had there. */
          capacity: before.points[0]!.capacity,
          evidenceIds: misses(current).map((point) => point.sourceId),
        }
      : null;
  // A load that was stepped to and did not hold asks for two sessions, not one, before it is
  // tried again: one good day is how it was reached last time.
  const failedAbove = loadRuns
    .slice(1)
    .some(
      (run) =>
        current?.load != null &&
        run.load !== null &&
        harder(run.load, current.load) &&
        run.points.length <= TRAINING_POLICY.revertWindow &&
        misses(run).length >= TRAINING_POLICY.revertMisses,
    );
  const previous = points[1];
  const steady = (point: (typeof points)[number] | undefined) =>
    point?.readiness === "spare" || point?.readiness === "on_target";
  /**
   * Whether the load steps up next session (ADR 0039): a rep to spare beyond the top of the range
   * at the target effort, on every working set, says so at once; exactly on target says so when
   * the session before it at the same loads said the same.
   */
  const loadReady: "spare" | "confirmed" | null = !latest
    ? null
    : latest.readiness === "spare" && !failedAbove
      ? "spare"
      : steady(latest) &&
          steady(previous) &&
          previous!.loadProfile.length === latest.loadProfile.length &&
          previous!.loadProfile.every((value, index) =>
            sameLoad(value, latest.loadProfile[index] ?? null),
          )
        ? "confirmed"
        : null;
  // A running estimate of the maximum, across loads, so a trend survives every step up.
  const estimated = [...points].reverse().filter((point) => point.estimatedMax !== null);
  let smoothed: number | null = null;
  for (const point of estimated)
    smoothed = smoothed === null ? point.estimatedMax! : (smoothed + point.estimatedMax!) / 2;
  const estimateSlopes: number[] = [];
  for (let i = 0; i < estimated.length; i++)
    for (let j = i + 1; j < estimated.length; j++) {
      const weeks =
        (new Date(estimated[j]!.date).getTime() - new Date(estimated[i]!.date).getTime()) /
        (7 * 86_400_000);
      if (weeks > 0)
        estimateSlopes.push((estimated[j]!.estimatedMax! - estimated[i]!.estimatedMax!) / weeks);
    }
  const slopes: number[] = [];
  for (let i = 0; i < matching.length; i++)
    for (let j = i + 1; j < matching.length; j++) {
      const a = matching[i]!,
        b = matching[j]!;
      const weeks = (new Date(a.date).getTime() - new Date(b.date).getTime()) / (7 * 86_400_000);
      if (weeks > 0) slopes.push((a.value! - b.value!) / weeks);
    }
  return {
    metric: `first_working_set_${p.prescriptionType}_at_matching_load_and_effort`,
    unit:
      p.prescriptionType === "reps"
        ? "reps"
        : p.prescriptionType === "duration"
          ? "seconds"
          : "metres",
    loadUnit: p.unit,
    comparison: { load: latest?.load ?? null, prescription: p },
    observations: points,
    latestSets:
      observations[0]?.sets.map((set) => ({
        ...set,
        weight:
          set.weight !== null && canConvertLoad(set.unit ?? p.unit, p.unit)
            ? convertLoad(set.weight, set.unit ?? p.unit, p.unit)
            : null,
        unit: p.unit,
      })) ?? [],
    matchingCount: matching.length,
    // What can be compared, and how much of it the athlete is on record as having entered.
    // The coach needs the second number to say how confident a change is, never to claim the
    // first was fabricated.
    effortCoverage: {
      known: points.filter((point) => point.effortPresent).length,
      confirmed: points.filter((point) => point.effortConfirmed).length,
      total: points.length,
    },
    baseline,
    reference: retainedReference,
    recentMedian,
    relativeChange,
    mad,
    threshold,
    slopePerWeek: matching.length >= 3 ? median(slopes) : null,
    progressionReady,
    repeatedCompletion,
    declineCandidate,
    /** Where the latest session leaves the load (ADR 0039). */
    readiness: latest?.readiness ?? ("unknown" as Readiness),
    /** Whether the load steps up next session, and on what: one spare session or two on target. */
    loadReady,
    /** The sessions a load step stands on: the latest alone, or the latest and the one before. */
    stepEvidenceIds:
      loadReady === "spare"
        ? [latest!.sourceId]
        : loadReady === "confirmed"
          ? [latest!.sourceId, previous!.sourceId]
          : [],
    /** A step that did not hold, and the load it goes back to. */
    revert,
    /**
     * How the athlete's reported reps in reserve held up after each step up in the window: the
     * reps to failure they had at the new load, minus what the session before predicted.
     */
    calibration,
    /** The estimated maximum across loads, from sets of 12 reps to failure or fewer. */
    estimatedMax: {
      latest: estimated.at(-1)?.estimatedMax ?? null,
      smoothed: smoothed === null ? null : Math.round(smoothed * 10) / 10,
      perWeek: estimated.length >= 3 ? Math.round((median(estimateSlopes) ?? 0) * 100) / 100 : null,
      sessions: estimated.length,
      meaning:
        "An estimate from load, reps and reported reps in reserve on this machine, never a tested maximum. Use it to follow a trend across load changes, not as a target.",
    },
    evidenceIds: (progressionReady || repeatedCompletion
      ? points.slice(0, 2)
      : declineCandidate
        ? low
        : recent
    ).map((point) => point.sourceId),
    state: declineCandidate
      ? "decline_candidate"
      : revert
        ? "step_did_not_hold"
        : loadReady || progressionReady
          ? "ready_to_progress"
          : matching.length < 3
            ? "insufficient_evidence"
            : "hold",
    meaning:
      "Descriptive performance evidence, not a diagnosis or muscle-growth measurement. Different loads, effort, equipment and dates must not be pooled blindly.",
  };
}

export type ExerciseEvidence = ReturnType<typeof summarizeExerciseEvidence>;
