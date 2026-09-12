"use client";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { chooseTrainingModeAction } from "@/server/actions/coaching-workflow";

export function ProgrammeOptions({ onboarding = false }: { onboarding?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const base = onboarding ? "/welcome/programme" : "/settings/programme";
  return (
    <div className="space-y-3">
      <Card>
        <h2 className="text-lg font-medium">Create your own programme</h2>
        <p className="text-sm text-ink-muted">
          Give the AI coach your goals, schedule, a detailed prompt and any reports. Review its
          draft before you start.
        </p>
        <LinkButton href={`${base}/create` as Route}>Create with the coach</LinkButton>
      </Card>
      <Card>
        <h2 className="text-lg font-medium">Build it yourself</h2>
        <p className="text-sm text-ink-muted">
          Choose your own days, exercises and targets. No AI run needed.
        </p>
        <LinkButton href={`${base}/manual` as Route} variant="secondary">
          Build a programme
        </LinkButton>
      </Card>
      {onboarding && (
        <Button
          disabled={busy}
          variant="ghost"
          onClick={async () => {
            setBusy(true);
            const result = await chooseTrainingModeAction("track");
            if (result.ok) router.push("/today");
            else setError(result.error);
            setBusy(false);
          }}
        >
          Just track my workouts
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
