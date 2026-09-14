import { z } from "zod";

import { GYM_KINDS, LOAD_UNITS, RESISTANCE_MODES } from "@/domain/types";

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const requiredText = (max: number, message: string) =>
  z.preprocess(
    asString,
    z.string().trim().min(1, message).max(max, `Keep this under ${max} characters.`),
  );

const optionalText = (max: number) =>
  z.preprocess(
    asString,
    z
      .string()
      .trim()
      .max(max, `Keep this under ${max} characters.`)
      .transform((value) => (value.length > 0 ? value : null)),
  );

const optionalNumber = (options: { min: number; max: number; message: string }) =>
  z.preprocess(
    asString,
    z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === "") return null;
        const parsed = Number(value.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
          ctx.addIssue({ code: "custom", message: options.message });
          return z.NEVER;
        }
        return parsed;
      }),
  );

export const gymInputSchema = z.object({
  name: requiredText(80, "Give the gym a name."),
  kind: z.enum(GYM_KINDS, { error: "Choose a location type." }),
  address: optionalText(200),
  notes: optionalText(1000),
});
export type GymInput = z.output<typeof gymInputSchema>;

export const equipmentInputSchema = z.object({
  name: requiredText(80, "Give the machine a name."),
  equipmentTypeId: z.uuid({ error: "Choose an equipment type." }),
  manufacturer: optionalText(80),
  model: optionalText(80),
  resistanceMode: z.enum(RESISTANCE_MODES, { error: "Choose how the load is applied." }),
  unit: z.enum(LOAD_UNITS, { error: "Choose a unit." }),
  loadIncrement: optionalNumber({
    min: 0.01,
    max: 1000,
    message: "Enter the smallest load jump as a number, for example 2.5.",
  }),
  availableLoads: z
    .preprocess(
      asString,
      z
        .string()
        .max(2000)
        .transform((value, ctx) => {
          if (!value.trim()) return [];
          const values = value
            .split(/[,;\s]+/)
            .filter(Boolean)
            .map(Number);
          if (values.length > 200 || values.some((n) => !Number.isFinite(n) || n < 0 || n > 2000)) {
            ctx.addIssue({
              code: "custom",
              message:
                "Enter up to 200 available loads, separated by commas, using the selected unit.",
            });
            return z.NEVER;
          }
          return [...new Set(values)].sort((a, b) => a - b);
        }),
    )
    .optional(),
  loadConvention: z.enum(["total", "per_hand", "assistance", "stack_label", "unknown"]).optional(),
  pulleyRatio: optionalText(40),
  angleDegrees: optionalNumber({ min: 0, max: 90, message: "Angle must be between 0 and 90." }),
  notes: optionalText(1000),
});
export type EquipmentInput = z.output<typeof equipmentInputSchema>;
