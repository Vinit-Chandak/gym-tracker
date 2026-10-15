import type { PrescriptionType, SetType } from "./types";

/** Screens before this version could submit a target as actual effort. */
export const EFFORT_INPUT_VERSION = 2;
export const EFFORT_REFRESH_MESSAGE =
  "Reload the workout page, then enter your actual effort before saving. Your saved records remain available.";

export function effortMetric(measure: PrescriptionType) {
  return measure === "reps" ? "rir" : "rpe";
}

/** What a missing or impossible RPE asks for: the scale, in its own words. */
export const RPE_SCALE = "Enter effort from 1 (very easy) to 10 (maximal).";

/** Effort is an athlete report. A target or a previous set is never a reported value. */
export function effortError(input: {
  setType: SetType;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters?: number | null;
  rir: number | null;
  rpe?: number | null;
}) {
  // RPE starts at 1, a warm-up's too: a 0 typed is not on the scale, and is said in the app's own
  // words rather than as the server's refusal.
  if (input.rpe != null && input.rpe < 1) return RPE_SCALE;
  if (input.setType === "warmup") return null;
  if (input.reps !== null)
    return input.rir === null ? "Enter RIR: estimate how many more good reps you could do." : null;
  return input.rpe == null ? RPE_SCALE : null;
}

export const RPE_HELP =
  "Rate this set's overall effort: 1 very easy, 3 easy, 5 moderate, 7 hard, 9 very hard, 10 maximal. Estimate honestly; you do not need to test your maximum.";
export const RIR_HELP =
  "Estimate how many more reps you could complete with the same technique: 0 none, 1 one more, 2 two more, up to 10. An estimate is enough; you do not need to train to failure to check it.";
