import { stepEasier, stepHarder, type LoadLadder } from "./load-steps";
import type { PerformedSet, Prescription } from "./progression";
import type { LoadUnit, SetType } from "./types";
import { canConvertLoad, convertLoad } from "@/lib/units";

/** Versioned product limits to evaluate, not physiological optima or injury guarantees. */
export const TRAINING_POLICY = {
  version: "2026-10-08.1",
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
  /**
   * Reps in hand a session may fall short of the bottom of the range at the target effort and
   * still not count as a miss: about the error of a reported RIR, so a set at the minimum with
   * one in reserve less than planned is a near miss, not a step that failed (ADR 0047).
   */
  missTolerance: 1,
  /**
   * Reps a set may build past the top of its range where the next load step is coarse, before
   * the step is taken anyway (ADR 0047). Past this, reps chase endurance, discomfort and the
   * curve's guess rather than the range the exercise was given.
   */
  coarseStepReps: 2,
  /**
   * The fewest reps at the target effort a coarse step may start at, below the range, before
   * building back up (ADR 0047). A range whose bottom is this or lower never starts below it.
   */
  coarseLandingReps: 5,
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
   * The working loads that session's own plan prescribed, in the prescription's unit: a load the
   * plan asked for is the plan's, never a lighter day or an attempt of the athlete's own.
   */
  planned?: readonly number[];
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
 * curve. `body` is the part of the athlete's own body the exercise lifts, in the same unit: the
 * curve runs through everything moved, so on a split squat it is the body and the dumbbell
 * together (ADR 0040). Good for the few percent of one load step; not a claim about anybody's
 * maximum.
 */
export function capacityAt(capacity: number, from: number, to: number, body = 0): number {
  return 30 * (((from + body) * (1 + capacity / 30)) / (to + body) - 1);
}

/** Reps to failure needed at `from` to still have `floor` in hand after moving to `to`. */
export function capacityNeeded(floor: number, from: number, to: number, body = 0): number {
  return 30 * (((to + body) * (1 + floor / 30)) / (from + body) - 1);
}

type CeilingInput = Pick<Prescription, "repMin" | "repMax" | "rirMin" | "rule" | "bodyLoad">;

/** Reps at `load`, at the target effort, from which a step to `next` lands at the range's bottom. */
function repsToLand(p: CeilingInput, load: number, next: number): number {
  const targetRir = p.rirMin ?? 2;
  return capacityNeeded(p.repMin! + targetRir, load, next, p.bodyLoad ?? 0) - targetRir;
}

/**
 * The most reps a set of this prescription is asked for at `load` before the load steps up.
 *
 * Normally the top of the range. When the next real step is so coarse that stepping at the top
 * would land below the bottom of the range — a 10 to 12.5 kg dumbbell is a quarter more — reps
 * build past the top, but only by `coarseStepReps` (ADR 0047). Building until the step lands
 * inside the range asked for 21 curls where the range was 10–15: the curve that said so is a
 * guess that far from failure, the reported reserve is least reliable in long sets, and such a
 * set ends on grip and discomfort as much as on the muscle. The step is taken from there and
 * starts below the range (`landingFloor`).
 */
export function repCeiling(
  p: CeilingInput,
  load: number | null,
  next: number | null,
  assisted = false,
): number | null {
  const top = p.rule?.kind === "conservative_strength" ? p.rule.repsRequired : p.repMax;
  if (top == null) return null;
  if (load == null || next == null || load <= 0 || next <= load || assisted || p.repMin == null)
    return top;
  const needed = Math.ceil(repsToLand(p, load, next) - 1e-9);
  return Math.max(top, Math.min(top + TRAINING_POLICY.coarseStepReps, needed));
}

/**
 * Where a coarse step may start (ADR 0047): the fewest reps, at the target effort, a set may be
 * asked for below the range after a step too coarse to land inside it from the top. Null where
 * the step lands inside the range from the top, on an assisted machine, and where the range's
 * bottom is already `coarseLandingReps` or fewer: a strength range never starts below itself, so
 * its coarse step waits until it lands inside.
 */
export function landingFloor(
  p: CeilingInput,
  load: number | null,
  next: number | null,
  assisted = false,
): number | null {
  const top = p.rule?.kind === "conservative_strength" ? p.rule.repsRequired : p.repMax;
  if (top == null || p.repMin == null || assisted) return null;
  if (load == null || next == null || load <= 0 || next <= load) return null;
  if (repsToLand(p, load, next) <= top + 1e-9) return null;
  return p.repMin > TRAINING_POLICY.coarseLandingReps ? TRAINING_POLICY.coarseLandingReps : null;
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

/** A load as the athlete reads it: a weight, a pin on a stack, or a count of plates. */
export function loadText(value: number, unit: LoadUnit): string {
  if (unit === "stack_index") return `pin ${value}`;
  if (unit === "plate_count") return `${value} plates`;
  return unit === "none" ? `${value}` : `${value} ${unit}`;
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

type EvidenceOptions = {
  /** An assisted machine: less help is harder, and no maximum is estimated from it. */
  assisted?: boolean;
  /** The machine's loads (ADR 0028), where the prescription does not carry them. */
  ladder?: Omit<LoadLadder, "increment"> | null;
};

/** A session the trend reads past: lighter than the load held in the session before it. */
export type SetAside = {
  sourceId: string;
  date: string;
  load: number | null;
  /** The load the session before it held in the range, which the trend goes on from. */
  heldLoad: number;
};

const heldReadiness = (readiness: Readiness) =>
  readiness === "building" || readiness === "on_target" || readiness === "spare";

/**
 * The single sessions lighter than the session before them, where that one held the range
 * (ADR 0047): a light day, a machine shared with something else, a lift done lighter than usual.
 * Each says nothing about the heavier load already shown. Two lighter sessions running are the
 * lighter load chosen, and a lighter load the session's own plan asked for is the plan's — a
 * temporary session or a lasting change the coach wrote — so neither is set aside.
 */
function asideOf(
  points: readonly {
    sourceId: string;
    date: string;
    load: number | null;
    readiness: Readiness;
  }[],
  input: readonly EvidencePerformance[],
  assisted: boolean,
): SetAside[] {
  const harder = (a: number, b: number) => (assisted ? a < b - 0.05 : a > b + 0.05);
  return points.flatMap((point, index) => {
    const before = points[index + 1];
    const after = index > 0 ? points[index - 1] : undefined;
    if (!before || point.load === null || before.load === null) return [];
    if (!harder(before.load, point.load) || !heldReadiness(before.readiness)) return [];
    if (after && after.load !== null && harder(before.load, after.load)) return [];
    const planned = input.find((h) => `workout:${h.workoutSessionId}` === point.sourceId)?.planned;
    if (planned?.some((load) => sameLoad(load, point.load))) return [];
    return [
      { sourceId: point.sourceId, date: point.date, load: point.load, heldLoad: before.load },
    ];
  });
}

/** The sessions the trend sets aside as lighter than the load held before them (ADR 0047). */
export function lighterSessions(
  p: Prescription,
  input: readonly EvidencePerformance[],
  options: EvidenceOptions = {},
): SetAside[] {
  const assisted = options.assisted ?? p.ladder?.assisted ?? false;
  return asideOf(summarize(p, input, null, options).observations, input, assisted);
}

/**
 * Raw matching first-set performance, with completion/effort assessed separately.
 *
 * A single session lighter than a load held in the range just before it is read past first
 * (`lighterSessions`, ADR 0047), and named in `setAside`: the trend, and every rule that reads
 * it, goes on from the heavier load, so a light day never becomes the load the next step is
 * taken from.
 */
export function summarizeExerciseEvidence(
  p: Prescription,
  input: readonly EvidencePerformance[],
  reference?: ReferenceEvidence | null,
  options: EvidenceOptions = {},
) {
  const all = summarize(p, input, reference, options);
  const aside = asideOf(all.observations, input, options.assisted ?? p.ladder?.assisted ?? false);
  if (aside.length === 0) return { ...all, setAside: aside };
  const ids = new Set(aside.map((point) => point.sourceId));
  const kept = input.filter((h) => !ids.has(`workout:${h.workoutSessionId}`));
  return { ...summarize(p, kept, reference, options), setAside: aside };
}

function summarize(
  p: Prescription,
  input: readonly EvidencePerformance[],
  reference: ReferenceEvidence | null | undefined,
  options: EvidenceOptions,
) {
  const assisted = options.assisted ?? p.ladder?.assisted ?? false;
  // Everything the curve runs through: the logged load and, on a bodyweight movement, the part
  // of the body it lifts (ADR 0040). Help on an assisted machine is not read along the curve.
  const body = assisted ? 0 : (p.bodyLoad ?? 0);
  const ladder: LoadLadder = {
    known: options.ladder?.known ?? p.ladder?.known ?? [],
    stack: options.ladder?.stack ?? p.ladder?.stack ?? false,
    assisted,
    increment: p.loadIncrement > 0 ? p.loadIncrement : null,
  };
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
  const harder = (a: number, b: number) => (assisted ? a < b - 0.05 : a > b + 0.05);
  /** The bottom of the range, as reps in hand at the target effort. */
  const rangeFloor = (minimum ?? 1) + targetRir;
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
    const planned = (weight: number) => (h.planned ?? []).some((value) => sameLoad(value, weight));
    /**
     * The load each set counts at (ADR 0047). A heavier set of the athlete's own that fell short
     * of the range — the next step tried for the last two sets, say — was an attempt at that
     * load and counts at the session's: it says nothing against the load the session was at,
     * and the next session starts it back there. A heavier set that held the range, or one the
     * session's own plan asked for, keeps its load.
     */
    const workProfile = loadProfile.map((weight, index) => {
      if (weight == null || Number.isNaN(weight)) return null;
      const held = inHand[index];
      return load !== null &&
        !assisted &&
        held != null &&
        harder(weight, load) &&
        !planned(weight) &&
        held < rangeFloor
        ? load
        : weight;
    });
    /**
     * Each set read at the session's load, where it says something about it (ADR 0047): a
     * lighter set is read up to it along the curve, and a heavier attempt that fell short is
     * read down to it. A pyramid the plan wrote keeps each step at its own load. Read only at
     * its own load, 62.5 × 4 at 1 RIR after 60 × 6 at 2 said 60 kg had five reps in hand.
     */
    const atLoad = inHand.map((held, index) => {
      const weight = loadProfile[index];
      if (held == null || weight == null || Number.isNaN(weight) || load === null) return held;
      if (assisted || !(weight > 0) || !(load > 0) || sameLoad(weight, load)) return held;
      if (planned(weight) && planned(load)) return held;
      return harder(load, weight) || workProfile[index] === load
        ? capacityAt(held, weight, load, body)
        : held;
    });
    const known = atLoad.filter((value): value is number => value !== null);
    // The hardest set is the one that limits a prescription of straight sets.
    const capacity = complete && known.length === selected.length ? Math.min(...known) : null;
    // The hardest set logged, whether or not every set was. A set left out can only lower it,
    // so logged sets that fell short of the range say the session did (ADR 0040).
    const hardest = known.length > 0 ? Math.min(...known) : null;
    // A maximum is only estimated from sets close enough to failure for the curve to hold, on
    // a load that is lifted rather than a machine's help. It is the logged load's maximum: the
    // body a bodyweight movement lifts is on the curve, and off the number (ADR 0040).
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
            ? [(weight + body) * (1 + toFailure / 30) - body]
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
      /** Reps to failure on the hardest working set, when every set has its reps and RIR. */
      capacity,
      /** Reps to failure on the hardest set logged with its reps and RIR, even if not all were. */
      hardest,
      /** Estimated maximum from the best set of 12 reps to failure or fewer (Epley). */
      estimatedMax: estimates.length ? Math.round(Math.max(...estimates) * 10) / 10 : null,
      workProfile,
      // What the bottom of the range is judged against, once it is known where the load came from.
      counts: {
        values: selected.map((set) => valueOf(set, p)),
        effortFits,
        first: first ? valueOf(first, p) : null,
      },
    };
  });

  // Runs of consecutive sessions at one load, newest first: what a load step, a step that did
  // not hold, and what came of the last step are all read from.
  const runs: { load: number | null; points: typeof base }[] = [];
  for (const point of base) {
    const run = runs.at(-1);
    if (run && sameLoad(point.load, run.load)) run.points.push(point);
    else runs.push({ load: point.load, points: [point] });
  }
  /**
   * A load a coarse step went to counts its reps from where that step may start, not from the
   * bottom of the range (ADR 0047): it was taken knowing it would start below the range, so the
   * sessions climbing back into it are reps building, not a step that failed. Only a step the
   * session before it said would start below the range: one that was to land inside it and did
   * not is a miss like any other.
   */
  const landingOf = new Map<(typeof base)[number], number>();
  for (let i = 0; i + 1 < runs.length; i++) {
    const run = runs[i]!,
      before = runs[i + 1]!;
    if (!reps || run.load === null || before.load === null || !harder(run.load, before.load))
      continue;
    const landing = landingFloor(p, before.load, run.load, assisted);
    const had = before.points[0]!.capacity;
    if (
      landing === null ||
      had === null ||
      capacityAt(had, before.load, run.load, body) >= rangeFloor - 1e-9
    )
      continue;
    for (const point of run.points) landingOf.set(point, landing);
  }
  const minimumOf = (point: (typeof base)[number]) => landingOf.get(point) ?? minimum;
  const floorOf = (point: (typeof base)[number]) => (minimumOf(point) ?? 1) + targetRir;
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
      errors.push(first.capacity - capacityAt(before.capacity, before.load, first.load, body));
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
  const readinessOf = (point: (typeof base)[number]): Readiness => {
    const floor = floorOf(point);
    return !reps || point.load === null || !point.validUnit || top === null
      ? "unknown"
      : point.capacity === null
        ? // Not every set is there to say where the session left the load, unless the ones
          // that are fell short of the range: the sets missing could not have lifted it.
          point.hardest !== null && point.hardest < floor
          ? "below"
          : "unknown"
        : point.capacity >= top + spare
          ? "spare"
          : point.capacity >= top
            ? "on_target"
            : point.capacity >= floor
              ? "building"
              : "below";
  };
  const points = base.map((original) => {
    const { workProfile: _work, counts, ...point } = original;
    const bottom = minimumOf(original);
    return {
      ...point,
      completedMinimum:
        bottom != null &&
        point.complete &&
        counts.effortFits &&
        counts.values.every((value) => (value ?? -1) >= bottom),
      belowMinimum: bottom != null && counts.first !== null && counts.first < bottom,
      readiness: readinessOf(original),
    };
  });
  const baseOf = new Map(points.map((point, index) => [point, base[index]!]));
  const floorAt = (point: (typeof points)[number]) => floorOf(baseOf.get(point)!);
  const minimumAt = (point: (typeof points)[number]) => minimumOf(baseOf.get(point)!);
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
  /**
   * A session clearly short of the range: more than `missTolerance` reps in hand under its bottom
   * at the target effort (ADR 0047). Inside that margin — the minimum reps with one in reserve
   * less than planned — the reported reserve cannot tell a miss from a good day, and the load
   * holds as it does for one low session; it is not a step that failed.
   */
  const missed = (point: (typeof points)[number]) =>
    point.readiness === "below" &&
    (point.capacity ?? point.hardest ?? -Infinity) <
      floorAt(point) - TRAINING_POLICY.missTolerance - 1e-9;
  const misses = (run: (typeof loadRuns)[number]) => run.points.filter(missed);
  const current = loadRuns[0],
    before = loadRuns[1];
  /** Where a load goes back to, and why. */
  type Revert = {
    load: number;
    /** Each working set's load, in order; a set without one goes back to `load`. */
    loads: (number | null)[];
    /** Reps to failure the hardest set had there, or is expected to have. */
    capacity: number | null;
    evidenceIds: string[];
    /**
     * `missed_twice`: a step that missed the range twice in its first three sessions.
     * `out_of_reach`: a load never held in the range, whose latest session could not reach the
     * bottom of it even taken to failure.
     */
    reason: "missed_twice" | "out_of_reach";
    /**
     * Where `load` comes from: the load before the step, the last load held in the range, or
     * the load the latest session's hardest set puts in the range.
     */
    to: "before_step" | "last_held" | "fitted";
  };
  /**
   * A step that did not hold goes back to the load that last worked: missed twice in its first
   * three sessions, the latest of them one of the misses. Only ever to that load, never below
   * it, and never on one bad day.
   */
  const missedTwice: Revert | null =
    current &&
    before &&
    current.load !== null &&
    before.load !== null &&
    harder(current.load, before.load) &&
    current.points.length <= TRAINING_POLICY.revertWindow &&
    missed(current.points[0]!) &&
    misses(current).length >= TRAINING_POLICY.revertMisses
      ? {
          load: before.load,
          loads: before.points[0]!.loadProfile,
          capacity: before.points[0]!.capacity,
          evidenceIds: misses(current).map((point) => point.sourceId),
          reason: "missed_twice",
          to: "before_step",
        }
      : null;
  const held = (point: (typeof points)[number]) => heldReadiness(point.readiness);
  /** A load no session in the window held the range at, nor at anything harder. */
  const neverHeld = (load: number | null) =>
    load === null ||
    !points.some(
      (point) =>
        held(point) &&
        point.load !== null &&
        (sameLoad(point.load, load) || harder(point.load, load)),
    );
  /**
   * A session whose hardest set could not reach the bottom of the range even to failure — after
   * a coarse step, the reps that step may start at (ADR 0047).
   */
  const beyondReach = (point: (typeof points)[number]) => {
    const bottom = minimumAt(point);
    return (
      point.readiness === "below" &&
      point.hardest !== null &&
      bottom != null &&
      point.hardest < bottom
    );
  };
  /**
   * A load nobody has held in the range is not a baseline yet (ADR 0040). When the latest session
   * at one could not reach the bottom of the range even taken to failure — a heavy single, or a
   * jump far past what the work had shown — holding it asks every set for more in hand than any
   * session there has had: one rep at 0 RIR, held, became three at 2 RIR. It goes back at once,
   * to the last load held in the range, else to the load that session itself puts in the range.
   * A load held in the range, or under one that was, keeps the older rule: one low day holds.
   */
  const outOfReach =
    !missedTwice &&
    latest !== null &&
    latest.load !== null &&
    beyondReach(latest) &&
    neverHeld(latest.load);
  const lastHeld = outOfReach
    ? points.find(
        (point) => held(point) && point.load !== null && harder(latest!.load!, point.load),
      )
    : undefined;
  /** The heaviest real load at or below where the latest session's hardest set fits the range. */
  const fitted = (() => {
    if (!outOfReach || lastHeld || assisted) return null;
    const from = latest!.load!;
    const fit = ((from + body) * (1 + latest!.hardest! / 30)) / (1 + rangeFloor / 30) - body;
    let load = from;
    for (let guard = 0; load > fit + 1e-9; guard++) {
      const step = guard < 200 ? stepEasier(ladder, load) : null;
      // A learned stop is a guess, and at home only a load known to exist will do.
      if (
        !step ||
        !(step.load < load) ||
        step.source === "learned" ||
        (p.requireKnownLoads && step.source !== "known")
      )
        return null;
      load = step.load;
    }
    return load > 0 ? load : null;
  })();
  const revert: Revert | null =
    missedTwice ??
    (lastHeld
      ? {
          load: lastHeld.load!,
          loads: lastHeld.loadProfile,
          capacity: lastHeld.capacity,
          evidenceIds: [latest!.sourceId],
          reason: "out_of_reach",
          to: "last_held",
        }
      : fitted !== null
        ? {
            load: fitted,
            loads: [],
            capacity: Math.floor(capacityAt(latest!.hardest!, latest!.load!, fitted, body) + 1e-9),
            evidenceIds: [latest!.sourceId],
            reason: "out_of_reach",
            to: "fitted",
          }
        : null);
  // A load that was stepped to and did not hold asks for two sessions, not one, before it is
  // tried again: one good day is how it was reached last time. That is a step that missed the
  // range twice, or a load never held that a session could not reach the range at (ADR 0040) —
  // only once the next step would reach it: a single far above is no reason to slow the steps
  // below it.
  const nextUp = current?.load != null ? stepHarder(ladder, current.load) : null;
  const failedAbove = loadRuns
    .slice(1)
    .some(
      (run) =>
        current?.load != null &&
        run.load !== null &&
        harder(run.load, current.load) &&
        run.points.length <= TRAINING_POLICY.revertWindow &&
        (misses(run).length >= TRAINING_POLICY.revertMisses ||
          (neverHeld(run.load) &&
            run.points.some(beyondReach) &&
            nextUp !== null &&
            !harder(run.load, nextUp.load))),
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
  /**
   * What moves the load up next, in the athlete's terms (ADR 0040): the reps and reps in reserve
   * every working set needs, and in how many sessions. It is here so a coach's note can say it as
   * it stands, not restate the rule from memory. Null with no load to step from, and when the
   * next session goes back instead.
   */
  const nextStep = (() => {
    if (!reps || !latest || latest.load === null || !(latest.load > 0) || maximum == null)
      return null;
    if (revert) return null;
    const from = loadText(latest.load, p.unit);
    const next = stepHarder(ladder, latest.load);
    if (!next || (p.requireKnownLoads && next.source !== "known"))
      return `Nobody knows the next load up from ${from} yet: reps build within the range until the athlete enters it.`;
    const to = loadText(next.load, p.unit);
    const ceiling = repCeiling(p, latest.load, next.load, assisted) ?? maximum;
    // After a coarse step the load starts below the range; that is the plan, not a miss.
    const landed = landingOf.get(baseOf.get(latest)!);
    const climbing =
      landed !== undefined &&
      before?.load != null &&
      latest.capacity !== null &&
      latest.capacity < rangeFloor
        ? `Reps at ${from} count from ${landed} after the big jump from ${loadText(before.load, p.unit)}, and build back into the range. `
        : "";
    // One session needs a rep to spare beyond the top; two running need the top itself.
    const once = failedAbove ? null : Math.max(ceiling, maximum + spare);
    const twice = `two sessions running with every working set at ${ceiling} reps and ${targetRir} RIR`;
    const when =
      once === null
        ? twice
        : once === ceiling
          ? `one session with every working set at ${ceiling} reps and ${targetRir} RIR`
          : `one session with every working set at ${once} reps and ${targetRir} RIR, or ${twice}`;
    if (ceiling > maximum) {
      // Where the step lands from the ceiling, at the target effort (ADR 0047).
      const lands = Math.floor(
        capacityAt(ceiling + targetRir, latest.load, next.load, body) - targetRir + 1e-9,
      );
      const floor = landingFloor(p, latest.load, next.load, assisted) ?? p.repMin ?? 1;
      if (p.repMin == null || lands >= p.repMin)
        return `${climbing}${to} is a big jump from ${from}, so reps build past the top of the range first: it comes after ${when}.`;
      if (lands >= floor)
        return `${climbing}${to} is a big jump from ${from}: reps build to ${ceiling} here, ${ceiling - maximum} past the top of the range and no further, and ${to} comes after ${when}. It starts below the range, at about ${lands} reps, and builds back up.`;
      const needed = Math.ceil(
        capacityNeeded(floor + targetRir, latest.load, next.load, body) - 1e-9,
      );
      return `${climbing}${to} is too big a jump from ${from} to bridge with reps: they stay at ${ceiling} here, and ${to} comes once every working set has ${needed} reps in hand (${ceiling} reps at ${needed - ceiling} RIR), or sooner with a smaller step or a variation.`;
    }
    return once === null
      ? `${climbing}${to} comes after ${twice}: the step above this load did not hold last time.`
      : `${climbing}${to} comes after one session with every working set at ${maximum} reps and ${targetRir + spare} RIR (or ${once} reps at ${targetRir} RIR), or after ${twice}.`;
  })();
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
    /**
     * The load each working set of the latest session counts at, in order (ADR 0047): its own,
     * except a heavier set of the athlete's own that fell short of the range, which counts at
     * the session's load, where the next session starts it.
     */
    latestWorkLoads: base[0]?.workProfile ?? [],
    /**
     * The coarse step the current load came from (ADR 0047): its reps count from `floor`, below
     * the range, while they build back into it. Null where the load was not reached that way.
     */
    landing:
      latest && current && before && current.load !== null && before.load !== null
        ? (() => {
            const floor = landingOf.get(baseOf.get(latest)!);
            return floor === undefined ? null : { load: current.load, from: before.load, floor };
          })()
        : null,
    /** Whether the load steps up next session, and on what: one spare session or two on target. */
    loadReady,
    /** The sessions a load step stands on: the latest alone, or the latest and the one before. */
    stepEvidenceIds:
      loadReady === "spare"
        ? [latest!.sourceId]
        : loadReady === "confirmed"
          ? [latest!.sourceId, previous!.sourceId]
          : [],
    /**
     * A load that goes back, and where to: a step that missed the range twice, or a load never
     * held in the range that the latest session could not reach the bottom of (ADR 0040).
     */
    revert,
    /** What moves the load up next, as the athlete should hear it (ADR 0040). */
    nextStep,
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
