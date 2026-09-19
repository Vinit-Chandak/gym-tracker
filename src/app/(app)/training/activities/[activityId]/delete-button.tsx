"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteActivityAction } from "@/server/actions/activities";

/**
 * Deleting says what it will take with it before it takes it: the log, what a follower can
 * see of it, and the answer it gave to a planned session (plan §5.2). There is no undo, so
 * the confirmation is the safeguard.
 */
export function DeleteActivityButton({
  activityId,
  settlesOccurrence,
}: {
  activityId: string;
  settlesOccurrence: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      {armed && (
        <p className="text-sm text-ink-muted">
          This removes the log and its shared statistics
          {settlesOccurrence ? ", and the planned session becomes loggable again" : ""}. It cannot
          be undone.
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
            const result = await deleteActivityAction(activityId);
            if (result && !result.ok) setError(result.error);
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
