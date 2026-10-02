"use client";

import { Check, ChevronDown, ChevronRight, Pencil } from "@/components/ui/icons";
import { useTransition, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { formatSets } from "@/domain/sets";
import { supersetHues, supersetStyle } from "@/lib/superset-colors";
import { cn } from "@/lib/utils";
import { setWarmupCompletedAction } from "@/server/actions/sessions";

import type { ExerciseVM, SessionVM } from "./view-model";
import { attempted } from "@/lib/offline-submit";

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
  const logged = exercise.sets.filter((set) => set.setType !== "warmup").length;
  const coachTargets = exercise.suggestion?.kind === "coach" ? exercise.suggestion.sets : [];
  const planned =
    coachTargets.length > 0
      ? coachTargets.filter((set) => set.setType !== "warmup").length
      : (exercise.planned?.sets ?? null);
  const count =
    planned !== null
      ? `${logged} of ${planned} ${planned === 1 ? "set" : "sets"}`
      : `${logged} ${logged === 1 ? "set" : "sets"}`;
  const machine = exercise.equipment?.name;
  const values = logged > 0 ? formatSets(exercise.sets) : null;
  return [count, machine, values].filter(Boolean).join(" · ");
}

/**
 * The number in the margin, which is also the row's state: outlined while the exercise is
 * still to do, inked in once it is done, struck when it was skipped.
 */
