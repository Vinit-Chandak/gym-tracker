import type { z } from "zod";

/** State shared by every form-backed server action and its `useActionState` client form. */
export type FormState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  /** Raw submitted values, echoed back so the form keeps what the user typed on error. */
  values?: Record<string, string>;
};

export const INITIAL_FORM_STATE: FormState = {};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export type ParsedForm<T> = { success: true; data: T } | { success: false; state: FormState };

/** Validates a FormData submission against a Zod schema and shapes errors for the form. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): ParsedForm<z.output<S>> {
  const values = formValues(formData);
  const result = schema.safeParse(values);
  if (result.success) return { success: true, data: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return {
    success: false,
    state: {
      fieldErrors,
      values,
      formError:
        Object.keys(fieldErrors).length > 0 ? undefined : "Something in the form is not valid.",
    },
  };
}
