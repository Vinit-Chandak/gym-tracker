import { z } from "zod";

import { BODY_LOAD_UNITS, SEXES, TRAINING_GOALS, type BodyLoadUnit } from "@/domain/types";
import { fromKilograms, heightUnitFor, toCentimetres, toKilograms } from "@/lib/units";

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** Any IANA zone the running platform knows about; the browser proposes one during onboarding. */
const timeZoneSchema = z.preprocess(
  asString,
  z
    .string()
    .trim()
    .min(1, "Choose a time zone.")
    .max(64)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, "That is not a time zone this app recognises."),
);

/** A typed number, or null when the field was left blank. Ranges are checked once, in kg and cm. */
const optionalNumber = z.preprocess(
  asString,
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const parsed = Number(value.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({ code: "custom", message: "Enter a number." });
        return z.NEVER;
      }
      return parsed;
    }),
);

/** The oldest person on record was 122; anything past 130 is a typo, not a birthday. */
const MAX_AGE_YEARS = 130;

const dateOfBirthSchema = z.preprocess(
  asString,
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") {
        ctx.addIssue({ code: "custom", message: "Enter your date of birth." });
        return z.NEVER;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Enter your date of birth as a date." });
        return z.NEVER;
      }
      const parsed = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        ctx.addIssue({ code: "custom", message: "That is not a real date." });
        return z.NEVER;
      }
      // Compared against UTC today: a birthday is a date, and no time zone makes it a
      // different one by more than a day either way.
      const today = new Date().toISOString().slice(0, 10);
      const earliest = `${Number(today.slice(0, 4)) - MAX_AGE_YEARS}${today.slice(4)}`;
      if (value > today || value < earliest) {
        ctx.addIssue({ code: "custom", message: "Enter a date of birth in the past." });
        return z.NEVER;
      }
      return value;
    }),
);

/** Blank is a real answer here — "prefer not to say" — so this one stays optional. */
const sexSchema = z.preprocess(
  (value) => (typeof value === "string" && value !== "" ? value : null),
  z.enum(SEXES, { error: "Choose one of the options." }).nullable(),
);

const WEIGHT_KG = { min: 20, max: 500 } as const;
const HEIGHT_CM = { min: 50, max: 260 } as const;

/**
 * Everything the app knows about the person training. Both the onboarding step and the
 * Settings screen parse with this, so the two can never ask for different things.
 *
 * Weight and height arrive in whichever units the account uses — pounds and feet, or
 * kilograms and centimetres — and leave as kilograms and centimetres, which is how they are
 * stored. `preferredUnit` is part of the same submission, so the conversion never has to
 * guess which units the numbers were typed in.
 */
export const profileInputSchema = z
  .object({
    displayName: z.preprocess(
      asString,
      z
        .string()
        .trim()
        .min(1, "Tell us what to call you.")
        .max(80, "Keep this under 80 characters."),
    ),
    timeZone: timeZoneSchema,
    preferredUnit: z.enum(BODY_LOAD_UNITS, { error: "Choose kilograms or pounds." }),
    dateOfBirth: dateOfBirthSchema,
    sex: sexSchema,
    trainingGoal: z.enum(TRAINING_GOALS, { error: "Choose what you are training for." }),
    /** In `preferredUnit`. */
    bodyWeight: optionalNumber,
    /** Used when the account is in kilograms. */
    heightCm: optionalNumber,
    /** Used when the account is in pounds. */
    heightFeet: optionalNumber,
    heightInches: optionalNumber,
  })
  .transform((values, ctx) => {
    const unit: BodyLoadUnit = values.preferredUnit;

    const bodyWeightKg = values.bodyWeight === null ? null : toKilograms(values.bodyWeight, unit);
    if (bodyWeightKg === null) {
      ctx.addIssue({ code: "custom", path: ["bodyWeight"], message: "Enter your body weight." });
    } else if (bodyWeightKg < WEIGHT_KG.min || bodyWeightKg > WEIGHT_KG.max) {
      ctx.addIssue({
        code: "custom",
        path: ["bodyWeight"],
        message: `Enter a body weight between ${fromKilograms(WEIGHT_KG.min, unit)} and ${fromKilograms(WEIGHT_KG.max, unit)} ${unit}.`,
      });
    }

    const imperial = heightUnitFor(unit) === "ftin";
    const heightPath = imperial ? "heightFeet" : "heightCm";
    let heightCm: number | null = null;
    if (imperial) {
      if (values.heightFeet !== null || values.heightInches !== null) {
        heightCm = toCentimetres(values.heightFeet ?? 0, values.heightInches ?? 0);
      }
    } else {
      heightCm = values.heightCm;
    }
    if (heightCm === null) {
      ctx.addIssue({ code: "custom", path: [heightPath], message: "Enter your height." });
    } else if (heightCm < HEIGHT_CM.min || heightCm > HEIGHT_CM.max) {
      ctx.addIssue({
        code: "custom",
        path: [heightPath],
        message: imperial
          ? "Enter a height between 1′ 8″ and 8′ 6″."
          : `Enter a height between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm.`,
      });
    }

    // Both readings are required, so a missing one has already been reported above.
    if (bodyWeightKg === null || heightCm === null) return z.NEVER;

    return {
      displayName: values.displayName,
      timeZone: values.timeZone,
      preferredUnit: unit,
      dateOfBirth: values.dateOfBirth,
      sex: values.sex,
      trainingGoal: values.trainingGoal,
      bodyWeightKg,
      heightCm,
    };
  });

export type ProfileInput = z.output<typeof profileInputSchema>;
