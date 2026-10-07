"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { copyProgramAction, archiveProgramAction } from "@/server/actions/coaching-workflow";

/**
 * What you can do to a programme without opening it.
 *
 * The two edits are the same weight, so they share a row and split it evenly; on a phone the
 * row becomes two full-width buttons rather than two ragged ones. Archiving is the only one
 * that takes something away, so it sits under them and is replaced — not joined — by the
 * question it asks, which keeps one decision on screen at a time.
 */
export function ProgrammeTools({ id, active = true }: { id: string; active?: boolean }) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [busy, setBusy] = useState(false),
    [archive, setArchive] = useState(false),
    [error, setError] = useState<string | null>(null);
  const pending = busy || navigating;
  async function copy(duplicate: boolean) {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => copyProgramAction(id, duplicate));
    if (result.ok)
      startNavigation(() =>
        router.push(`/profile/programme/manual?draft=${result.value.id}` as Route),
      );
    else setError(result.error);
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-2 min-[420px]:grid-cols-2">
        {active && (
          <Button variant="secondary" disabled={pending} onClick={() => copy(false)}>
            Edit future programme
          </Button>
        )}
        <Button variant="secondary" disabled={pending} onClick={() => copy(true)}>
          Duplicate programme
        </Button>
      </div>
      {active &&
        (archive ? (
          <div className="space-y-3 rounded-control bg-surface-raised p-3 text-sm">
            <p>
              Archive this programme and stop scheduling its future sessions? Your completed
              workouts remain in history. You can duplicate the archived programme later.
            </p>
            <div className="grid gap-2 min-[420px]:grid-cols-2">
              <Button
                variant="danger"
                disabled={pending}
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
            className="flex w-full"
            disabled={pending}
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
      {navigating && (
        <p role="status" className="text-sm text-ink-2">
          Opening programme draft…
        </p>
      )}
    </div>
  );
}
