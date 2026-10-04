"use client";

import { useActionState } from "react";
import { DiscardSessionButton } from "@/components/discard-session-button";
import { useSessionDrafts } from "@/components/use-session-drafts";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PinnedActions } from "@/components/ui/pinned-actions";
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
  /** No set is logged: finishing would only record nothing, so discarding is offered first. */
  nothingLogged?: boolean;
};

export function FinishForm({
  action,
  initialBodyWeight,
  lastBodyWeight,
  unit,
  userId,
  sessionId,
  nothingLogged = false,
}: Props) {
  const drafts = useSessionDrafts(userId, sessionId);
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  return (
    <form action={formAction} className="mt-3.5 space-y-3.5">
      {/* Say that the coach reads this. It always could, and people wrote requests here
          expecting an answer; a field that looks like a diary should not be one. */}
      <Field label="Notes" hint="Your coach reads these" error={state.fieldErrors?.notes}>
        <Textarea
          name="notes"
          defaultValue={state.values?.notes ?? ""}
          maxLength={1000}
          rows={2}
          className="min-h-[4.5rem]"
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

      <PinnedActions stack>
        <FormError message={state.formError} />
        {/* Finishing would leave these unresolved drafts stranded on the device. */}
        {drafts > 0 && (
          <p role="alert" className="type-meta-small font-semibold">
            Go back and save or remove your {drafts} set {drafts === 1 ? "draft" : "drafts"} before
            finishing.
          </p>
        )}
        {nothingLogged ? (
          <>
            {/* An empty session is better thrown away than kept as a record of nothing; one
                with every exercise skipped can still be finished, and keeps its reasons. */}
            <p className="type-meta">
              <span className="font-bold">Nothing logged.</span> Discard this session instead?
            </p>
            <DiscardSessionButton
              sessionId={sessionId}
              variant="primary"
              label="Discard session"
              disabled={drafts > 0}
            />
            <SubmitButton variant="text" pendingLabel="Finishing…" disabled={drafts > 0}>
              Finish anyway
            </SubmitButton>
          </>
        ) : (
          <SubmitButton pendingLabel="Finishing…" disabled={drafts > 0}>
            Finish session
          </SubmitButton>
        )}
      </PinnedActions>
    </form>
  );
}
