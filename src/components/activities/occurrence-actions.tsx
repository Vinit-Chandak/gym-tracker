"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
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
 * touching another sport. A session moves to a day still to come, never into the past. Logging
 * is the page's one primary; these stand quieter under it.
 *
 * Putting back a programme run the sequence has gone past sends the programme back to it
 * (ADR 0051), which can be cycles back for a run "Pick up from today" skipped; that is a tap
 * away beside the button, before it is tapped.
 */
export function OccurrenceActions({
  occurrenceId,
  skipped,
  scheduledOn,
  today,
  standalone,
  putBackGoesNext = false,
}: {
  occurrenceId: string;
  skipped: boolean;
  scheduledOn: string;
  /** The athlete's today, the earliest day a session can be moved to. */
  today: string;
  /** Scheduled by the athlete rather than the programme: removable. */
  standalone: boolean;
  /** Put back, it is owed before what the programme has reached, and Today offers it next. */
  putBackGoesNext?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);
  const [moveState, moveAction] = useActionState(
    keepsFormOnDisconnect(rescheduleOccurrenceAction.bind(null, occurrenceId)),
    INITIAL_FORM_STATE,
  );
  const moveForm = useKeptForm();

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

  // The session's other ways, one card under Log (owner, 28 October 2026): Skip, then Move with
  // its day, then, for a session the athlete put there, Remove; each its own row.
  return (
    <div className="ov-panel ov-panel-list occurrence-actions">
      <div className="occurrence-action">
        <button
          type="button"
          className="occurrence-action-button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                skipped ? reopenOccurrenceAction(occurrenceId) : skipOccurrenceAction(occurrenceId),
              setError,
            )
          }
        >
          <span className="mark-cell">
            <Glyph name={skipped ? "undo" : "skip"} className="glyph-20" />
          </span>
          {pending ? "Saving…" : skipped ? "Put it back" : "Skip this session"}
        </button>
        {skipped && putBackGoesNext && (
          <InfoTip label="About putting it back">
            The programme goes back to this session, and Today offers it next.
          </InfoTip>
        )}
      </div>
      {error && <FormError message={error} />}

      <form ref={moveForm} action={moveAction} className="occurrence-move">
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
        <FormError message={moveState.formError} />
        <SubmitButton variant="secondary" pendingLabel="Moving…">
          Move it
        </SubmitButton>
      </form>

      {standalone && (
        // Removing has no undo, so it asks twice, as deleting an activity does.
        <div className="occurrence-remove">
          {removing ? (
            <>
              <p className="text-sm text-ink-muted">It cannot be undone.</p>
              <Button
                variant="danger"
                className="w-full"
                disabled={pending}
                onClick={() => run(() => removeOccurrenceAction(occurrenceId), setRemoveError)}
              >
                {pending ? "Saving…" : "Remove this session"}
              </Button>
            </>
          ) : (
            <button
              type="button"
              className="occurrence-action-button"
              disabled={pending}
              onClick={() => setRemoving(true)}
            >
              <span className="mark-cell">
                <Glyph name="trash" className="glyph-20" />
              </span>
              Remove from the calendar
            </button>
          )}
          {removeError && <FormError message={removeError} />}
        </div>
      )}
    </div>
  );
}
