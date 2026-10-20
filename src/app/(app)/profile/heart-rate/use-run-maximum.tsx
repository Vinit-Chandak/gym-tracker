"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { attempted } from "@/lib/offline-submit";
import { adoptRunMaxHeartRateAction } from "@/server/actions/heart-rate";

/**
 * A run of the athlete's recorded more than the maximum in use: said once, with the run's date,
 * and one tap makes it the maximum. Left alone it changes nothing — a reading may be a glitch.
 */
export function UseRunMaximum({ bpm, on }: { bpm: number; on: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      {/* Higher than the maximum above, which the figure and the button say between them. */}
      <p className="type-meta">
        A run on {on} reached <span className="font-bold tabular-nums">{bpm} bpm</span>.
      </p>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const outcome = await attempted(
              () => adoptRunMaxHeartRateAction(),
              "Could not save. Check your connection and try again.",
            );
            if (!outcome.ok) setError(outcome.message);
          })
        }
      >
        {pending ? "Saving…" : `Use ${bpm} as my maximum`}
      </Button>
      {error && (
        <p role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}
    </Card>
  );
}