function OrderCell({ exercise, hue }: { exercise: ExerciseVM; hue: number | undefined }) {
  const done = exercise.completedAt !== null && exercise.skippedAt === null;
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-control border font-data text-sm font-semibold tabular-nums",
        done
          ? "border-ink bg-ink text-canvas"
          : exercise.skippedAt
            ? "border-line text-ink-ghost line-through"
            : "border-line text-ink-muted",
      )}
      style={
        hue && !done
          ? { color: "var(--superset-color)", borderColor: "var(--superset-color)" }
          : undefined
      }
      aria-hidden
    >
      {done ? <Check className="!size-4" aria-hidden /> : exercise.orderIndex}
    </span>
  );
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
  session: SessionVM;
  done: boolean;
  onDone: (done: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  // The coach's warm-up replaces the protocol for this session; the protocol stays on the
  // programme day rather than being listed twice here.
  const coachLines = session.coachPlan?.warmup ?? [];
  const drills = session.warmup?.drills ?? [];
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleDone = () =>
    startTransition(async () => {
      const outcome = await attempted(
        () => setWarmupCompletedAction(session.id, !done),
        "Connection lost. Try again when connected.",
      );
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      if (!outcome.value.ok) {
        setError(outcome.value.error);
        return;
      }
      onDone(!done);
      setError(null);
    });

  return (
    <div className="box">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 text-left font-medium"
        >
          <ChevronDown
            className={cn(
              "shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-out)]",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">Warm-up</span>
          <span className="shrink-0 font-data text-sm font-normal text-ink-muted tabular-nums">
            {coachLines.length > 0
              ? `${coachLines.length} from the coach`
              : `${drills.length} drills`}
          </span>
        </button>
        <Button
          variant="secondary"
          size="sm"
          className={cn("shrink-0", done && "border-success text-success")}
          onClick={toggleDone}
          disabled={pending}
          aria-pressed={done}
        >
          {pending ? (
            "Saving…"
          ) : done ? (
            <>
              Done <Check aria-hidden />
            </>
          ) : (
            "Mark done"
          )}
        </Button>
      </div>
      {open && coachLines.length > 0 && (
        <ol className="border-t border-line pb-2 text-sm ruled-list">
          {coachLines.map((line, index) => (
            <li key={index} className="py-1.5 [overflow-wrap:anywhere]">
              {line}
            </li>
          ))}
        </ol>
      )}
      {open && coachLines.length === 0 && (
        <ol className="border-t border-line pb-2 text-sm ruled-list">
          {drills.map((drill) => (
            <li key={drill.order} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0">{drill.name}</span>
              <span className="shrink-0 text-right font-data text-ink-muted tabular-nums">
                {drill.dose}
              </span>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="pb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type OverviewProps = {
  session: SessionVM;
  readOnly: boolean;
  hasDrafts: boolean;
  onOpenExercise: (workoutExerciseId: string) => void;
  onOpenDetails: () => void;
  onEditSuperset: (group: string | null) => void;
};

export function WorkoutOverview({
  session,
  readOnly,
  hasDrafts,
  onOpenExercise,
  onOpenDetails,
  onEditSuperset,
}: OverviewProps) {
  const [warmupDone, setWarmupDone] = useState(session.warmupCompleted);
  const hues = supersetHues(session.exercises);
  const done = session.exercises.filter((e) => e.completedAt && !e.skippedAt).length;
  // The first exercise still to do is the session's one primary action: one tap starts it.
  // Finishing takes the highlighter only once nothing is left to start.
  const nextId = readOnly
    ? null
    : (session.exercises.find((e) => !e.completedAt && !e.skippedAt)?.id ?? null);
  const allSettled = nextId === null;

  return (
    <div className="space-y-[var(--section-gap)]">
      {/* The coach's sentence for the session, in the coach's hand. */}
      {session.coachPlan?.summary && (
        <p className="flex gap-2 [overflow-wrap:anywhere] text-pen">
          <Pencil className="mt-0.5 shrink-0" aria-hidden />
          <span>{session.coachPlan.summary}</span>
        </p>
      )}

      {!readOnly && hasDrafts && (
        <p role="status" className="text-sm font-medium text-warning">
          Unsaved set drafts on this device. Save or remove them before finishing.
        </p>
      )}

      {!readOnly && session.warnings.length > 0 && (
        <section className="box space-y-3 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-1 text-base font-semibold">
              Recovery check
              <InfoTip label="About the recovery check">
                Advice only. Nothing here changes the targets you were given; every set is yours to
                set as you find it.
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
        </section>
      )}

      {!readOnly && (session.warmup || (session.coachPlan?.warmup.length ?? 0) > 0) && (
        <WarmupRow session={session} done={warmupDone} onDone={setWarmupDone} />
      )}

      <div>
        <div className="flex items-baseline justify-between gap-3 pb-1">
          <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
            Exercises
          </p>
          <p className="font-data text-sm text-ink-muted tabular-nums">
            {done} of {session.exercises.length} done
          </p>
        </div>
        {session.exercises.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted rule-bottom rule-top">No exercises yet.</p>
        ) : (
          <ol className="box-rows">
            {session.exercises.map((exercise) => {
              // A finished session is a record of what happened, so a skipped exercise still
              // says it was skipped; without that it reads the same as one never done.
              const action: { label: string; tone: "accent" | "muted" } = readOnly
                ? exercise.skippedAt
                  ? { label: "Skipped", tone: "muted" }
                  : { label: "View", tone: "muted" }
                : rowAction(exercise);
              const hue = exercise.supersetGroup ? hues.get(exercise.supersetGroup) : undefined;
              return (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => onOpenExercise(exercise.id)}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 py-3 text-left transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised",
                      // Rows in a superset share one pen; nothing else marks the group.
                      hue && "-ml-2 pl-2 superset-row",
                    )}
                    style={hue ? supersetStyle(hue) : undefined}
                  >
                    <OrderCell exercise={exercise} hue={hue} />
                    {hue && <span className="sr-only">In a superset. </span>}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {exercise.exercise.name}
                      </span>
                      <span className="mt-0.5 block font-data text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                        {progressLine(exercise)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium",
                        exercise.id === nextId
                          ? "rounded-control border border-highlight-strong bg-highlight px-2.5 py-1 font-semibold text-on-highlight"
                          : action.tone === "accent"
                            ? "text-pen"
                            : "text-ink-muted",
                      )}
                    >
                      {action.label}
                    </span>
                    <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

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

      <div className="space-y-2">
        {!readOnly &&
          (hasDrafts ? (
            <Button
              size="lg"
              variant={allSettled ? "primary" : "secondary"}
              className="w-full"
              disabled
            >
              Save drafts first
            </Button>
          ) : (
            <LinkButton
              href={`/workouts/${session.id}/finish`}
              size="lg"
              variant={allSettled ? "primary" : "secondary"}
              className="w-full"
            >
              Finish session
            </LinkButton>
          ))}
        <Button variant="ghost" className="w-full" onClick={onOpenDetails}>
          Session details
        </Button>
      </div>
    </div>
  );
}
