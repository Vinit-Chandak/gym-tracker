"use client";

import { useState, useTransition } from "react";

import { PersonRow, type Person } from "@/components/person-row";
import { Button } from "@/components/ui/button";
import { attempted } from "@/lib/offline-submit";
import { acceptRequestAction, declineRequestAction } from "@/server/actions/follows";

const OFFLINE = "Could not save. Check your connection and try again.";

/**
 * Someone asking to follow you: Accept or Decline, no sheet for either. Accepting is what
 * they asked for; declining only deletes the request, and they can ask again.
 *
 * The person is a row of their own, opening their page; the two answers sit on the line
 * under the name, so a long name keeps the width it needs to read as a name.
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
      <PersonRow person={person} />
      {/* In line with the name: the avatar's width and its gap in from the row's edge. */}
      <div className="-mt-1 space-y-2 pr-4 pb-4 pl-16">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => answer(acceptRequestAction)}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => answer(declineRequestAction)}
          >
            Decline
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
