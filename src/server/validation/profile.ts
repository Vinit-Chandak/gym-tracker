import { z } from "zod";

import { BODY_LOAD_UNITS, SEXES, TRAINING_GOALS } from "@/domain/types";
import { DISTANCE_UNITS, POOL_UNITS } from "@/lib/distance-units";
import { checkTimeZone } from "@/lib/time-zones";
import { toCentimetres, type HeightUnit } from "@/lib/units";

import { usernameSchema } from "./username";

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

export const UNKNOWN_TIME_ZONE = "That is not a time zone this app recognises.";
export const NOT_A_PLACE =
  "Choose a place, such as Europe/London: an abbreviation or an offset can mean another zone.";

/**
 * A place's IANA zone, or UTC, spelt as the platform spells it (`checkTimeZone`); the browser
 * proposes one during onboarding, and Units and time zone offers a list of them. Abbreviations
 * and offsets are refused. Saving also asks Postgres, which dates the graphs, for its spelling.
 */
export const timeZoneSchema = z.preprocess(
  asString,
  z
    .string()
    .trim()
    .min(1, "Choose a time zone.")
    .max(64)
    .transform((value, ctx) => {
      const checked = checkTimeZone(value);
      if (checked.problem) {
        ctx.addIssue({
          code: "custom",
          message: checked.problem === "unknown" ? UNKNOWN_TIME_ZONE : NOT_A_PLACE,
        });
        return z.NEVER;
      }
      return checked.zone;
    }),
);

/** A typed number, or null when the field was left blank. Its range is checked once, in cm. */
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

const HEIGHT_CM = { min: 50, max: 260 } as const;

/** The two ways a height is typed: centimetres with kilograms, feet and inches with pounds. */
const HEIGHT_UNITS = ["cm", "ftin"] as const satisfies readonly HeightUnit[];

/**
 * How the account measures, and the zone its days are dated in (board Units and time zone):
 * what setup's first step proposes from the phone and Profile › Units and time zone changes, so
 * the two can never ask for different things. Distances arrive as the form shows them; only
 * what differs from the weight unit's is stored (ADR 0055).
 */
export const unitsInputSchema = z.object({
  timeZone: timeZoneSchema,
  preferredUnit: z.enum(BODY_LOAD_UNITS, { error: "Choose kilograms or pounds." }),
  distanceUnit: z.enum(DISTANCE_UNITS, { error: "Choose kilometres or miles." }),
  poolUnit: z.enum(POOL_UNITS, { error: "Choose metres or yards." }),
});

export type UnitsInput = z.output<typeof unitsInputSchema>;

/**
 * Who the person training is (Edit profile): name, username, date of birth, sex, height and
 * training goal, each asked for again until it is given (ADR 0020), sex aside, since saying
 * nothing is an answer. The units, the zone and body weight are other screens' (Units and time
 * zone; Today › Log › Body weight).
 *
 * The height arrives as the form showed it, in centimetres or in feet and inches, and the form
 * says which (`heightUnit`), so the conversion never has to guess; it leaves as centimetres,
 * which is how it is stored.
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
    username: usernameSchema,
    dateOfBirth: dateOfBirthSchema,
    sex: sexSchema,
    trainingGoal: z.enum(TRAINING_GOALS, { error: "Choose what you are training for." }),
    /** Which of the height fields the form showed; centimetres unless it says otherwise. */
    heightUnit: z.enum(HEIGHT_UNITS).catch("cm"),
    heightCm: optionalNumber,
    heightFeet: optionalNumber,
    heightInches: optionalNumber,
  })
  .transform((values, ctx) => {
    const imperial = values.heightUnit === "ftin";
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
      return z.NEVER;
    }
    if (heightCm < HEIGHT_CM.min || heightCm > HEIGHT_CM.max) {
      ctx.addIssue({
        code: "custom",
        path: [heightPath],
        message: imperial
          ? "Enter a height between 1′ 8″ and 8′ 6″."
          : `Enter a height between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm.`,
      });
      return z.NEVER;
    }

    return {
      displayName: values.displayName,
      username: values.username,
      dateOfBirth: values.dateOfBirth,
      sex: values.sex,
      trainingGoal: values.trainingGoal,
      heightCm,
    };
  });

export type ProfileInput = z.output<typeof profileInputSchema>;
