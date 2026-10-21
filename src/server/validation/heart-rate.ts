import { z } from "zod";

import {
  HEART_RATE_ZONE_METHODS,
  MAX_HEART_RATE_BOUND,
  RESTING_HEART_RATE,
} from "@/domain/heart-rate";
import { HEART_RATE } from "@/domain/activity-limits";

/** A whole number of beats a minute, or null when the field was left blank. */
const beats = (label: string, bound: { min: number; max: number }) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null),
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
