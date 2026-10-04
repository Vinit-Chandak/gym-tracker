"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { attempted } from "@/lib/offline-submit";
import { discardSessionAction } from "@/server/actions/sessions";

/**
 * Throwing away a session that has nothing in it. It asks nothing, because nothing is lost: a
 * session with a set in it is never discarded, only finished. While the server answers it says
 * so, a refusal is said under it, and the server's answer is Today without the session.
 *
 * `quiet` is the way out under a card's Resume (DESIGN.md, Today): led by its glyph, at the
 * card's left edge, never in the primary place. `primary` is the first choice where finishing
 * would only record nothing (Finish, with no sets logged).
 */
export function DiscardSessionButton({
  sessionId,
  label = "Discard empty session",
  variant = "quiet",
  disabled = false,
}: {
  sessionId: string;
  label?: string;
  variant?: "quiet" | "primary";
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const discard = () =>
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(
        () => discardSessionAction(sessionId),
        "Connection lost. Try again when connected.",
      );
      if (!outcome.ok) setError(outcome.message);
      else if (outcome.value && !outcome.value.ok) setError(outcome.value.error);
    });
  const words = pending ? "Discarding…" : label;
  return (
    <div className="space-y-1">
      {variant === "primary" ? (
        <Button size="lg" className="w-full" disabled={pending || disabled} onClick={discard}>
          <Glyph name="trash" className="glyph-20" />
          {words}
        </Button>
      ) : (
        <button
          type="button"
          className="quiet-action"
          disabled={pending || disabled}
          onClick={discard}
        >
          <Glyph name="trash" className="glyph-18" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{words}</span>
        </button>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 type-meta font-semibold">
          <Glyph name="warn" className="mt-px glyph-18" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
        </p>
      )}
    </div>
  );
}
