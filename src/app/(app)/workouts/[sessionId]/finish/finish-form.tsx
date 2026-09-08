"use client";

import { useActionState } from "react";
import { useSessionDrafts } from "@/components/use-session-drafts";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initialBodyWeight: string;
  userId: string;
  sessionId: string;
};

export function FinishForm({ action, initialBodyWeight, userId, sessionId }: Props) {
  const drafts = useSessionDrafts(userId, sessionId);
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);
  return (
    <form action={formAction} className="space-y-5">
      <Field label="Notes" hint="Optional" error={state.fieldErrors?.notes}>
        <Textarea
          name="notes"
          defaultValue={state.values?.notes ?? ""}
          maxLength={1000}
          placeholder="How it went, anything to remember…"
        />
      </Field>
      <Field label="Body weight (kg)" hint="Optional" error={state.fieldErrors?.bodyWeightKg}>
        <Input
          name="bodyWeightKg"
          inputMode="decimal"
          defaultValue={state.values?.bodyWeightKg ?? initialBodyWeight}
          placeholder="59.5"
        />
      </Field>
      <FormError message={state.formError} />
      {drafts > 0 && (
        <p role="alert" className="text-sm text-warning">
          Go back and save or remove your {drafts} set drafts before finishing.
        </p>
      )}
      <SubmitButton pendingLabel="Finishing…" disabled={drafts > 0}>
        Finish session
      </SubmitButton>
    </form>
  );
}
