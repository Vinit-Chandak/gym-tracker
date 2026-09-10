"use client";

import { Timer } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { Row } from "@/components/ui/link-row";
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
    <div>
      <Row
        icon={Timer}
        title={
          <>
            Rest timer
            <InfoTip label="About the rest timer">
              Counts down each exercise&apos;s rest target after a set is saved.
            </InfoTip>
          </>
        }
      >
        <Switch label="Rest timer" checked={shown} onChange={change} disabled={pending} />
      </Row>
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
