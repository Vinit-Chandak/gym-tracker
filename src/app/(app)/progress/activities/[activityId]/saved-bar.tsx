"use client";

import { useTransition } from "react";

import { SavedNotice } from "@/components/ui/saved-notice";
import { deleteActivityAction } from "@/server/actions/activities";

/**
 * A record just saved says so on its own page (DESIGN.md, Inputs and choices: a record kept):
 * "Run saved as intervals", with Undo for a new record, which removes it and goes back to the tab
 * it was logged from. A correction says "Changes saved" and has no Undo: undoing it would delete
 * the record, not the change.
 */
export function SavedBar({
  activityId,
  said,
  undo,
  origin,
}: {
  activityId: string;
  said: string;
  /** Only a new record can be undone. */
  undo: boolean;
  origin: string | null;
}) {
  const [undoing, startUndo] = useTransition();
  return (
    <div className="mt-3">
      <SavedNotice
        action={
          undo ? (
            <button
              type="button"
              className="min-h-[var(--ov-target)] shrink-0 px-2 font-bold text-success-text underline underline-offset-2 disabled:opacity-60"
              disabled={undoing}
              onClick={() =>
                startUndo(async () => {
                  await deleteActivityAction(activityId, origin);
                })
              }
            >
              {undoing ? "Undoing…" : "Undo"}
            </button>
          ) : undefined
        }
      >
        {said}
      </SavedNotice>
    </div>
  );
}
