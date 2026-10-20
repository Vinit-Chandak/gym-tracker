"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import { requireUser } from "@/server/auth";
import {
  archiveTemplate,
  createTemplate,
  getTemplate,
  reviseTemplate,
  TemplateNotFoundError,
} from "@/server/repositories/activity-templates";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import {
  prescriptionFromForm,
  templateProblems,
  templateSchema,
  type TemplateForm,
} from "@/server/validation/template-form";

/**
 * Writing a reusable session (plan §5.1).
 *
 * The form asks for what a session asks for: an overall target, and optionally one repeated
 * block. Whatever it produces is validated as a prescription before it is stored, so a
 * template can never hold a shape the rest of the app would have to guess at.
 */

function problemsToState(
  problems: readonly { path: string; message: string }[],
  form: TemplateForm,
  formData: FormData,
): FormState {
  const { fieldErrors, formError } = templateProblems(problems, form);
  return {
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    formError,
    values: formValues(formData),
  };
}

export async function saveTemplateAction(
  templateId: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(templateSchema, formData);
  if (!parsed.success) return parsed.state;
  const form = parsed.data;

  // New templates can be refused before opening a transaction. Edits also need the current
  // prescription so fields this compact form cannot express survive the correction.
  const createdPrescription = templateId ? null : prescriptionFromForm(form);
  if (createdPrescription && !createdPrescription.ok)
    return problemsToState(createdPrescription.problems, form, formData);

  try {
    const refusal = await withUser(getDb(), user.id, async (tx) => {
      const existing = templateId ? await getTemplate(tx, user.id, templateId) : null;
      if (templateId && !existing) throw new TemplateNotFoundError();
      if (existing && existing.sport !== form.sport)
        return {
          formError: "A template's sport cannot change. Create a new template for another sport.",
          values: formValues(formData),
        };
      const prescription =
        createdPrescription ?? prescriptionFromForm(form, existing?.prescription);
      if (!prescription.ok) return problemsToState(prescription.problems, form, formData);
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
    if (refusal) return refusal;
  } catch (error) {
    return {
      formError:
        error instanceof TemplateNotFoundError
          ? error.message
          : "Something went wrong. Please try again.",
      values: formValues(formData),
    };
  }
  revalidatePath("/plan");
  redirect("/plan");
}

export type ArchiveResult = { ok: true } | { ok: false; error: string };

/** Archives a template. What was scheduled from it keeps working, by design. */
export async function archiveTemplateAction(templateId: string): Promise<ArchiveResult> {
  const user = await requireUser();
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
  revalidatePath("/plan");
  return { ok: true };
}
