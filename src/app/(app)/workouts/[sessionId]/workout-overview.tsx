"use client";

import { ChevronRight } from "lucide-react";
import { useTransition, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { formatSets } from "@/domain/sets";
import { cn } from "@/lib/utils";
import { setWarmupCompletedAction } from "@/server/actions/sessions";

import type { ExerciseVM, SessionVM } from "./view-model";

/** What the row's action says, which is also what tapping it does. */
function rowAction(exercise: ExerciseVM): { label: string; tone: "accent" | "muted" } {
  if (exercise.skippedAt) return { label: "Skipped", tone: "muted" };
  if (exercise.completedAt) return { label: "Done", tone: "muted" };
  return exercise.sets.length > 0
    ? { label: "Resume", tone: "accent" }
    : { label: "Start", tone: "accent" };
}

/** Progress and machine on one line. Status lives in the action, so it is not repeated here. */
function progressLine(exercise: ExerciseVM): string {
  const logged = exercise.sets.length;
  const planned = exercise.planned?.sets ?? null;
  const count =
    planned !== null
      ? `${logged} of ${planned} sets`
      : `${logged} ${logged === 1 ? "set" : "sets"}`;
  const machine = exercise.equipment?.name;
  const values = logged > 0 ? formatSets(exercise.sets) : null;
  return [count, machine, values].filter(Boolean).join(" · ");
}

type OverviewProps = {
  session: SessionVM;
  readOnly: boolean;
  holdAll: boolean;
  onHoldAllChange: (value: boolean) => void;
  hasDrafts: boolean;
  onOpenExercise: (workoutExerciseId: string) => void;
  onOpenDetails: () => void;
  onEditSuperset: (group: string | null) => void;
};

export function WorkoutOverview({
  session,
  readOnly,
  holdAll,
  onHoldAllChange,
  hasDrafts,
  onOpenExercise,
  onOpenDetails,
  onEditSuperset,
}: OverviewProps) {
  const [warmupDone, setWarmupDone] = useState(session.warmupCompleted);
  const [warmupError, setWarmupError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleWarmup = () =>
    startTransition(async () => {
      try {
        const result = await setWarmupCompletedAction(session.id, !warmupDone);
        if (!result.ok) {
          setWarmupError(result.error);
          return;
        }
      } catch {
        setWarmupError("Connection lost. Try again when connected.");
        return;
      }
      setWarmupDone(!warmupDone);
      setWarmupError(null);
    });

  const groups = [
    ...new Set(
      session.exercises
        .map((exercise) => exercise.supersetGroup)
        .filter((group): group is string => group !== null),
    ),
  ];

  return (
    <div className="space-y-[var(--section-gap)]">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onOpenDetails}>
          Session details
        </Button>
        {!readOnly &&
          (hasDrafts ? (
            <Button size="sm" disabled>
              Save drafts first
            </Button>
          ) : (
            <LinkButton href={`/workouts/${session.id}/finish`} size="sm">
              Finish session
            </LinkButton>
          ))}
      </div>

      {!readOnly && hasDrafts && (
        <p role="status" className="text-sm text-warning">
          Unsaved set drafts on this device. Save or remove them before finishing.
        </p>
      )}

      {!readOnly && session.warnings.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">Recovery check</h2>
            <Badge tone="warning">Advice</Badge>
          </div>
          <ul className="space-y-2 text-sm">
            {session.warnings.map((warning) => (
              <li key={warning.code}>
                <span className="font-medium">{warning.title}.</span>{" "}
                <span className="text-ink-muted">{warning.advice}</span>
              </li>
            ))}
          </ul>
          <Button
            variant={holdAll ? "primary" : "secondary"}
            size="sm"
            aria-pressed={holdAll}
            onClick={() => onHoldAllChange(!holdAll)}
          >
            {holdAll ? "Holding loads today ✓" : "Hold loads today"}
          </Button>
          <p className="text-xs text-ink-subtle">
            Advice only. Holding prefills last session&apos;s loads instead of the rule&apos;s
            targets; any set can still be changed.
          </p>
        </Card>
      )}

      {!readOnly && session.warmup && (
        <Disclosure
          summary={`Warm-up · ${session.warmup.name}`}
          meta={warmupDone ? "Done" : undefined}
        >
          <ol className="space-y-1 text-sm">
            {session.warmup.drills.map((drill) => (
              <li key={drill.order} className="flex justify-between gap-3">
                <span className="min-w-0">{drill.name}</span>
                <span className="shrink-0 text-ink-muted">{drill.dose}</span>
              </li>
            ))}
          </ol>
          {warmupError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {warmupError}
            </p>
          )}
          <Button
            variant={warmupDone ? "secondary" : "primary"}
            size="sm"
            className="mt-2"
            onClick={toggleWarmup}
            disabled={pending}
          >
            {pending ? "Saving…" : warmupDone ? "Done ✓" : "Mark done"}
          </Button>
        </Disclosure>
      )}

      {session.exercises.length === 0 ? (
        <p className="text-sm text-ink-muted">No exercises yet. Add one to start logging.</p>
      ) : (
        <ul className="border-y border-line">
          {session.exercises.map((exercise, index) => {
            const action = rowAction(exercise);
            const group = exercise.supersetGroup;
            // A group's label is drawn once, at the first of its rows.
            const startsGroup =
              group !== null && session.exercises[index - 1]?.supersetGroup !== group;
            return (
              <li
                key={exercise.id}
                className={cn(index > 0 && !startsGroup && "border-t border-line")}
              >
                {startsGroup && (
                  <div className="flex items-center justify-between gap-2 border-t border-line pt-2 pb-1">
                    <span className="text-xs font-medium tracking-wide text-accent uppercase">
                      {group}
                    </span>
                    {!readOnly && (
                      <Button variant="ghost" size="sm" onClick={() => onEditSuperset(group)}>
                        Edit
                      </Button>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onOpenExercise(exercise.id)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 py-3 text-left active:bg-surface-raised",
                    // A modest rule, not a second panel: the row itself is unchanged.
                    group !== null && "border-l-2 border-accent pl-3",
                  )}
                >
                  <span className="w-5 shrink-0 text-sm text-ink-subtle tabular-nums">
                    {exercise.orderIndex}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium [overflow-wrap:anywhere]">
                      {exercise.exercise.name}
                    </span>
                    <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted">
                      {progressLine(exercise)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium",
                      action.tone === "accent" ? "text-accent" : "text-ink-muted",
                    )}
                  >
                    {action.label}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && (
        <div className="grid grid-cols-2 gap-2">
          <LinkButton
            href={`/workouts/${session.id}/add-exercise`}
            variant="secondary"
            className="w-full"
          >
            Add exercise
          </LinkButton>
          <Button
            variant="secondary"
            className="w-full"
            disabled={session.exercises.length < 2}
            onClick={() => onEditSuperset(null)}
          >
            Superset
          </Button>
        </div>
      )}
      {!readOnly && groups.length > 0 && (
        <p className="text-xs text-ink-subtle">
          {groups.length === 1 ? "One superset" : `${groups.length} supersets`} in this workout
          only. Your programme is unchanged.
        </p>
      )}
    </div>
  );
}
