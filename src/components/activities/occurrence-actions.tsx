"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import {
  reopenOccurrenceAction,
  rescheduleOccurrenceAction,
  skipOccurrenceAction,
} from "@/server/actions/occurrences";
import { INITIAL_FORM_STATE } from "@/server/validation/form";
import { attempted, keepsFormOnDisconnect, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";

/**
 * Skipping, undoing a skip, and moving one session (plan §7).
 *
 * Each acts on this session alone. Undoing a skip restores the same session rather than
 * creating a second one, and moving it changes its date without moving the day around it or
 * touching another sport.
 */
export function OccurrenceActions({
  occurrenceId,
  skipped,
  scheduledOn,
}: {
  occurrenceId: string;
  skipped: boolean;
  scheduledOn: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [moveState, moveAction] = useActionState(
    keepsFormOnDisconnect(rescheduleOccurrenceAction.bind(null, occurrenceId)),
    INITIAL_FORM_STATE,
  );

  return (
    <div className="space-y-3">
      <Card>
        <form action={moveAction} className="space-y-3">
          <Field
            label="Move to"
            info="Only this session moves. The week it was first placed in is still the one adherence counts it against."
            error={moveState.fieldErrors?.scheduledOn}
          >
            <Input name="scheduledOn" type="date" defaultValue={scheduledOn} required />
          </Field>
          <FormError message={moveState.formError} />
          <SubmitButton variant="secondary" size="md" pendingLabel="Moving…">
            Move it
          </SubmitButton>
        </form>
      </Card>

      <div className="space-y-1">
        <Button
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const attempt = await attempted(
                () =>
                  skipped
                    ? reopenOccurrenceAction(occurrenceId)
                    : skipOccurrenceAction(occurrenceId),
                OFFLINE_SUBMIT_MESSAGE,
              );
              if (!attempt.ok) setError(attempt.message);
              else if (!attempt.value.ok) setError(attempt.value.error);
            });
          }}
        >
          {pending ? "Saving…" : skipped ? "Put it back" : "Skip this session"}
        </Button>
        {skipped && (
          <p className="px-4 text-center text-sm text-ink-muted">
            A skipped session stays where it is. Logging it puts it back by itself.
          </p>
        )}
        {error && (
          <p role="alert" className="px-4 text-center text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
