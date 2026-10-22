"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { archiveProgramAction } from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";

/**
 * Ending a programme closes its outstanding sessions (ADR 0054), so the confirmation says what
 * goes and what stays. One verb, End, wherever a programme is ended (ADR 0058).
 */
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
        aria-label={`End ${ACTIVITY_SPORT_LABELS[sport].toLowerCase()} programme`}
        aria-expanded={confirming}
        aria-controls={confirming ? confirmationId : undefined}
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          setConfirming(!confirming);
        }}
      >
        End programme
      </Button>
      {confirming && (
        <div
          id={confirmationId}
          className="w-full space-y-3 rounded-control bg-surface-raised p-3 text-sm"
        >
          <p>
            End your {ACTIVITY_SPORT_LABELS[sport].toLowerCase()} programme? Its sessions from today
            on are removed, and any not done can then only be logged as unplanned. Everything you
            logged stays.
          </p>
          <FormError message={error ?? undefined} />
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
              {pending ? "Ending…" : "End programme"}
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
        </div>
      )}
    </>
  );
}
