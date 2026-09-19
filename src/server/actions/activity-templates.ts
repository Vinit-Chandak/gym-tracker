"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ENDURANCE_SPORTS, type EnduranceSport } from "@/domain/activity";
import { TEXT_LIMITS } from "@/domain/activity-limits";
import {
  endurancePrescriptionSchema,
  parsePrescription,
  PRESCRIPTION_VERSION,
  type EndurancePrescription,
} from "@/domain/activity-prescription";
import { toMetres, type PoolUnit } from "@/lib/distance-units";
import { multisportRollout } from "@/lib/multisport-rollout";
import { requireUser } from "@/server/auth";
import {
  archiveTemplate,
  createTemplate,
  reviseTemplate,
  TemplateNotFoundError,
} from "@/server/repositories/activity-templates";
import { formValues, parseForm, type FormState } from "@/server/validation/form";

/**
 * Writing a reusable session (plan §5.1).
 *
 * The form asks for what a session asks for: an overall target, and optionally one repeated
 * block. Whatever it produces is validated as a prescription before it is stored, so a
 * template can never hold a shape the rest of the app would have to guess at.
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

const templateSchema = z.object({
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

type TemplateForm = z.output<typeof templateSchema>;

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

function problemsToState(
  problems: readonly { path: string; message: string }[],
  formData: FormData,
): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const problem of problems) {
    const key = problem.path.split(".")[0] ?? "";
    if (key) fieldErrors[key] ??= problem.message;
  }
  return {
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    formError:
      Object.keys(fieldErrors).length > 0
        ? undefined
        : (problems[0]?.message ?? "That session is not valid."),
    values: formValues(formData),
  };
}

export async function saveTemplateAction(
  templateId: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const rollout = multisportRollout();
  if (!rollout.sharedNavigation) return { formError: "Templates are not switched on yet." };
  const parsed = parseForm(templateSchema, formData);
  if (!parsed.success) return parsed.state;
  const form = parsed.data;
  if (form.sport !== "running" && !rollout.newSports)
    return { formError: "That sport is not switched on yet.", values: formValues(formData) };

  const prescription = prescriptionFromForm(form);
  if (!prescription.ok) return problemsToState(prescription.problems, formData);

  try {
    await withUser(getDb(), user.id, async (tx) => {
      const stored = endurancePrescriptionSchema.parse(prescription.value);
      if (templateId) {
        await reviseTemplate(tx, user.id, templateId, {
          name: form.name,
          notes: form.notes,
          prescription: stored,
        });
        return;
      }
      await createTemplate(tx, user.id, {
        sport: form.sport,
        name: form.name,
        notes: form.notes,
        prescription: stored,
      });
    });
  } catch (error) {
    return {
      formError:
        error instanceof TemplateNotFoundError
          ? error.message
          : "Something went wrong. Please try again.",
      values: formValues(formData),
    };
  }
  revalidatePath("/training/templates");
  revalidatePath("/training");
  redirect("/training/templates");
}

export type ArchiveResult = { ok: true } | { ok: false; error: string };

/** Archives a template. What was scheduled from it keeps working, by design. */
export async function archiveTemplateAction(templateId: string): Promise<ArchiveResult> {
  const user = await requireUser();
  if (!multisportRollout().sharedNavigation)
    return { ok: false, error: "Templates are not switched on yet." };
  try {
    await withUser(getDb(), user.id, (tx) => archiveTemplate(tx, user.id, templateId));
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof TemplateNotFoundError
          ? error.message
          : "Something went wrong. Please try again.",
    };
  }
  revalidatePath("/training/templates");
  return { ok: true };
}
