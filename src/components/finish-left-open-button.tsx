"use client";

import { useState, useTransition } from "react";

import { Glyph } from "@/components/ui/glyphs";
import { useSessionDrafts } from "@/components/use-session-drafts";
import { attempted } from "@/lib/offline-submit";
import { finishLeftOpenAction } from "@/server/actions/sessions";

/**
 * "Finish it as of 19:30" (owner, 11 October 2026): a workout left open, finished as of its last
 * set, from Today's card or the workout itself. Nothing finishes it but this tap. It is the
 * card's quiet way out, as Discard empty session is (DESIGN.md, Activity cards), led by its
 * glyph. A set typed on this device and not saved holds it, as it holds Finish: finished, the
 * workout could no longer take that set. While the server answers it says so, a refusal is
 * said under it, and the answer is the workout's summary.
 */
export function FinishLeftOpenButton({
  userId,
  sessionId,
  at,
  held = false,
  explainHeld = true,
}: {
  userId: string;
  sessionId: string;
  /** The last set's time as the screen says it: "19:30", "Sat 10 Oct, 19:30". */
  at: string;
  /** Held for a reason the screen knows of its own: the workout's Finish is held. */
  held?: boolean;
  /** Say why it is held. The workout says so already, beside its own Finish. */
  explainHeld?: boolean;
}) {
  const drafts = useSessionDrafts(userId, sessionId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const finish = () =>
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(
        () => finishLeftOpenAction(sessionId),
        "Connection lost. Try again when connected.",
      );
      if (!outcome.ok) setError(outcome.message);
      else if (outcome.value && !outcome.value.ok) setError(outcome.value.error);
    });
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="quiet-action"
        disabled={pending || held || drafts > 0}
        onClick={finish}
      >
        <Glyph name="check" className="glyph-18" />
        <span className="min-w-0 [overflow-wrap:break-word]">
          {pending ? "Finishing…" : `Finish it as of ${at}`}
        </span>
      </button>
      {drafts > 0 && explainHeld && (
        <p className="type-meta-small text-ink-2">
          {drafts === 1
            ? "A set on this device is not saved yet. Resume to save or remove it first."
            : "Sets on this device are not saved yet. Resume to save or remove them first."}
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 type-meta font-semibold">
          <Glyph name="warn" className="mt-px glyph-18" />
          <span className="min-w-0 [overflow-wrap:break-word]">{error}</span>
        </p>
      )}
    </div>
  );
}
