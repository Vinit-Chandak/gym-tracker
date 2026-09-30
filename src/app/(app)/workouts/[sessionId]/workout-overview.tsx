"use client";

import { AiCoach, Check, ChevronDown, ChevronRight, Dumbbell } from "@/components/ui/icons";
import { useTransition, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroCard } from "@/components/ui/hero-card";
import { List } from "@/components/ui/link-row";
import { InfoTip } from "@/components/ui/info-tip";
import { formatSets } from "@/domain/sets";
import { formatDateTime } from "@/lib/format";
import { supersetHues, supersetLabels } from "@/lib/superset-colors";
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

/** Working sets logged, and the working sets asked for: the coach's, else the programme's. */
function setCounts(exercise: ExerciseVM): { logged: number; planned: number | null } {
  const logged = exercise.sets.filter((set) => set.setType !== "warmup").length;
  const coachTargets = exercise.suggestion?.kind === "coach" ? exercise.suggestion.sets : [];
  const planned =
    coachTargets.length > 0
      ? coachTargets.filter((set) => set.setType !== "warmup").length
      : (exercise.planned?.sets ?? null);
  return { logged, planned };
}

/** Progress and machine on one line. Status lives in the action, so it is not repeated here. */
function progressLine(exercise: ExerciseVM): string {
  const { logged, planned } = setCounts(exercise);
  const count =
    planned !== null
      ? `${logged} of ${planned} ${planned === 1 ? "set" : "sets"}`
      : `${logged} ${logged === 1 ? "set" : "sets"}`;
  return [count, exercise.equipment?.name].filter(Boolean).join(", ");
}

/** Where the next exercise starts: "Set 2 of 3, Smith machine". */
function nextSetLine(exercise: ExerciseVM): string {
  const { logged, planned } = setCounts(exercise);
  const set =
    planned !== null ? `Set ${Math.min(logged + 1, planned)} of ${planned}` : `Set ${logged + 1}`;
  return [set, exercise.equipment?.name].filter(Boolean).join(", ");
}

/** What has been lifted so far, e.g. "60×5, 60×5": its own line, under the count. */
function valuesLine(exercise: ExerciseVM): string | null {
  return exercise.sets.some((set) => set.setType !== "warmup") ? formatSets(exercise.sets) : null;
}

/** Past this many sets a ladder of segments gets too fine to read, and one bar says it. */
const LADDER_LIMIT = 36;

/**
 * The session as a ladder: one segment per set, grouped by exercise, filled as sets are
 * logged. It is how far through the workout you are, read at arm's length between sets.
 */
