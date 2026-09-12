"use client";

import { useActionState } from "react";
import { useSessionDrafts } from "@/components/use-session-drafts";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import type { BodyLoadUnit } from "@/domain/types";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initialBodyWeight: string;
  /** The account's unit. The weight is typed in it, and the action converts on the way in. */
  unit: BodyLoadUnit;
  userId: string;
  sessionId: string;
};

export function FinishForm({ action, initialBodyWeight, unit, userId, sessionId }: Props) {
  const drafts = useSessionDrafts(userId, sessionId);
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <Section title="About this session">
        <Card>
          <Field label="Notes" hint="Optional" error={state.fieldErrors?.notes}>
            <Textarea
              name="notes"
              defaultValue={state.values?.notes ?? ""}
              maxLength={1000}
              placeholder="How it went, anything to remember…"
            />
          </Field>
          <Field
            label={`Body weight (${unit})`}
            hint="Optional — recorded as today's reading"
            error={state.fieldErrors?.bodyWeight}
          >
            <input type="hidden" name="unit" value={unit} />
            <Input
              name="bodyWeight"
              inputMode="decimal"
              defaultValue={state.values?.bodyWeight ?? initialBodyWeight}
              placeholder={unit === "kg" ? "74.5" : "164.2"}
            />
          </Field>
        </Card>
      </Section>

      <div className="space-y-2">
        <FormError message={state.formError} />
        {/* Finishing would leave these unresolved drafts stranded on the device. */}
        {drafts > 0 && (
          <p role="alert" className="text-sm text-warning">
            Go back and save or remove your {drafts} set {drafts === 1 ? "draft" : "drafts"} before
            finishing.
          </p>
        )}
        <SubmitButton pendingLabel="Finishing…" disabled={drafts > 0}>
          Finish session
        </SubmitButton>
      </div>
    </form>
  );
}
