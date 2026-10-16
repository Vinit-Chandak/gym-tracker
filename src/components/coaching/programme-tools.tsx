"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyProgramAction, archiveProgramAction } from "@/server/actions/coaching-workflow";

/**
 * What you can do to a programme without opening it.
 *
 * The two edits are the same weight, so they share a row and split it evenly; on a phone the
 * row becomes two full-width buttons rather than two ragged ones. Archiving is the only one
 * that takes something away, so it sits under them and is replaced — not joined — by the
 * question it asks, which keeps one decision on screen at a time. A finished programme has no
 * future to edit, so it keeps only its copy, to train again, and the archive. The question says
 * what archiving closes as well as what it stops (ADR 0054): a session it still owes, or one
 * skipped, is logged on its own from then on, and neither a copy nor anything else reopens it.
 */
export function ProgrammeTools({
  id,
  active = true,
  finished = false,
}: {
  id: string;
  active?: boolean;
  /** Nothing but rest is left (ADR 0051): "Edit future programme" would edit nothing. */
  finished?: boolean;
}) {
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
        router.push(
          (result.value.sport === "strength"
            ? `/profile/programme/manual?draft=${result.value.id}`
            : `/training/programmes/${result.value.sport}/edit?draft=${result.value.id}`) as Route,
        ),
      );
    else setError(result.error);
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <div className={cn("grid gap-2", !finished && "min-[420px]:grid-cols-2")}>
        {active && !finished && (
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
              workouts remain in history. Its sessions still owed or skipped can then only be logged
              on their own. You can duplicate the archived programme later.
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
