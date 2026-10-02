"use client";

import { useState, useTransition } from "react";

import { PersonRow, type Person } from "@/components/person-row";
import { Button } from "@/components/ui/button";
import { attempted } from "@/lib/offline-submit";
import { acceptRequestAction, declineRequestAction } from "@/server/actions/follows";

const OFFLINE = "Could not save. Check your connection and try again.";

/**
 * Someone asking to follow you: Accept, ruled, and Decline, a word in the red pen. No sheet
 * for either: accepting is what they asked for, and declining only deletes the request, so
 * they can ask again. Neither takes the highlighter — a list of requests is not one action.
 */
export function RequestRow({ person }: { person: Person & { id: string } }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const answer = (action: (id: string) => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(() => action(person.id), OFFLINE);
      if (!outcome.ok) setError(outcome.message);
    });
  return (
    <div>
      <PersonRow person={person}>
        {/* Two buttons beside a name is a row on most phones; on a 320px one they stack, so
            the name keeps enough width to read as a word. */}
        <span className="flex shrink-0 flex-col gap-1 min-[400px]:flex-row min-[400px]:gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => answer(acceptRequestAction)}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            disabled={pending}
            onClick={() => answer(declineRequestAction)}
          >
            Decline
          </Button>
        </span>
      </PersonRow>
      {error && (
        <p role="alert" className="pb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
