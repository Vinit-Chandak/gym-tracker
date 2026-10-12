"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteActivityAction } from "@/server/actions/activities";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";

/** What deleting does to the planned session an activity answered: none, when it answered none. */
export type AnsweredOnDelete = "reopens" | "closed" | null;

/** Said after "This removes the log and its shared statistics". */
const ANSWERED: Record<NonNullable<AnsweredOnDelete>, string> = {
  reopens: ", and the planned session becomes loggable again",
  // Its programme has ended (ADR 0054): nothing can be logged against the session after this.
  closed: ", and the planned session cannot be logged again: its programme has ended",
};

/**
 * Deleting says what it will take with it before it takes it: the log, what a follower can
 * see of it, and the answer it gave to a planned session (plan §5.2). There is no undo, so
 * the confirmation is the safeguard, and it promises a session back only when it comes back.
 */
export function DeleteActivityButton({
  activityId,
  answered,
}: {
  activityId: string;
  answered: AnsweredOnDelete;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      {armed && (
        <p className="text-sm text-ink-muted">
          This removes the log and its shared statistics{answered ? ANSWERED[answered] : ""}. It
          cannot be undone.
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
        {pending ? "Deleting…" : armed ? "Tap again to delete" : "Delete activity"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
