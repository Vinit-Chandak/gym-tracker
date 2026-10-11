import { z } from "zod";

import { ENDURANCE_SPORTS, type EnduranceSport } from "@/domain/activity";
import { DURATION_MS, EFFORT, PRESCRIPTION_LIMITS, TEXT_LIMITS } from "@/domain/activity-limits";
import {
  parsePrescription,
  PRESCRIPTION_VERSION,
  type EndurancePrescription,
} from "@/domain/activity-prescription";
import { toMetres, type PoolUnit } from "@/lib/distance-units";

/**
 * The template form, and what it means (plan §5.1).
 *
 * Kept out of the action module because a `"use server"` file may export nothing but async
 * server actions: everything else it exports would become a callable endpoint. This is the
 * pure half — the shape the form submits and its reading as a prescription — so it can be
 * imported by the action and exercised directly by a test.
 */

const optional = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(max)
      .transform((value) => (value.length > 0 ? value : null)),
  );

/**
 * A number the form asks for, or blank. Each box says what is wrong with it in its own words
 * and under itself: a refusal that only the prescription noticed used to reach nobody.
 */
const number = (
  label: string,
  bounds: { min: number; max?: number; whole?: boolean; message?: string },
) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? value.trim().replace(",", ".") : null,
    z.coerce
      .number({ error: `Enter ${label} as a number.` })
      .refine((value) => Number.isFinite(value), { error: `Enter ${label} as a number.` })
      .refine((value) => !bounds.whole || Number.isInteger(value), {
        error: bounds.message ?? `Enter ${label} as a whole number.`,
      })
      .refine((value) => value >= bounds.min && (bounds.max === undefined || value <= bounds.max), {
        error: bounds.message ?? `Enter ${label} as zero or more.`,
      })
      .nullable(),
  );

const WEEK_MINUTES = DURATION_MS.max / 60_000;
const effortBox = number("the effort", {
  min: EFFORT.min,
  max: EFFORT.max,
  message: `Effort is ${EFFORT.min} to ${EFFORT.max}: 1 very easy, ${EFFORT.max} maximal.`,
});

export const templateSchema = z.object({
  sport: z.enum(ENDURANCE_SPORTS),
  name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().min(1, { error: "Name the template." }).max(TEXT_LIMITS.title),
  ),
  notes: optional(TEXT_LIMITS.prescriptionNotes),
  /** Overall session targets. */
  durationMinMinutes: number("the minutes", { min: 0, max: WEEK_MINUTES }),
  durationMaxMinutes: number("the minutes", { min: 0, max: WEEK_MINUTES }),
  distanceMin: number("the distance", { min: 0 }),
  distanceMax: number("the distance", { min: 0 }),
  distanceUnit: z.enum(["km", "mi", "m", "yd"]).default("km"),
  /** Out of five, as the athlete's own report is: one scale, so the two can be read together. */
  effortMin: effortBox,
  effortMax: effortBox,
  /** One repeated block: "8 × 50 m, 20 s between". */
  repetitions: number("the repetitions", {
    min: 2,
    max: PRESCRIPTION_LIMITS.repetitionsPerBlock,
    whole: true,
    message: `Repeat the block 2 to ${PRESCRIPTION_LIMITS.repetitionsPerBlock} times. Once is a session target.`,
  }),
  stepTargetKind: z.enum(["none", "duration", "distance"]).default("none"),
  stepDurationSeconds: number("the seconds", { min: 0, max: WEEK_MINUTES * 60 }),
  stepDistance: number("the distance", { min: 0 }),
  stepDistanceUnit: z.enum(["km", "mi", "m", "yd"]).default("m"),
  restBetweenSeconds: number("the rest", { min: 0, max: WEEK_MINUTES * 60 }),
});

export type TemplateForm = z.output<typeof templateSchema>;

const range = (min: number | null, max: number | null): [number, number] | null => {
  if (min === null && max === null) return null;
  const low = min ?? max!;
  const high = max ?? min!;
  return [low, high];
};

