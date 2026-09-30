"use client";

import { useState } from "react";

import { coachingAction } from "@/components/coaching/client-action";
import { Button } from "@/components/ui/button";
import { requestProgramReviewAction } from "@/server/actions/coaching-workflow";

export type ReviewAvailability = {
  /** False when the coach cannot be started from this server at all. */
  offered: boolean;
  canAsk: boolean;
  /** A review is being worked, or a run is on its way to it: asking again would duplicate it. */
  running: boolean;
  /**
   * A review nothing will pick up before the coach's next nightly run. Asking starts that
   * one now; `attempted` when the coach tried and could not finish it.
   */
  waiting?: { attempted: boolean } | null;
  /** The day they may ask again, already formatted, when the allowance is spent. */
  nextOn: string | null;
  /** When the coach last reviewed the programme, already formatted. */
  lastOn?: string | null;
};

/**
 * Asking for a review, in one button and at most one line.
 *
 * The coach reviews on its own cadence, which is right until something changes that will not
 * wait for it. The line under the button says the one thing worth knowing at that moment:
 * that a review is running, when the last one was, or when the allowance comes back.
 */
export function RequestReview({ availability }: { availability: ReviewAvailability }) {
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
    } else setError(result.error ?? "Could not ask for a review. Please retry.");
    setBusy(false);
  };

  const reviewing = sent || availability.running;
  const waiting = !reviewing ? availability.waiting : null;
  // Queued used to read as reviewing: a review that failed at four in the morning said the
  // coach was reviewing all day, and hid the button that could have started it.
  const line = reviewing
    ? "The coach is reviewing your programme."
    : waiting
      ? `${
          waiting.attempted
            ? "The coach could not finish your last review."
            : "Your review has not started yet."
        } It tries again at its next nightly run, or ask for it now.`
      : !availability.canAsk
        ? `You can ask again from ${availability.nextOn}.`
        : availability.lastOn
          ? `Last reviewed ${availability.lastOn}.`
          : null;

  return (
    <div className="space-y-1.5">
      {!reviewing && (
        <Button
          className="flex w-full"
          variant="secondary"
          disabled={busy || !availability.canAsk}
          onClick={ask}
        >
          {busy
            ? "Asking…"
            : waiting
              ? "Ask the coach to review now"
              : "Ask the coach for a review"}
        </Button>
      )}
      {line && <p className="px-1 text-center text-xs text-ink-muted">{line}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
