import type { LoadUnit } from "./types";
import { canConvertLoad, convertLoad } from "@/lib/units";

/**
 * How much of the athlete's own body an exercise lifts (ADR 0040).
 *
 * The rule reads reps against load along Epley's curve: what a set will have in hand after a
 * step, and how far reps build before a coarse step can land inside the range. That curve is
 * about the whole load moved. On a barbell lift that is, near enough, the bar. On a split squat
 * holding a 5 kg dumbbell it is the body and the dumbbell together: the next dumbbell is half as
 * heavy again on paper and about 3% heavier in fact. Read against the dumbbell alone, the step
 * looked so coarse that reps had to reach 28 a side before it could be taken.
 *
 * A share is the rough fraction of body mass the working muscles move — enough to put an added
 * load in proportion to the body under it, not a biomechanical model. A movement not listed here
 * is read against its logged load, as it always was.
 */
const BODYWEIGHT_SHARES: Readonly<Record<string, number>> = {
  // Pull-ups and chin-ups: everything but the hands and forearms.
  vertical_pull: 0.95,
  // Dips.
  vertical_push: 0.9,
  // Squats, split squats, lunges and step-ups: everything above the working shin.
  squat: 0.85,
  lunge: 0.85,
  // Nordic curls and glute-ham raises: the body above the knees.
  knee_flexion: 0.7,
  // Push-ups.
  horizontal_push: 0.65,
  // Inverted rows.
  horizontal_pull: 0.6,
  // Bench dips, close-grip push-ups and ring extensions.
  elbow_extension: 0.6,
  // Back extensions, glute bridges and hip thrusts from the floor: the trunk.
  hinge: 0.5,
  // Leg raises and sit-ups: the legs, or the trunk.
  hip_flexion: 0.35,
  trunk_flexion: 0.35,
  spinal_flexion: 0.35,
};

/**
 * Where the athlete has not recorded a weight. The point is the scale of the load, and any
 * adult's weight makes an added dumbbell a small part of it.
 */
export const STAND_IN_BODY_WEIGHT_KG = 70;

/**
 * The share of body mass an exercise lifts: the bodyweight movements, and every lunge and split
 * squat whatever is held, because the body is most of what those move. A barbell or machine lift
 * is read against its logged load.
 */
export function bodyweightShare(exercise: { modality: string; movementPattern: string }): number {
  if (exercise.modality !== "bodyweight" && exercise.movementPattern !== "lunge") return 0;
  return BODYWEIGHT_SHARES[exercise.movementPattern] ?? 0;
}

/**
 * The part of the athlete's body an exercise lifts, in `unit`: zero where the body is not part
 * of the load, or the unit is a machine's own numbers, which no weight converts into.
 */
export function bodyLoad(
  exercise: { modality?: string | null; movementPattern?: string | null },
  bodyWeightKg: number | null | undefined,
  unit: LoadUnit,
): number {
  if (!exercise.modality || !exercise.movementPattern) return 0;
  const share = bodyweightShare({
    modality: exercise.modality,
    movementPattern: exercise.movementPattern,
  });
  if (share === 0 || !canConvertLoad("kg", unit)) return 0;
  const weight = bodyWeightKg && bodyWeightKg > 0 ? bodyWeightKg : STAND_IN_BODY_WEIGHT_KG;
  return Math.round(convertLoad(share * weight, "kg", unit) * 10) / 10;
}