function SetLadder({ exercises }: { exercises: readonly ExerciseVM[] }) {
  const groups = exercises.map((exercise) => {
    const { logged, planned } = setCounts(exercise);
    return {
      id: exercise.id,
      logged,
      size: Math.max(planned ?? 0, logged, 1),
      skipped: exercise.skippedAt !== null,
    };
  });
  const total = groups.reduce((sum, group) => sum + group.size, 0);
  const done = groups.reduce((sum, group) => sum + Math.min(group.logged, group.size), 0);
  if (total > LADDER_LIMIT) {
    return (
      <div aria-hidden className="h-2.5 overflow-hidden rounded-full bg-ink/20">
        <div
          className="h-full rounded-full bg-ink"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
    );
  }
  return (
    <div aria-hidden className="flex gap-2">
      {groups.map((group) => (
        <div
          key={group.id}
          className={cn("flex min-w-0 gap-1", group.skipped && "opacity-40")}
          style={{ flex: group.size }}
        >
          {Array.from({ length: group.size }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-2.5 min-w-0 flex-1 rounded-full",
                index < group.logged ? "bg-ink" : "bg-ink/20",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The top of the workout: how far through it you are, and the one exercise to do next,
 * a tap away. Everything else on the screen is the list to choose from instead.
 */
function SessionHero({
  session,
  readOnly,
  hasDrafts,
  onOpenExercise,
  onOpenDetails,
}: {
  session: SessionVM;
  readOnly: boolean;
  hasDrafts: boolean;
  onOpenExercise: (workoutExerciseId: string) => void;
  onOpenDetails: () => void;
}) {
  const working = session.exercises.reduce((sum, exercise) => sum + setCounts(exercise).logged, 0);
  const next = readOnly
    ? null
    : (session.exercises.find((exercise) => !exercise.completedAt && !exercise.skippedAt) ?? null);
  const nextCounts = next ? setCounts(next) : null;
  // Mid-workout, finishing is the quieter way out under Continue; once nothing is left it is
  // the one thing to do.
  const finishVariant = next ? "ghost" : "primary";
  const finish = hasDrafts ? (
    <Button size="lg" variant={finishVariant} className="w-full" disabled>
      Save drafts first
    </Button>
  ) : (
    <LinkButton
      href={`/workouts/${session.id}/finish`}
      size="lg"
      variant={finishVariant}
      className="w-full"
    >
      Finish session
    </LinkButton>
  );

  return (
    <HeroCard tone="lift">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-muted tabular-nums">
          <Dumbbell aria-hidden />
          {working === 0 ? "No sets yet" : `${working} ${working === 1 ? "set" : "sets"} logged`}
        </p>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onOpenDetails}>
          Session details
        </Button>
      </div>
      {session.exercises.length > 0 && <SetLadder exercises={session.exercises} />}
      {readOnly ? (
        <p className="text-callout font-semibold text-ink-muted tabular-nums">
          Finished{" "}
          {session.completedAt ? formatDateTime(session.completedAt, session.timeZone) : ""}
        </p>
      ) : next && nextCounts ? (
        <>
          <div>
            <p className="text-sm font-semibold text-ink-muted">
              {next.sets.length > 0 ? "Carry on with" : "Next up"}
            </p>
            <h2 className="mt-1 font-display text-display-m [overflow-wrap:anywhere]">
              {next.exercise.name}
            </h2>
            <p className="mt-1 text-callout text-ink-muted tabular-nums">{nextSetLine(next)}</p>
          </div>
          <Button size="lg" className="w-full" onClick={() => onOpenExercise(next.id)}>
            {next.sets.length > 0 ? "Continue" : "Go to exercise"}
          </Button>
          {finish}
        </>
      ) : (
        <>
          <h2 className="font-display text-display-m">
            {session.exercises.length > 0 ? "Every exercise done" : "Add an exercise to begin"}
          </h2>
          {session.exercises.length > 0 && finish}
        </>
      )}
    </HeroCard>
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
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 pl-4 text-left font-semibold"
        >
          <ChevronDown
            className={cn(
              "shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)]",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 whitespace-nowrap">Warm-up</span>
          <span className="shrink-0 text-xs font-normal text-ink-muted tabular-nums">
            {coachLines.length > 0
              ? `${coachLines.length} from the coach`
              : `${drills.length} drills`}
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
        <ol className="border-t border-line px-4 pb-2 text-sm ruled-list">
          {coachLines.map((line, index) => (
            <li key={index} className="py-1.5 [overflow-wrap:anywhere]">
              {line}
            </li>
          ))}
        </ol>
      )}
      {open && coachLines.length === 0 && (
        <ol className="border-t border-line px-4 pb-2 text-sm ruled-list">
          {drills.map((drill) => (
            <li key={drill.order} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0">{drill.name}</span>
              <span className="shrink-0 text-right text-ink-muted">{drill.dose}</span>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
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
  const labels = supersetLabels(session.exercises);

  return (
    <div className="space-y-[var(--section-gap)]">
      <SessionHero
        session={session}
        readOnly={readOnly}
        hasDrafts={hasDrafts}
        onOpenExercise={onOpenExercise}
        onOpenDetails={onOpenDetails}
      />

      {!readOnly && hasDrafts && (
        <p role="status" className="text-sm text-warning">
          Unsaved set drafts on this device. Save or remove them before finishing.
        </p>
      )}

      {!readOnly && session.warnings.length > 0 && (
        <Card>
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
                <span className="font-semibold">{warning.title}.</span>{" "}
                <span className="text-ink-muted">{warning.advice}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* The coach's sentence for the session, one slim box, so it reads as context rather
          than as another decision. */}
      {session.coachPlan?.summary && (
        <div className="flex box items-start gap-3 px-4 py-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent"
          >
            <AiCoach />
          </span>
          <p className="min-w-0 self-center text-sm [overflow-wrap:anywhere]">
            {session.coachPlan.summary}
          </p>
        </div>
      )}

      {!readOnly && (session.warmup || (session.coachPlan?.warmup.length ?? 0) > 0) && (
        <WarmupRow session={session} done={warmupDone} onDone={setWarmupDone} />
      )}

      {session.exercises.length === 0 ? (
        <p className="text-sm text-ink-muted">No exercises yet.</p>
      ) : (
        <List>
          {session.exercises.map((exercise, index) => {
            // A finished session is a record of what happened, so a skipped exercise still says
            // it was skipped; without that it reads the same as one that was simply never done.
            const action: { label: string; tone: "accent" | "muted" } = readOnly
              ? exercise.skippedAt
                ? { label: "Skipped", tone: "muted" }
                : { label: "View", tone: "muted" }
              : rowAction(exercise);
            const hue = exercise.supersetGroup ? hues.get(exercise.supersetGroup) : undefined;
            const label = labels.get(index);
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => onOpenExercise(exercise.id)}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 py-3 pr-4 text-left active:bg-surface-raised",
                    // Rows in a superset share one bracket and are named A1, A2 in their chip.
                    // The bar takes 4px of the gutter so the names still line up.
                    hue ? "pl-3 superset-row" : "pl-4",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                      exercise.completedAt
                        ? "bg-lift text-on-lift"
                        : label
                          ? "bg-surface text-ink"
                          : "bg-surface-raised text-ink-muted",
                    )}
                  >
                    {exercise.completedAt ? (
                      <Check aria-hidden />
                    ) : label ? (
                      <>
                        <span aria-hidden>{label}</span>
                        <span className="sr-only">Superset {label}</span>
                      </>
                    ) : (
                      exercise.orderIndex
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">
                      {exercise.exercise.name}
                    </span>
                    <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                      {progressLine(exercise)}
                    </span>
                    {valuesLine(exercise) && (
                      <span className="block text-sm [overflow-wrap:anywhere] text-ink-subtle tabular-nums">
                        {valuesLine(exercise)}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-chip px-3 py-1.5 text-sm font-semibold",
                      action.tone === "accent" ? "bg-lift-soft text-lift-ink" : "text-ink-muted",
                    )}
                  >
                    {action.label}
                  </span>
                  {/* The pill is the way in when there is one; a chevron only when there is not. */}
                  {action.tone !== "accent" && (
                    <ChevronRight className="-ml-1 shrink-0 text-ink-subtle" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </List>
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
