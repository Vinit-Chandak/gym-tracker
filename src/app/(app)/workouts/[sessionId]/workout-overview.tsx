"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useTransition, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { formatSets } from "@/domain/sets";
import { supersetHues, supersetStyle } from "@/lib/superset-colors";
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

/**
 * One row, closed by default: the drills are there when wanted, and marking the warm-up
 * done needs no opening. A native <details> cannot hold a second button in its summary,
 * so the toggle and the action are siblings on the same line.
 */
function WarmupRow({
  session,
  done,
  onDone,
}: {
  session: SessionVM & { warmup: NonNullable<SessionVM["warmup"]> };
  done: boolean;
  onDone: (done: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleDone = () =>
    startTransition(async () => {
      try {
        const result = await setWarmupCompletedAction(session.id, !done);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } catch {
        setError("Connection lost. Try again when connected.");
        return;
      }
      onDone(!done);
      setError(null);
    });

  return (
    <div className="border-y border-line">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm font-medium"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)]",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">Warm-up</span>
          <span className="shrink-0 text-xs font-normal text-ink-muted tabular-nums">
            {session.warmup.drills.length} drills
          </span>
        </button>
        <Button
          variant={done ? "secondary" : "primary"}
          size="sm"
          className="shrink-0"
          onClick={toggleDone}
          disabled={pending}
          aria-pressed={done}
        >
          {pending ? "Saving…" : done ? "Done ✓" : "Mark done"}
        </Button>
      </div>
      {open && (
        <ol className="pb-2 text-sm ruled-list">
          {session.warmup.drills.map((drill) => (
            <li key={drill.order} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0">{drill.name}</span>
              <span className="shrink-0 text-right text-ink-muted">{drill.dose}</span>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="pb-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
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
  const hues = supersetHues(session.exercises);

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
            <h2 className="flex items-center gap-1 text-base font-medium">
              Recovery check
              <InfoTip label="About holding loads">
                Advice only. Holding prefills last session&apos;s loads instead of the rule&apos;s
                targets; any set can still be changed.
              </InfoTip>
            </h2>
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
        </Card>
      )}

      {!readOnly && session.warmup && (
        <WarmupRow
          session={{ ...session, warmup: session.warmup }}
          done={warmupDone}
          onDone={setWarmupDone}
        />
      )}

      {session.exercises.length === 0 ? (
        <p className="text-sm text-ink-muted">No exercises yet.</p>
      ) : (
        <ul className="border-y border-line ruled-list">
          {session.exercises.map((exercise) => {
            const action = rowAction(exercise);
            const hue = exercise.supersetGroup ? hues.get(exercise.supersetGroup) : undefined;
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => onOpenExercise(exercise.id)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 py-3 text-left active:bg-surface-raised",
                    // Rows in a superset share one colour; nothing else marks the group.
                    hue && "superset-row",
                  )}
                  style={hue ? supersetStyle(hue) : undefined}
                >
                  <span
                    className="w-5 shrink-0 text-sm text-ink-subtle tabular-nums"
                    style={hue ? { color: "var(--superset-color)" } : undefined}
                  >
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
        <div className="action-row">
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
            {hues.size > 0 ? "Supersets" : "Superset"}
          </Button>
        </div>
      )}
    </div>
  );
}
