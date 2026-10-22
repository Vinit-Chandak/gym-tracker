"use client";

import { FormError } from "@/components/ui/form";
import { useOptimistic, useState, useTransition } from "react";

import { Glyph } from "@/components/ui/glyphs";
import { Switch } from "@/components/ui/switch";
import { setRestTimerEnabledAction } from "@/server/actions/sessions";
import { attempted } from "@/lib/offline-submit";

/** One row, one switch (board Profile). The state is visible; nothing needs to say it. */
export function RestTimerSetting({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);

  const change = (next: boolean) =>
    startTransition(async () => {
      show(next);
      setError(null);
      const outcome = await attempted(
        () => setRestTimerEnabledAction(next),
        "Could not save. Check your connection and try again.",
      );
      // As in the privacy switches: after an await an update is no longer the transition's
      // own, so the error is marked as one to arrive with the switch going back.
      if (!outcome.ok) startTransition(() => setError(outcome.message));
    });

  return (
    <li className="nav-row-item">
      <div className="nav-row">
        <span className="mark-cell">
          <Glyph name="rest" className="glyph-20" />
        </span>
        <span className="nav-row-label">Rest timer</span>
        <Switch label="Rest timer" checked={shown} onChange={change} disabled={pending} />
      </div>
      {error && <FormError message={error ?? undefined} />}
    </li>
  );
}
