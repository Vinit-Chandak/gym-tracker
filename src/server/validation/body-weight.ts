import { z } from "zod";

import { BODY_LOAD_UNITS } from "@/domain/types";
import { fromKilograms, toKilograms } from "@/lib/units";

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** What a scale can say: the bounds `body_weight_logs` holds, checked here in kilograms. */
const WEIGHT_KG = { min: 20, max: 500 } as const;

/**
 * A reading logged from Today › Log › Body weight: the day it was taken, today or before, and
 * what the scale said, typed in the account's unit. The form carries that unit, so the number is
 * never read in another one after a change elsewhere; the range is checked once the number is in
 * kilograms, the unit it is stored in, and said in the unit it was typed in.
 */
export function bodyWeightLogSchema(today: string) {
  return z
    .object({
      measuredOn: z.preprocess(
        asString,
        z
          .string()
          .trim()
          .min(1, "Enter a date.")
          .pipe(z.iso.date({ error: "That is not a real date." }))
          .refine((day) => day <= today, "Enter today or an earlier date."),
      ),
      unit: z.enum(BODY_LOAD_UNITS).catch("kg"),
      bodyWeight: z.preprocess(
        asString,
        z
          .string()
          .trim()
          .min(1, "Enter your body weight.")
          .transform((value, ctx) => {
            const parsed = Number(value.replace(",", "."));
            if (!Number.isFinite(parsed)) {
              ctx.addIssue({ code: "custom", message: "Enter a number." });
              return z.NEVER;
            }
            return parsed;
          }),
      ),
    })
    .transform((values, ctx) => {
      const weightKg = toKilograms(values.bodyWeight, values.unit);
      if (weightKg < WEIGHT_KG.min || weightKg > WEIGHT_KG.max) {
        ctx.addIssue({
          code: "custom",
          path: ["bodyWeight"],
          message: `Enter a body weight between ${fromKilograms(WEIGHT_KG.min, values.unit)} and ${fromKilograms(WEIGHT_KG.max, values.unit)} ${values.unit}.`,
        });
        return z.NEVER;
      }
      return { measuredOn: values.measuredOn, weightKg };
    });
}

export type BodyWeightLog = z.output<ReturnType<typeof bodyWeightLogSchema>>;
