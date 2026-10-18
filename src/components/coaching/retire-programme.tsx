"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ActivitySport } from "@/domain/activity";
import { archiveProgramAction } from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";

/** Retiring closes outstanding sessions (ADR 0054), so explain that before confirming. */
export function RetireProgramme({
  id,
  sport,
  disabled = false,
}: {
  id: string;
  sport: ActivitySport;
  disabled?: boolean;
}) {
  const router = useRouter();
  const confirmationId = useId();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        aria-label={`Retire programme: ${sport}`}
        aria-expanded={confirming}
        aria-controls={confirming ? confirmationId : undefined}
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          setConfirming(!confirming);
        }}
      >
        Retire programme
      </Button>
      {confirming && (
        <div
          id={confirmationId}
          className="w-full space-y-3 rounded-control bg-surface-raised p-3 text-sm"
        >
          <p>
            Retire your {sport} programme and stop scheduling its future sessions? Your completed
            workouts remain in history. Its unfinished or skipped sessions can then only be logged
            on their own. You can find and duplicate the programme later in Archived programmes.
          </p>
          <div className="grid gap-2 min-[420px]:grid-cols-2">
            <Button
              variant="danger"
              disabled={disabled || pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await coachingAction(() => archiveProgramAction(id));
                  if (!result.ok) setError(result.error);
                  else {
                    setConfirming(false);
                    router.refresh();
                  }
                });
              }}
            >
              {pending ? "Retiring…" : "Retire this programme"}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
            >
              Keep it
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