const STEP_ACTION: Record<EnduranceSport, "run" | "ride" | "swim"> = {
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/** The form as a prescription, or the reasons it is not one. */
export function prescriptionFromForm(
  form: TemplateForm,
):
  | { ok: true; value: EndurancePrescription }
  | { ok: false; problems: readonly { path: string; message: string }[] } {
  const durationRange = range(form.durationMinMinutes, form.durationMaxMinutes);
  const distanceRange = range(form.distanceMin, form.distanceMax);
  const unit = form.distanceUnit as PoolUnit | "km" | "mi";
  // Durations are stored in whole milliseconds; a third of a minute typed as 0.333 is not one.
  const ms = (value: number, scale: number) => Math.round(value * scale);
  const nodes: unknown[] = [];
  if (form.repetitions !== null && form.stepTargetKind !== "none") {
    const target =
      form.stepTargetKind === "duration"
        ? {
            kind: "duration",
            ms: [ms(form.stepDurationSeconds ?? 0, 1000), ms(form.stepDurationSeconds ?? 0, 1000)],
          }
        : {
            kind: "distance",
            metres: [
              toMetres(form.stepDistance ?? 0, form.stepDistanceUnit),
              toMetres(form.stepDistance ?? 0, form.stepDistanceUnit),
            ],
            unit: form.stepDistanceUnit,
          };
    nodes.push({
      kind: "repeat",
      id: "block",
      repetitions: form.repetitions,
      restBetweenMs: form.restBetweenSeconds === null ? null : ms(form.restBetweenSeconds, 1000),
      steps: [
        {
          kind: "step",
          id: "work",
          phase: "work",
          action: STEP_ACTION[form.sport],
          target,
        },
      ],
    });
  }
  return parsePrescription({
    prescriptionVersion: PRESCRIPTION_VERSION,
    sport: form.sport,
    title: form.name,
    sessionTargets: {
      durationMs: durationRange
        ? [ms(durationRange[0], 60_000), ms(durationRange[1], 60_000)]
        : null,
      distanceMetres: distanceRange
        ? [toMetres(distanceRange[0], unit), toMetres(distanceRange[1], unit)]
        : null,
      // Kept so the editor gives the distance back in the unit it was typed in.
      ...(distanceRange ? { distanceUnit: unit } : {}),
      effort: range(form.effortMin, form.effortMax),
    },
    nodes,
    notes: form.notes,
  });
}

/**
 * Where a prescription's refusal is said on the form: the box it is about, matched by the whole
 * path, or the form's own error line when no one box is. Nothing is dropped. Keying by the
 * first part of the path alone filed these under "sessionTargets" and "nodes", which no box on
 * the form is called, so the form came back with the values kept and not a word said.
 */
const FIELD_FOR_PATH: readonly [RegExp, (form: TemplateForm) => string][] = [
  [/^sessionTargets\.durationMs(\.|$)/, () => "durationMinMinutes"],
  [/^sessionTargets\.distanceMetres(\.|$)/, () => "distanceMin"],
  [/^sessionTargets\.effort(\.|$)/, () => "effortMin"],
  [/^nodes\.\d+\.repetitions(\.|$)/, () => "repetitions"],
  [/^nodes\.\d+\.restBetweenMs(\.|$)/, () => "restBetweenSeconds"],
  [
    /^nodes\.\d+\.steps\.\d+\.target(\.|$)/,
    (form) => (form.stepTargetKind === "duration" ? "stepDurationSeconds" : "stepDistance"),
  ],
  [/^title(\.|$)/, () => "name"],
  [/^notes(\.|$)/, () => "notes"],
];

export function templateProblems(
  problems: readonly { path: string; message: string }[],
  form: TemplateForm,
): { fieldErrors: Record<string, string>; formError: string | undefined } {
  const fieldErrors: Record<string, string> = {};
  const unplaced: string[] = [];
  for (const problem of problems) {
    const field = FIELD_FOR_PATH.find(([pattern]) => pattern.test(problem.path))?.[1](form);
    if (field) fieldErrors[field] ??= problem.message;
    else if (!unplaced.includes(problem.message)) unplaced.push(problem.message);
  }
  return {
    fieldErrors,
    formError:
      unplaced.length > 0
        ? unplaced.join(" ")
        : Object.keys(fieldErrors).length > 0
          ? undefined
          : "That session is not valid.",
  };
}
