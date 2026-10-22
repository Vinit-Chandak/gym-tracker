"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { deleteActivityAction } from "@/server/actions/activities";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";

/** What deleting does to the planned session an activity answered: none, when it answered none. */
export type AnsweredOnDelete = "reopens" | "closed" | null;

/** Said after "Deletes this run for good." */
const ANSWERED: Record<NonNullable<AnsweredOnDelete>, string> = {
  reopens: " Its planned session can be logged again.",
  // Its programme has ended (ADR 0054): nothing can be logged against the session after this.
  closed: " Its programme has ended, so the session cannot be logged again.",
};

/**
 * Deleting says what it will take with it before it takes it, once and briefly: the record, for
 * good, and the answer it gave to a planned session (plan §5.2). There is no undo, so the
 * confirmation is the safeguard, and it promises a session back only when it comes back. Armed,
 * the button names what it does: "Delete this run".
 */
export function DeleteActivityButton({
  activityId,
  noun = "activity",
  answered,
}: {
  activityId: string;
  /** What it is: "run", "ride", "swim". */
  noun?: string;
  answered: AnsweredOnDelete;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      {armed && (
        <p className="text-sm text-ink-muted">
          Deletes this {noun} for good.{answered ? ANSWERED[answered] : ""}
        </p>
      )}
      <Button
        variant={armed ? "danger" : "ghost"}
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          startTransition(async () => {
            const attempt = await attempted(
              () => deleteActivityAction(activityId),
              OFFLINE_SUBMIT_MESSAGE,
            );
            if (!attempt.ok) setError(attempt.message);
            else if (attempt.value && !attempt.value.ok) setError(attempt.value.error);
          });
        }}
      >
        {pending ? "Deleting…" : armed ? `Delete this ${noun}` : "Delete activity"}
      </Button>
      {error && <FormError message={error} />}
    </div>
  );
}
