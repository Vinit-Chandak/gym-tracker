"use client";
import { coachingAction } from "./client-action";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { chooseTrainingModeAction } from "@/server/actions/coaching-workflow";
import { cn } from "@/lib/utils";

/**
 * The two ways to get a programme, and on the first run a third way to skip having one.
 *
 * Two ruled rows of one block: a title, the sentence that says what it costs, and the way in.
 * The coach's way carries the highlighter, because the coach is what the app is for; the
 * other is ruled. `nested` drops the outer rules for a section that is already a block —
 * Profile folds these away behind "Start a new programme".
 */
export function ProgrammeOptions({
  onboarding = false,
  nested = false,
}: {
  onboarding?: boolean;
  nested?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const base = onboarding ? "/welcome/programme" : "/profile/programme";
  return (
    <div className="space-y-3">
      <ul className={cn("min-w-0", nested ? "ruled-list" : "box-rows")}>
        <Option title="Create your own programme">
          <p className="text-sm text-ink-muted">
            Answer a few questions and the coach writes it. You review the draft before you start.
          </p>
          <LinkButton href={`${base}/create` as Route} className="flex w-full">
            Create with the coach
          </LinkButton>
        </Option>
        <Option title="Build it yourself">
          <p className="text-sm text-ink-muted">
            Choose your own days, exercises and targets. No AI run needed.
          </p>
          <LinkButton href={`${base}/manual` as Route} variant="secondary" className="flex w-full">
            Build a programme
          </LinkButton>
        </Option>
      </ul>
      {onboarding && (
        <Button
          disabled={busy}
          variant="ghost"
          className="flex w-full"
          onClick={async () => {
            setBusy(true);
            const result = await coachingAction(() => chooseTrainingModeAction("track"));
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

function Option({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="space-y-3 py-4">
      <h3 className="text-lg">{title}</h3>
      {children}
    </li>
  );
}
