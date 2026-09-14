"use client";
import { coachingAction } from "./client-action";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { chooseTrainingModeAction } from "@/server/actions/coaching-workflow";

/**
 * The two ways to get a programme, and on the first run a third way to skip having one.
 *
 * `nested` is for a section that is already a box — Settings folds these away behind "Start a
 * new programme" — where a card inside a card inside a section draws three edges around one
 * choice. There they are ruled rows in the box that already exists; on their own, on the
 * first-run screen, they keep the box each.
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
  const base = onboarding ? "/welcome/programme" : "/settings/programme";
  return (
    <div className={nested ? "ruled-list" : "space-y-3"}>
      <Option nested={nested} title="Create your own programme">
        <p className="text-sm text-ink-muted">
          Answer a few questions and the coach writes it. You review the draft before you start.
        </p>
        <LinkButton href={`${base}/create` as Route} className="flex w-full">
          Create with the coach
        </LinkButton>
      </Option>
      <Option nested={nested} title="Build it yourself">
        <p className="text-sm text-ink-muted">
          Choose your own days, exercises and targets. No AI run needed.
        </p>
        <LinkButton href={`${base}/manual` as Route} variant="secondary" className="flex w-full">
          Build a programme
        </LinkButton>
      </Option>
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

function Option({
  title,
  nested,
  children,
}: {
  title: string;
  nested: boolean;
  children: ReactNode;
}) {
  const body = (
    <>
      <h3 className={nested ? "font-medium" : "text-lg font-medium"}>{title}</h3>
      {children}
    </>
  );
  return nested ? (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">{body}</div>
  ) : (
    <Card>{body}</Card>
  );
}
