import { WORKING_SET_TYPES } from "./progression";
import type { PlanExercise, PlanRun } from "./session-plan";

/**
 * What the app notices about a plan when it stores one.
 *
 * The server enforces no coaching rule: the coach's judgement, guided by its skill and the
 * athlete's memo, decides what to prescribe. But a plan that adds twenty kilos to a squat or
 * halves a day's volume is worth saying out loud, so these warnings ride along with the plan
 * and are shown beside it. Nothing here can stop a plan being stored.
 */

/** A load this much above the last comparable working load is worth a word. */
export const BIG_JUMP_RATIO = 1.15;
/** Or this many of the exercise's own increments, whichever is the larger jump. */
export const BIG_JUMP_INCREMENTS = 3;
/** Working sets this far from the programme's own count for the day. */
export const VOLUME_DRIFT_RATIO = 0.4;
/** Dropping more than this many of the day's slots. */
export const MAX_QUIET_DROPS = 2;
/** The lowest RIR a strength compound should ever be prescribed at. */
export const STRENGTH_RIR_FLOOR = 1;
/** A planned run this much longer than the last one of the same kind. */
export const RUN_JUMP_RATIO = 1.3;

export type PlanWarningCode = "big_jump" | "volume_drift" | "low_rir" | "many_drops" | "run_jump";

export type PlanWarning = { code: PlanWarningCode; message: string };

export type ReviewExercise = {
  name: string;
  entry: Pick<PlanExercise, "action" | "sets">;
  /** The heaviest working load logged the last comparable time, if there was one. */
  lastWorkingWeight: number | null;
  /** The smallest load jump for this exercise on this machine. */
  weightStep: number | null;
  /** Strength compounds keep an RIR floor; accessories do not. */
  isStrengthCompound: boolean;
  unit: string;
};

export type ReviewInput = {
  exercises: readonly ReviewExercise[];
  /** Working sets the programme asks for on this day. */
  plannedSets: number;
  /** Programme sets retained by slots without an explicit coach target. */
  unchangedSets?: number;
  run: { planned: PlanRun | null; lastDurationMinutes: number | null };
};

const round = (value: number) => Math.round(value * 10) / 10;

function workingSets(entry: ReviewExercise["entry"]) {
  return entry.sets.filter((set) => WORKING_SET_TYPES.has(set.setType));
}

/** The heaviest load a plan asks for on one exercise. */
function topWeight(entry: ReviewExercise["entry"]): number | null {
  const weights = workingSets(entry)
    .map((set) => set.weight)
    .filter((weight): weight is number => weight !== null);
  return weights.length > 0 ? Math.max(...weights) : null;
}

/**
 * Reads a plan against the day it is for and the loads that were last managed. Returns the
 * few things worth a second look, in the order a reader would care about them.
 */
export function reviewPlan(input: ReviewInput): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const kept = input.exercises.filter((exercise) => exercise.entry.action !== "drop");

  for (const exercise of kept) {
    const top = topWeight(exercise.entry);
    const last = exercise.lastWorkingWeight;
    if (top !== null && last !== null && last > 0) {
      const step = exercise.weightStep ?? 2.5;
      const jump = top - last;
      if (jump > 0 && top / last > BIG_JUMP_RATIO && jump > step * BIG_JUMP_INCREMENTS) {
        warnings.push({
          code: "big_jump",
          message: `${exercise.name} jumps from ${round(last)} to ${round(top)} ${exercise.unit}, which is more than a usual step.`,
        });
      }
    }
    if (exercise.isStrengthCompound) {
      const under = workingSets(exercise.entry).find(
        (set) => set.rir !== null && set.rir < STRENGTH_RIR_FLOOR,
      );
      if (under) {
        warnings.push({
          code: "low_rir",
          message: `${exercise.name} is prescribed at ${under.rir} RIR, which is at or past failure for a strength lift.`,
        });
      }
    }
  }

  const plannedTotal = kept.reduce(
    (total, exercise) => total + workingSets(exercise.entry).length,
    input.unchangedSets ?? 0,
  );
  if (input.plannedSets > 0 && plannedTotal > 0) {
    const drift = Math.abs(plannedTotal - input.plannedSets) / input.plannedSets;
    if (drift > VOLUME_DRIFT_RATIO) {
      warnings.push({
        code: "volume_drift",
        message: `${plannedTotal} working ${plannedTotal === 1 ? "set" : "sets"} against the programme's ${input.plannedSets}.`,
      });
    }
  }

  const drops = input.exercises.filter((exercise) => exercise.entry.action === "drop").length;
  if (drops > MAX_QUIET_DROPS) {
    warnings.push({
      code: "many_drops",
      message: `${drops} of the day's exercises are left out.`,
    });
  }

  const run = input.run.planned;
  const lastRun = input.run.lastDurationMinutes;
  if (run?.durationMinutes && lastRun && lastRun > 0) {
    const ratio = run.durationMinutes / lastRun;
    if (ratio > RUN_JUMP_RATIO) {
      warnings.push({
        code: "run_jump",
        message: `The run goes from ${lastRun} to ${run.durationMinutes} minutes, a jump of ${Math.round((ratio - 1) * 100)}%.`,
      });
    }
  }

  return warnings;
}

/** Movements whose RIR floor the review holds to, by library slug. */
export const STRENGTH_COMPOUND_SLUGS: ReadonlySet<string> = new Set([
  "high-bar-squat",
  "front-squat",
  "barbell-bench-press",
  "incline-barbell-bench",
  "close-grip-bench-press",
  "conventional-deadlift",
  "sumo-deadlift",
  "trap-bar-deadlift",
  "barbell-romanian-deadlift",
  "overhead-press",
  "barbell-row",
  "smith-machine-squat",
  "smith-machine-bench-press",
]);
