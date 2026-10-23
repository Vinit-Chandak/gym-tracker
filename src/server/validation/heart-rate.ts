import { z } from "zod";

import {
  HEART_RATE_ZONE_METHODS,
  MAX_HEART_RATE_BOUND,
  RESTING_HEART_RATE,
  customFloorsProblem,
} from "@/domain/heart-rate";
import { HEART_RATE } from "@/domain/activity-limits";

/** A whole number of beats a minute, or null when the field was left blank. */
const beats = (label: string, bound: { min: number; max: number }) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string" || value.trim() === "") return null;
      const typed = value.trim();
      // A pasted hexadecimal or exponent expression is not a heart-rate reading.
      return /^\d+(?:\.\d+)?$/.test(typed) ? typed : Number.NaN;
    },
    z.coerce
      .number({ error: `Enter ${label} as a number.` })
      .int({ error: `Enter ${label} in whole beats a minute.` })
      .min(bound.min, { error: `Enter ${label} between ${bound.min} and ${bound.max}.` })
      .max(bound.max, { error: `Enter ${label} between ${bound.min} and ${bound.max}.` })
      .nullable(),
  );

const floor = (zone: number) => beats(`where zone ${zone} starts`, HEART_RATE);

/**
 * The heart-rate page's form (ADR 0059). Every field may be blank: a blank maximum reads the
 * highest of the year's runs or the estimate for the athlete's age, a blank resting rate keeps
 * the zones as shares of the maximum. Five floors are read only for custom zones; whether they
 * fit the maximum is checked once the maximum in use is known.
 */
export const heartRateInputSchema = z.object({
  maxHeartRate: beats("your maximum heart rate", MAX_HEART_RATE_BOUND),
  restingHeartRate: beats("your resting heart rate", RESTING_HEART_RATE),
  zoneMethod: z.enum(HEART_RATE_ZONE_METHODS, { error: "Choose how your zones are worked out." }),
  maxHeartRateAuto: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  zone1: floor(1),
  zone2: floor(2),
  zone3: floor(3),
  zone4: floor(4),
  zone5: floor(5),
});

export type HeartRateInput = z.output<typeof heartRateInputSchema>;

/** Cross-field checks, shared by the saved settings and corrections made on the form. */
export function heartRateFieldErrors(
  input: HeartRateInput,
  max: number | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.restingHeartRate !== null && max !== null && input.restingHeartRate >= max)
    errors.restingHeartRate = "Your resting heart rate must be below your maximum.";
  if (input.zoneMethod === "custom") {
    if (max === null)
      errors.maxHeartRate =
        "Enter your maximum heart rate, or add your date of birth, to set zones.";
    const floors = [input.zone1, input.zone2, input.zone3, input.zone4, input.zone5];
    floors.forEach((floor, index) => {
      if (floor === null) errors[`zone${index + 1}`] = `Enter where zone ${index + 1} starts.`;
    });
    if (max !== null && floors.every((floor) => floor !== null)) {
      const problem = customFloorsProblem(floors, max);
      if (problem) {
        const outOfOrder = floors.findIndex(
          (floor, index) => index > 0 && floor <= floors[index - 1]!,
        );
        const zone = outOfOrder > 0 ? outOfOrder + 1 : floors[4]! >= max ? 5 : 1;
        errors[`zone${zone}`] = problem;
      }
    }
  }
  return errors;
}
