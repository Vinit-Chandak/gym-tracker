"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { coachingAction } from "@/components/coaching/client-action";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { chooseTrainingModeAction } from "@/server/actions/coaching-workflow";

/**
 * Board How do you want to start?: "Log my own workouts", the main action for someone who
 * already trains. It ends setup with no programme, says so to Today, and opens it.
 */
export function LogOwnWorkouts() {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || navigating;
  return (
    <PinnedActions stack>
      <FormError message={error ?? undefined} />
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setSaving(true);
          setError(null);
          const result = await coachingAction(() => chooseTrainingModeAction("track"));
          if (result.ok) startNavigation(() => router.push("/today"));
          else setError(result.error);
          setSaving(false);
        }}
      >
        {busy ? "Opening Today…" : "Log my own workouts"}
      </Button>
    </PinnedActions>
  );
}
