"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import {
  removeOccurrenceAction,
  reopenOccurrenceAction,
  rescheduleOccurrenceAction,
  skipOccurrenceAction,
} from "@/server/actions/occurrences";
import { INITIAL_FORM_STATE } from "@/server/validation/form";
import { attempted, keepsFormOnDisconnect, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";

/**
 * Skipping, undoing a skip, and moving one session (plan §7) — and, for a session the athlete
 * put on the calendar themselves, taking it off again.
 *
 * Each acts on this session alone. Undoing a skip restores the same session rather than
 * creating a second one, and moving it changes its date without moving the day around it or
 * touching another sport. A session moves to a day still to come, never into the past.
 */
export function OccurrenceActions({
  occurrenceId,
  skipped,
  scheduledOn,
  today,
  standalone,
}: {
  occurrenceId: string;
  skipped: boolean;
  scheduledOn: string;
  /** The athlete's today, the earliest day a session can be moved to. */
  today: string;
  /** Scheduled by the athlete rather than the programme: no week to count against, and removable. */
  standalone: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);
  const [moveState, moveAction] = useActionState(
    keepsFormOnDisconnect(rescheduleOccurrenceAction.bind(null, occurrenceId)),
    INITIAL_FORM_STATE,
  );

  /** Runs one action, its refusal said beside the button that asked for it. */
  const run = (
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    say: (message: string | null) => void,
  ) => {
    setError(null);
    setRemoveError(null);
    startTransition(async () => {
      const attempt = await attempted(action, OFFLINE_SUBMIT_MESSAGE);
      if (!attempt.ok) say(attempt.message);
      else if (attempt.value && !attempt.value.ok) say(attempt.value.error);
    });
  };

  return (
    <div className="space-y-3">
      <Card>
        <Button
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                skipped ? reopenOccurrenceAction(occurrenceId) : skipOccurrenceAction(occurrenceId),
              setError,
            )
          }
        >
          {pending ? "Saving…" : skipped ? "Put it back" : "Skip this session"}
        </Button>
        {skipped && (
          <p className="text-sm text-ink-muted">
            {standalone
              ? "Logging it anyway puts it back by itself."
              : "Skipped sessions stay in the programme. Logging one puts it back by itself."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      <Card>
        <form action={moveAction} className="space-y-2">
          <Field label="Move to" error={moveState.fieldErrors?.scheduledOn}>
            {/* A missed session opens on today, the first day it can go to. */}
            <Input
              name="scheduledOn"
              type="date"
              min={today}
              defaultValue={
                moveState.values?.scheduledOn ?? (scheduledOn < today ? today : scheduledOn)
              }
              required
            />
          </Field>
          <p className="text-sm text-ink-muted">
            {standalone
              ? "Only this session moves."
              : "Only this session moves. The week it was first placed in is what adherence counts against."}
          </p>
          <FormError message={moveState.formError} />
          <SubmitButton pendingLabel="Moving…">Move it</SubmitButton>
        </form>
      </Card>

      {standalone && (
        // Removing has no undo, so it asks twice, as deleting an activity does.
        <Card>
          {removing && (
            <p className="text-sm text-ink-muted">
              This takes it off Scheduled and Today. It cannot be undone.
            </p>
          )}
          <Button
            variant={removing ? "danger" : "ghost"}
            className="w-full"
            disabled={pending}
            onClick={() => {
              if (!removing) {
                setRemoving(true);
                return;
              }
              run(() => removeOccurrenceAction(occurrenceId), setRemoveError);
            }}
          >
            {pending ? "Saving…" : removing ? "Tap again to remove" : "Remove from the calendar"}
          </Button>
          {removeError && (
            <p role="alert" className="text-sm text-danger">
              {removeError}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
