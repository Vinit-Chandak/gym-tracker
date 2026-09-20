import type { PerformedSet, Prescription } from "./progression";
import type { LoadUnit } from "./types";
import { canConvertLoad, convertLoad } from "@/lib/units";

/** Versioned product limits to evaluate, not physiological optima or injury guarantees. */
export const TRAINING_POLICY = {
  version: "2026-09-16",
  detailDays: 7,
  trendDays: 56,
  confirmationExposures: 2,
  recentExposures: 3,
  referenceExposures: 3,
  minimumRelativeChange: 0.05,
  noiseMultiplier: 2,
  maxLoadIncrease: 0.05,
  maxLoadReduction: 0.1,
  maxCumulativeLoadIncrease: 0.1,
  maxCumulativeLoadReduction: 0.15,
  maxExerciseSetChange: 0.25,
  maxTotalSetChange: 0.2,
  maxRunChange: 0.1,
  /** Reps a target may gain in one session on repeated completion; a decline still cuts one. */
  maxRepIncrease: 2,
  cumulativeDays: 14,
} as const;

/** The smallest real gap between the loads a machine actually offers, if it offers enough. */
export function smallestIncrement(loads: readonly number[]): number | null {
  const sorted = [...new Set(loads.filter((load) => Number.isFinite(load) && load > 0))].sort(
    (a, b) => a - b,
  );
  let smallest: number | null = null;
  for (let index = 1; index < sorted.length; index++) {
    const gap = sorted[index]! - sorted[index - 1]!;
    if (gap > 0 && (smallest === null || gap < smallest)) smallest = gap;
  }
  return smallest;
}

/**
 * The largest upward load step allowed, as a fraction of the load being stepped up from.
 *
 * A percentage on its own freezes light lifts. The next dumbbell above 20kg is 22.5kg — a
 * 12.5% jump — so a 5% rule forbids the only step that physically exists, and the lift sits
 * at 20kg for good. The ceiling is therefore the percentage or one real increment of this
 * equipment, whichever is larger.
 *
 * Downward steps deliberately keep the plain percentage. When no cut small enough exists,
 * holding the load is the safe answer, and a decline worth acting on can go to review.
 */
export function upwardLoadAllowance(
  limit: number,
  baseline: number,
  equipment?: { loadIncrement?: number | null; availableLoads?: readonly number[] | null } | null,
): number {
  if (!(baseline > 0)) return limit;
  const increment = equipment?.loadIncrement ?? smallestIncrement(equipment?.availableLoads ?? []);
  return increment && increment > 0 ? Math.max(limit, increment / baseline) : limit;
}

export type EvidencePerformance = {
  workoutExerciseId: string;
  workoutSessionId: string;
  performedAt: Date;
  /** Local date, when available. Same-day sets/bouts are one confirmation occasion. */
  performedOn?: string;
  sets: readonly (PerformedSet & { unit?: LoadUnit })[];
};
export type ReferenceEvidence = {
  values: number[];
  sourceIds: string[];
  establishedAt: string;
};

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
) {
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
  const points = observations.map((h) => {
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
    };
  });
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
    evidenceIds: (progressionReady || repeatedCompletion
      ? points.slice(0, 2)
      : declineCandidate
        ? low
        : recent
    ).map((point) => point.sourceId),
    state: declineCandidate
      ? "decline_candidate"
      : progressionReady
        ? "ready_to_progress"
        : matching.length < 3
          ? "insufficient_evidence"
          : "hold",
    meaning:
      "Descriptive performance evidence, not a diagnosis or muscle-growth measurement. Different loads, effort, equipment and dates must not be pooled blindly.",
  };
}

export type ExerciseEvidence = ReturnType<typeof summarizeExerciseEvidence>;
