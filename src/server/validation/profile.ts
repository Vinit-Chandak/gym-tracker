import { z } from "zod";

import { BODY_LOAD_UNITS } from "@/domain/types";

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

const bodyWeightSchema = z.preprocess(
  asString,
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const parsed = Number(value.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
        ctx.addIssue({ code: "custom", message: "Enter your body weight as a number, e.g. 74.5." });
        return z.NEVER;
      }
      return Math.round(parsed * 100) / 100;
    }),
);

export const profileInputSchema = z.object({
  displayName: z.preprocess(
    asString,
    z
      .string()
      .trim()
      .max(80, "Keep this under 80 characters.")
      .transform((value) => (value.length > 0 ? value : null)),
  ),
  timeZone: timeZoneSchema,
  preferredUnit: z.enum(BODY_LOAD_UNITS, { error: "Choose kilograms or pounds." }),
  bodyWeightKg: bodyWeightSchema,
});

export type ProfileInput = z.output<typeof profileInputSchema>;
