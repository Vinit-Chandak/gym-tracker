"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { coachingAction } from "@/components/coaching/client-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requestProgramReviewAction } from "@/server/actions/coaching-workflow";

export type ReviewAvailability = {
  /** False when the coach cannot be started from this server at all. */
  offered: boolean;
  canAsk: boolean;
  /** A review is already queued or running, so asking again would only duplicate it. */
  running: boolean;
  /** The day they may ask again, already formatted, when this week's is spent. */
  nextOn: string | null;
};

/**
 * Asking for a review, and being told whether you can.
 *
 * The coach reviews on its own cadence — about once a week, on a day the athlete rested —
 * which is right until something changes that will not wait for it. One a week each, and the
 * card says which of the three states it is in rather than offering a button that refuses.
 */
export function RequestReview({ availability }: { availability: ReviewAvailability }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!availability.offered) return null;

  const ask = async () => {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => requestProgramReviewAction());
    if (result.ok) {
      setSent(true);
      router.refresh();
    } else setError(result.error ?? "Could not ask for a review. Please retry.");
    setBusy(false);
  };

  return (
    <Card>
      <h2 className="font-medium">Ask for a review</h2>
      <p className="text-sm text-ink-muted">
        {sent || availability.running
          ? "The coach is reviewing your programme. What it proposes appears here for you to approve."
          : availability.canAsk
            ? "The coach reviews your programme about once a week. Ask now if something has changed."
            : `You have asked for a review this week. You can ask again from ${availability.nextOn}; the weekly review runs either way.`}
      </p>
      {!sent && !availability.running && (
        <Button
          className="flex w-full"
          variant="secondary"
          disabled={busy || !availability.canAsk}
          onClick={ask}
        >
          {busy ? "Asking…" : "Review my programme"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
