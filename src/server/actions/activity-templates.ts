"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import { multisportRollout } from "@/lib/multisport-rollout";
import { requireUser } from "@/server/auth";
import {
  archiveTemplate,
  createTemplate,
  reviseTemplate,
  TemplateNotFoundError,
} from "@/server/repositories/activity-templates";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import { prescriptionFromForm, templateSchema } from "@/server/validation/template-form";

/**
 * Writing a reusable session (plan §5.1).
 *
 * The form asks for what a session asks for: an overall target, and optionally one repeated
 * block. Whatever it produces is validated as a prescription before it is stored, so a
 * template can never hold a shape the rest of the app would have to guess at.
 */

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
