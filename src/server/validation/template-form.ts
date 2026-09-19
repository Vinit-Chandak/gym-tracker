import { z } from "zod";

import { ENDURANCE_SPORTS, type EnduranceSport } from "@/domain/activity";
import { TEXT_LIMITS } from "@/domain/activity-limits";
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

const number = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() !== "" ? value.trim().replace(",", ".") : null,
  z.coerce.number().nullable(),
);

export const templateSchema = z.object({
  sport: z.enum(ENDURANCE_SPORTS),
  name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().min(1, { error: "Name the template." }).max(TEXT_LIMITS.title),
  ),
  notes: optional(TEXT_LIMITS.prescriptionNotes),
  /** Overall session targets. */
  durationMinMinutes: number,
  durationMaxMinutes: number,
  distanceMin: number,
  distanceMax: number,
  distanceUnit: z.enum(["km", "mi", "m", "yd"]).default("km"),
  effortMin: number,
  effortMax: number,
  /** One repeated block: "8 × 50 m, 20 s between". */
  repetitions: number,
  stepTargetKind: z.enum(["none", "duration", "distance"]).default("none"),
  stepDurationSeconds: number,
  stepDistance: number,
  stepDistanceUnit: z.enum(["km", "mi", "m", "yd"]).default("m"),
  restBetweenSeconds: number,
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
  const nodes: unknown[] = [];
  if (form.repetitions !== null && form.stepTargetKind !== "none") {
    const target =
      form.stepTargetKind === "duration"
        ? {
            kind: "duration",
            ms: [(form.stepDurationSeconds ?? 0) * 1000, (form.stepDurationSeconds ?? 0) * 1000],
          }
        : {
            kind: "distance",
            metres: [
              toMetres(form.stepDistance ?? 0, form.stepDistanceUnit),
              toMetres(form.stepDistance ?? 0, form.stepDistanceUnit),
            ],
          };
    nodes.push({
      kind: "repeat",
      id: "block",
      repetitions: form.repetitions,
      restBetweenMs: form.restBetweenSeconds === null ? null : form.restBetweenSeconds * 1000,
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
      durationMs: durationRange ? [durationRange[0] * 60_000, durationRange[1] * 60_000] : null,
      distanceMetres: distanceRange
        ? [toMetres(distanceRange[0], unit), toMetres(distanceRange[1], unit)]
        : null,
      effort: range(form.effortMin, form.effortMax),
    },
    nodes,
    notes: form.notes,
  });
}
