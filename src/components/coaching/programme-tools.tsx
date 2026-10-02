"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { copyProgramAction, archiveProgramAction } from "@/server/actions/coaching-workflow";

/**
 * What you can do to a programme without opening it.
 *
 * The two edits are the same weight, so they share a row and split it evenly; on a phone the
 * row becomes two full-width buttons rather than two ragged ones. Archiving is the only one
 * that takes something away, so it is a word in the red pen under them, and is replaced —
 * not joined — by the question it asks, on a panel that stands off the page, which keeps one
 * decision on screen at a time.
 */
export function ProgrammeTools({ id, active = true }: { id: string; active?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [archive, setArchive] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function copy(duplicate: boolean) {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => copyProgramAction(id, duplicate));
    if (result.ok) router.push(`/profile/programme/manual?draft=${result.value.id}` as Route);
    else setError(result.error);
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <div className="action-row">
        {active && (
          <Button variant="secondary" disabled={busy} onClick={() => copy(false)}>
            Edit future programme
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => copy(true)}>
          Duplicate programme
        </Button>
      </div>
      {active &&
        (archive ? (
          <div
            role="group"
            aria-label="Archive this programme?"
            className="panel space-y-3 panel-padding text-sm"
          >
            <p>
              Archive this programme and stop scheduling its future sessions? Your completed
              workouts remain in history. You can duplicate the archived programme later.
            </p>
            <div className="action-row">
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const result = await coachingAction(() => archiveProgramAction(id));
                  if (!result.ok) setError(result.error);
                  setArchive(false);
                  setBusy(false);
                }}
              >
                Archive this programme
              </Button>
              <Button variant="ghost" onClick={() => setArchive(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="flex w-full text-danger hover:text-danger"
            disabled={busy}
            onClick={() => setArchive(true)}
          >
            Archive programme
          </Button>
        ))}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
