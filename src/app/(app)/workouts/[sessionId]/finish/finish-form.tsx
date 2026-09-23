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
  /** The newest reading on record, in `unit`, or "" when there is none. */
  lastBodyWeight: string;
  /** The account's unit. The weight is typed in it, and the action converts on the way in. */
  unit: BodyLoadUnit;
  userId: string;
  sessionId: string;
};

export function FinishForm({
  action,
  initialBodyWeight,
  lastBodyWeight,
  unit,
  userId,
  sessionId,
}: Props) {
  const drafts = useSessionDrafts(userId, sessionId);
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <Section title="About this session">
        <Card>
          {/* Say that the coach reads this. It always could, and people wrote requests here
              expecting an answer; a field that looks like a diary should not be one. */}
          <Field label="Notes" hint="Your coach reads these" error={state.fieldErrors?.notes}>
            <Textarea
              name="notes"
              defaultValue={state.values?.notes ?? ""}
              maxLength={1000}
              placeholder="How it went, anything the coach should know…"
            />
          </Field>
          <Field
            label={`Body weight (${unit})`}
            hint="Optional — recorded as today's reading"
            error={state.fieldErrors?.bodyWeight}
          >
            <input type="hidden" name="unit" value={unit} />
            {/* The last reading, greyed out, rather than a made-up example: someone who weighs
                in daily is typing the day's small change against it. Left blank, nothing is
                recorded — the placeholder is never submitted. */}
            <Input
              name="bodyWeight"
              inputMode="decimal"
              defaultValue={state.values?.bodyWeight ?? initialBodyWeight}
              placeholder={lastBodyWeight || undefined}
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
