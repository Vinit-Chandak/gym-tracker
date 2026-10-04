"use client";

import type { Route } from "next";
import {
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";

import { Art } from "@/components/art/art";
import type { PrintPart, StrengthColumn } from "@/components/art/geometry";
import { targetsLine } from "@/components/planned-exercises";
import { RestPill } from "@/components/shell/rest-timer";
import Link from "@/components/ui/app-link";
import { Button, LinkButton } from "@/components/ui/button";
import { CoachNote } from "@/components/ui/coach-note";
import { CoachNoteMore } from "@/components/ui/coach-note-more";
import { FitTitle } from "@/components/ui/fit-title";
import { GLYPH_LABELS, Glyph } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";
import { formatSet } from "@/domain/sets";
import { LOAD_UNIT_LABELS, UNPLANNED_SESSION } from "@/lib/labels";
import { attempted } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { setWarmupCompletedAction } from "@/server/actions/sessions";

import {
  equipmentGlyph,
  equipmentLine,
  isWarmup,
  plannedSets,
  prescriptionLabel,
} from "./logger-model";
import type { ExerciseVM, SessionVM } from "./view-model";

/** Sets of the work done so far, warm-ups aside. */
const workDone = (exercise: ExerciseVM) => exercise.sets.filter((set) => !isWarmup(set.setType));

/** An exercise under way: some of its work is in, and it is neither done nor dropped. */
const underWay = (exercise: ExerciseVM) =>
  !exercise.completedAt && !exercise.skippedAt && workDone(exercise).length > 0;

/**
 * What a row says under the name (DESIGN.md, Rows and marks): for the exercise under way, the
 * sets so far ("60 kg × 4, 60 kg × 4"); otherwise its prescription, the coach's when the coach
 * wrote it ("60 kg · 3 × 5 @ 2, 2, 1 RIR").
 */
function rowLine(exercise: ExerciseVM, unitLabel: string, readOnly: boolean): string {
  const done = workDone(exercise);
  if ((readOnly || underWay(exercise)) && done.length > 0)
    return done.map((set) => formatSet(set, LOAD_UNIT_LABELS[set.unit])).join(", ");
  if (exercise.suggestion?.kind === "coach") {
    const line = targetsLine(
      exercise.suggestion.sets,
      unitLabel,
      exercise.planned?.perSide ?? false,
    );
    if (line) return line;
  }
  return prescriptionLabel(exercise) ?? equipmentLine(exercise, "gym");
}

/** The workout's plan as a print: the warm-up's fan, then a column of sets for each exercise. */
function workoutParts(session: SessionVM, warmupDone: boolean): PrintPart[] {
  const parts: PrintPart[] = [];
  const blades = session.coachPlan?.warmup.length || session.warmup?.drills.length || 0;
  if (blades > 0)
    parts.push({
      kind: "mobility",
      segments: blades,
      segmentsDone: warmupDone ? blades : 0,
      state: warmupDone ? "done" : "todo",
      modules: 3,
    });
  const columns: StrengthColumn[] = [];
  session.exercises.forEach((exercise, index) => {
    const done = workDone(exercise).length;
    const sets = Math.max(plannedSets(exercise) ?? 0, done);
    if (sets === 0) return;
    const next = session.exercises[index + 1];
    columns.push({
      sets,
      done,
      skipped: exercise.skippedAt !== null,
      pair: exercise.supersetGroup !== null && next?.supersetGroup === exercise.supersetGroup,
    });
  });
  if (columns.length > 0) parts.push({ kind: "strength", columns });
  return parts;
}

/**
 * Marking the warm-up done, or not done again: one save the row and the sheet share, so either
 * can tick it and both show it. The tick lands when the server has it, as a set does.
 */
function useWarmupDone(sessionId: string, done: boolean, onDone: (done: boolean) => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      const outcome = await attempted(
        () => setWarmupCompletedAction(sessionId, !done),
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
  return { toggle, pending, error };
}

/** The warm-up, opened: its drills (or the coach's lines) and Mark done. */
function WarmupSheet({
  open,
  session,
  done,
  onDone,
  onClose,
}: {
  open: boolean;
  session: SessionVM;
  done: boolean;
  onDone: (done: boolean) => void;
  onClose: () => void;
}) {
  // The coach's warm-up replaces the protocol for this session; the protocol stays on the
  // programme day rather than being listed twice here.
  const coachLines = session.coachPlan?.warmup ?? [];
  const drills = session.warmup?.drills ?? [];
  const { toggle: toggleDone, pending, error } = useWarmupDone(session.id, done, onDone);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={coachLines.length > 0 ? "Warm-up" : (session.warmup?.name ?? "Warm-up")}
    >
      {open && (
        <div className="mt-1">
          <ol>
            {coachLines.length > 0
              ? coachLines.map((line, index) => (
                  <li
                    key={index}
                    className={cn(
                      "py-2.5 [overflow-wrap:anywhere]",
                      index < coachLines.length - 1 && "border-b border-hair",
                    )}
                  >
                    {line}
                  </li>
                ))
              : drills.map((drill, index) => (
                  <li
                    key={drill.order}
                    className={cn(
                      "flex justify-between gap-3 py-2.5",
                      index < drills.length - 1 && "border-b border-hair",
                    )}
                  >
                    <span className="min-w-0 font-bold [overflow-wrap:anywhere]">{drill.name}</span>
                    <span className="shrink-0 text-right type-meta text-ink-2 tabular-nums">
                      {drill.dose}
                    </span>
                  </li>
                ))}
          </ol>
          {error && (
            <p role="alert" className="mt-2 flex items-start gap-2 type-meta font-semibold">
              <Glyph name="warn" className="mt-px glyph-18" />
              {error}
            </p>
          )}
          <Button
            variant={done ? "tonal" : "primary"}
            size="lg"
            className="mt-4 w-full"
            onClick={toggleDone}
            disabled={pending}
            aria-pressed={done}
          >
            {pending ? (
              "Saving…"
            ) : done ? (
              <>
                <Glyph name="check" className="glyph-20" />
                Done
              </>
            ) : (
              "Mark done"
            )}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/**
 * The warm-up as a row of the workout, with its own Mark done at the end, so ticking it off is
 * one tap where it is read (DESIGN.md, The session). The coach's warm-up is its lines, each on
 * a line of its own and whole, since nothing else says them; a protocol's is its drill count,
 * which opens the drills. Done, the name goes to ink 2 and the button says Done with its check;
 * a tap undoes it.
 */
function WarmupRow({
  session,
  name,
  blades,
  done,
  onDone,
  onOpen,
  last,
}: {
  session: SessionVM;
  name: string;
  blades: number;
  done: boolean;
  onDone: (done: boolean) => void;
  onOpen: () => void;
  last: boolean;
}) {
  const { toggle, pending, error } = useWarmupDone(session.id, done, onDone);
  const lines = session.coachPlan?.warmup ?? [];
  const title = <span className={cn("plan-row-name", done && "text-ink-2")}>{name}</span>;
  return (
    <li className={cn("plan-row workout-row workout-warmup", last && "plan-row-last")}>
      <span className="flex min-w-0 flex-1 flex-col">
        {lines.length > 0 ? (
          <span className="workout-warmup-open">
            {title}
            {lines.map((line, index) => (
              <span
                key={index}
                className="type-meta-small [overflow-wrap:anywhere] text-ink-2 tabular-nums"
              >
                {line}
              </span>
            ))}
          </span>
        ) : (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={onOpen}
            className="workout-warmup-open"
          >
            {title}
            <span className="flex items-center gap-0.5 type-meta-small text-ink-2 tabular-nums">
              {blades} {blades === 1 ? "drill" : "drills"}
              <Glyph name="chevronRight" className="glyph-16" />
            </span>
          </button>
        )}
        {error && (
          <span
            role="alert"
            className="mt-1 flex items-start gap-1.5 type-meta-small font-semibold"
          >
            <Glyph name="warn" className="mt-0.5 glyph-16" />
            {error}
          </span>
        )}
      </span>
      <button
        type="button"
        aria-pressed={done}
        aria-label={done ? "Warm-up done. Mark not done" : "Mark warm-up done"}
        disabled={pending}
        onClick={toggle}
        className="warmup-done"
        data-done={done}
      >
        <span>
          {pending ? (
            "Saving…"
          ) : done ? (
            <>
              <Glyph name="check" className="glyph-18" />
              Done
            </>
          ) : (
            "Mark done"
          )}
        </span>
      </button>
    </li>
  );
}

type OverviewProps = {
  session: SessionVM;
  readOnly: boolean;
  hasDrafts: boolean;
  onOpenExercise: (workoutExerciseId: string) => void;
  onOpenDetails: () => void;
  onEditSuperset: (group: string | null) => void;
  /** The day's name, or UNPLANNED_SESSION. */
  title?: string;
  /** Where minimising goes: Today, or wherever the session was opened from. */
  backHref?: Route;
  /** An open workout is the session's layer over the tabs; a finished one is a page. */
  layer?: boolean;
  /** Where the layer's list was scrolled to, kept while an exercise is open. */
  listScrollRef?: RefObject<number>;
};

/**
 * The workout (DESIGN.md, The session; boards Workout, Workout-Superset, Workout-Coach): the
 * day's name and where, its plan as a print with the sets inked as they are done, the app's
 * advice, then the warm-up and the exercises in the programme's order. A row says where it
 * stands only when that is news: a check when done, Resume on one under way, Skipped.
 */
export function WorkoutOverview({
  session,
  readOnly,
  hasDrafts,
  onOpenExercise,
  onOpenDetails,
  onEditSuperset,
  title = session.day?.name ?? UNPLANNED_SESSION,
  backHref = "/today",
  layer = false,
  listScrollRef,
}: OverviewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLSpanElement>(null);
  // Folded, never dropped: when the reader's text is so large that Minimise, the rest pill,
  // Finish and More cannot share a line, the pill and Finish stand on a line of their own.
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const actions = actionsRef.current;
    if (!header || !actions) return;
    const measure = () => {
      const style = getComputedStyle(header);
      const room =
        header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap) || 0;
      const target = header.querySelector(".session-icon-button")?.getBoundingClientRect().width;
      // Minimise and More reach 10 pt into the gutters; three gaps stand around the spacer.
      const need = 2 * (target ?? 44) - 20 + 3 * gap + actions.getBoundingClientRect().width;
      setStacked(need > room + 0.5);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(actions);
    return () => observer.disconnect();
  }, []);
  // Back from an exercise, the list is where it was left, so a long workout does not restart
  // at the top.
  useLayoutEffect(() => {
    if (bodyRef.current && listScrollRef) bodyRef.current.scrollTop = listScrollRef.current;
  }, [listScrollRef]);
  const [warmupDone, setWarmupDone] = useState(session.warmupCompleted);
  const [sheet, setSheet] = useState<"warmup" | null>(null);
  const unitLabel = LOAD_UNIT_LABELS[session.preferredUnit];
  const coachPlanned = session.coachPlan !== null;
  const heading = coachPlanned ? `${title}, planned by the coach` : title;
  const blades = session.coachPlan?.warmup.length || session.warmup?.drills.length || 0;
  const hasWarmup = session.warmup !== null || (session.coachPlan?.warmup.length ?? 0) > 0;
  const parts = workoutParts(session, warmupDone);
  const strength = parts.find((part) => part.kind === "strength");
  const columns = strength?.kind === "strength" ? strength.columns.length : 0;
  // The coach's warm-up stands in for the protocol, so it does not take the protocol's name.
  const warmupName = session.coachPlan?.warmup.length
    ? "Warm-up"
    : (session.warmup?.name ?? "Warm-up");
  const groups = session.exercises.reduce<ExerciseVM[][]>((all, exercise) => {
    const last = all.at(-1);
    if (exercise.supersetGroup && last?.[0]?.supersetGroup === exercise.supersetGroup)
      last.push(exercise);
    else all.push([exercise]);
    return all;
  }, []);

  const row = (exercise: ExerciseVM, last: boolean) => {
    const done = exercise.completedAt !== null;
    const skipped = exercise.skippedAt !== null;
    const open = !readOnly && underWay(exercise);
    const planned = exercise.planned?.plannedExerciseName;
    const instead =
      planned !== undefined && planned !== exercise.exercise.name && !open && !done
        ? planned
        : null;
    const working = workDone(exercise).length;
    const of = plannedSets(exercise);
    const glyph = equipmentGlyph(exercise);
    const coachAdded = exercise.suggestion?.kind === "coach" && exercise.planned === null;
    return (
      <li key={exercise.id}>
        <button
          type="button"
          onClick={() => onOpenExercise(exercise.id)}
          className={cn("plan-row workout-row w-full text-left", last && "plan-row-last")}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                "plan-row-name [overflow-wrap:anywhere]",
                (done || skipped) && !readOnly && "text-ink-2",
              )}
            >
              {exercise.exercise.name}
            </span>
            {!skipped && (
              <span className="meta-line plan-row-meta">
                <span className="meta-fact">
                  <Glyph name={glyph} label={GLYPH_LABELS[glyph]} className="glyph-16" />
                  <span>{rowLine(exercise, unitLabel, readOnly)}</span>
                  {instead && <span>instead of {instead}</span>}
                </span>
              </span>
            )}
            {coachAdded && <span className="plan-row-note text-ink-2">Added by the coach</span>}
            {/* Dropped, the coach's note is why, and nothing else on the screen says it. */}
            {exercise.coachNote && skipped && (
              <span className="plan-row-note">
                <Glyph name="coach" label="Coach:" className="mt-0.5 glyph-15" />
                <span className="min-w-0">{exercise.coachNote}</span>
              </span>
            )}
          </span>
          {exercise.coachNote && !skipped && (
            <Glyph
              name="coach"
              label="The coach wrote a note for this exercise"
              className="glyph-18 shrink-0 text-ink-2"
            />
          )}
          {open ? (
            <>
              <span className="sr-only">
                , in progress, {working}
                {of !== null ? ` of ${of}` : ""} sets done. Resume
              </span>
              <span aria-hidden className="workout-resume">
                Resume
              </span>
            </>
          ) : done ? (
            <Glyph name="check" label="Done" className="glyph-20 shrink-0" />
          ) : skipped ? (
            <span className="shrink-0 type-meta-small font-semibold text-ink-2">Skipped</span>
          ) : (
            <Glyph name="chevronRight" className="glyph-18 shrink-0 text-ink-2" />
          )}
        </button>
      </li>
    );
  };

  const content: ReactNode = (
    <>
      {/* One heading, the name on the screen; the meta line under it says who planned it. */}
      {layer && (
        <FitTitle as="h1" sizes={{ base: 34, narrow: 30 }} room={30} className="mt-0.5">
          {title}
        </FitTitle>
      )}
      <p className="meta-line mt-1">
        {/* A finished workout's header already names the gym. */}
        {layer && (
          <span className="meta-fact">
            <Glyph name="pin" label="Gym" className="glyph-16" />
            {session.gym.name}
          </span>
        )}
        {session.day?.timeNote && (
          <span className="meta-fact">
            <Glyph name="rest" className="glyph-16" />
            {session.day.timeNote}
          </span>
        )}
        {coachPlanned && (
          <span className="meta-fact">
            <Glyph name="coach" className="glyph-16" />
            Planned by the coach
          </span>
        )}
      </p>
      {/* A print draws only what is planned or done: an ad hoc session with nothing yet has no
          print, rather than an empty paper (DESIGN.md, Prints). */}
      {parts.length > 0 && (
        <figure className="workout-print m-0">
          <Art
            kind="print"
            parts={parts}
            label={`${title}: ${[
              hasWarmup ? `the warm-up ${warmupDone ? "done" : "to do"}` : null,
              columns > 0
                ? `${columns} ${columns === 1 ? "exercise" : "exercises"} as columns of their sets, the sets done inked`
                : null,
            ]
              .filter(Boolean)
              .join(", ")}`}
            className="size-full"
          />
        </figure>
      )}

      {!readOnly && session.warnings.length > 0 && (
        <CoachNote
          who="Recovery check"
          tone="check"
          small
          className="mt-3"
          title={session.warnings.length === 1 ? session.warnings[0]!.title : undefined}
        >
          {session.warnings.length === 1 ? (
            session.warnings[0]!.advice
          ) : (
            <ul className="space-y-1">
              {session.warnings.map((warning) => (
                <li key={warning.code}>
                  <span className="font-bold">{warning.title}.</span> {warning.advice}
                </li>
              ))}
            </ul>
          )}
        </CoachNote>
      )}
      {session.coachPlan?.summary && (
        <CoachNoteMore className="mt-3">{session.coachPlan.summary}</CoachNoteMore>
      )}
      {!readOnly && hasDrafts && (
        <p role="status" className="mt-3 flex items-start gap-2 type-meta font-semibold">
          <Glyph name="warn" className="mt-px glyph-18" />
          Unsaved set drafts on this device. Save or remove them before finishing.
        </p>
      )}

      {session.exercises.length === 0 && !hasWarmup ? (
        <p className="mt-3 type-body text-ink-2">No exercises yet.</p>
      ) : (
        <ul aria-label={heading} className="mt-2">
          {!readOnly && hasWarmup && (
            <WarmupRow
              session={session}
              name={warmupName}
              blades={blades}
              done={warmupDone}
              onDone={setWarmupDone}
              onOpen={() => setSheet("warmup")}
              last={session.exercises.length === 0}
            />
          )}
          {groups.map((group, index) => {
            const lastGroup = index === groups.length - 1;
            if (group.length === 1) return row(group[0]!, lastGroup);
            return (
              <li key={group[0]!.id} className="superset-group">
                <ul aria-label={`Superset: ${group.map((x) => x.exercise.name).join(" and ")}`}>
                  {group.map((exercise, at) => row(exercise, lastGroup && at === group.length - 1))}
                </ul>
                <span role="img" aria-label="Superset" className="superset-bracket" />
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <LinkButton href={`/workouts/${session.id}/add-exercise`} variant="tonal" size="sm">
            <Glyph name="plus" className="glyph-18" />
            Add exercise
          </LinkButton>
          <Button
            variant="tonal"
            size="sm"
            disabled={session.exercises.length < 2}
            onClick={() => onEditSuperset(null)}
          >
            <Glyph name="link" className="glyph-18" />
            Superset
          </Button>
        </div>
      )}
      {readOnly && (
        <div className="mt-3">
          <Button variant="tonal" size="sm" onClick={onOpenDetails}>
            <Glyph name="note" className="glyph-18" />
            Session details
          </Button>
        </div>
      )}

      <WarmupSheet
        open={sheet === "warmup"}
        session={session}
        done={warmupDone}
        onDone={setWarmupDone}
        onClose={() => setSheet(null)}
      />
    </>
  );

  if (!layer) return <div className="workout-page">{content}</div>;

  return (
    <div className="session-layer workout-layer">
      <header ref={headerRef} className="session-header workout-header" data-stacked={stacked}>
        <Link
          href={backHref}
          aria-label="Minimise the workout"
          className="session-icon-button -ml-2.5"
        >
          <Glyph name="chevronDown" className="glyph-24" />
        </Link>
        <span className="flex-1" />
        <span ref={actionsRef} className="workout-head-actions">
          {session.restTimerEnabled && <RestPill sessionId={session.id} />}
          {hasDrafts ? (
            <span aria-disabled="true" className="finish-pill">
              <span className="text-ink-2">Finish</span>
            </span>
          ) : (
            <Link href={`/workouts/${session.id}/finish`} className="finish-pill">
              <span>Finish</span>
            </Link>
          )}
        </span>
        {/* Add exercise and Superset stand under the list, so More is the session's details. */}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label="Session details"
          onClick={onOpenDetails}
          className="session-icon-button -mr-2.5"
        >
          <Glyph name="more" className="glyph-24" />
        </button>
      </header>
      <div
        ref={bodyRef}
        className="session-body workout-body"
        data-scroll="true"
        onScroll={(event) => {
          if (listScrollRef) listScrollRef.current = event.currentTarget.scrollTop;
        }}
      >
        {content}
      </div>
    </div>
  );
}
