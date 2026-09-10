"use client";

import { useOptimistic, useState, useTransition } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { Switch } from "@/components/ui/switch";
import { setRestTimerEnabledAction } from "@/server/actions/sessions";

/** One row, one switch. The state is visible; nothing needs to say what it currently is. */
export function RestTimerSetting({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);

  const change = (next: boolean) =>
    startTransition(async () => {
      show(next);
      setError(null);
      try {
        await setRestTimerEnabledAction(next);
      } catch {
        setError("Could not save. Check your connection and try again.");
      }
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="flex items-center gap-1 font-medium">
        Rest timer
        <InfoTip label="About the rest timer">
          Counts down each exercise&apos;s rest target after a set is saved.
        </InfoTip>
      </p>
      <Switch label="Rest timer" checked={shown} onChange={change} disabled={pending} />
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
