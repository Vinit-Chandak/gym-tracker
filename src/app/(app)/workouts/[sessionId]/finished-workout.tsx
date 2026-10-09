"use client";

import type { Route } from "next";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Art } from "@/components/art/art";
import type { PrintPart, StrengthColumn } from "@/components/art/geometry";
import { BackLink } from "@/components/shell/back-link";
import Link from "@/components/ui/app-link";
import { Button, buttonClassName, LinkButton } from "@/components/ui/button";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatSets } from "@/domain/sets";
import { formatIsoWeekdayDay } from "@/lib/format";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { EDIT_PARAM } from "@/lib/nav";
import { canConvertLoad, convertLoad } from "@/lib/units";
import { cn } from "@/lib/utils";

import { isWarmup, plannedSets } from "./logger-model";
import { CHECK_IN_LABELS } from "./session-details";
import type { ExerciseVM, SessionVM } from "./view-model";
import { addedLine, type Drafts } from "./workout-overview";

const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** What a finished workout can still have changed, and how (ADR 0049). */
export type FinishedEdit = {
  /** The last day it can be changed ("2026-10-16"). */
  until: string;
  /** Open for changes now: every exercise opens on its log, and Add exercise is offered. */
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  addHref: Route;
  /** How many exercises Add exercise just put at the end of the list, to say so once. */
  added: number;
  /** Set drafts on this device, which a change after the fact can leave behind as well. */
  drafts: Drafts;
};

/** Where a draft waits, so the edit can say which exercise to open. */
function draftsLine({ count, names }: Drafts): string {
  const where = names.length > 0 ? `in ${LIST.format(names)}` : "on this device";
  return count === 1
    ? `A set ${where} is not saved yet. Open it to save or remove it.`
    : `Sets ${where} are not saved yet. Open them to save or remove them.`;
}

/**
 * The record as a print (boards Summary, Past workout): the warm-up's fan as it ended, then a
 * column for each exercise of what was done, its warm-ups grey at the foot; an exercise with
 * nothing done stands dashed at its planned size.
 */
export function finishedParts(session: SessionVM): PrintPart[] {
  const parts: PrintPart[] = [];
  const blades = session.coachPlan?.warmup.length || session.warmup?.drills.length || 0;
  if (blades > 0)
    parts.push({
      kind: "mobility",
      segments: blades,
      segmentsDone: session.warmupCompleted ? blades : 0,
      state: session.warmupCompleted ? "done" : "skipped",
      modules: 3,
    });
  const columns: StrengthColumn[] = [];
  session.exercises.forEach((exercise, index) => {
    const warm = exercise.sets.filter((set) => isWarmup(set.setType)).length;
    const work = exercise.sets.length - warm;
    const next = session.exercises[index + 1];
    const pair = exercise.supersetGroup !== null && next?.supersetGroup === exercise.supersetGroup;
    if (work + warm > 0) columns.push({ sets: warm + work, done: warm + work, warm, pair });
    else {
      const planned = plannedSets(exercise) ?? 0;
      if (planned > 0) columns.push({ sets: planned, done: 0, skipped: true, pair });
    }
  });
  if (columns.length > 0) parts.push({ kind: "strength", columns });
  return parts;
}

/** Load moved, the app's rule (working sets, load × reps), in the reader's unit. */
function volumeOf(session: SessionVM): number {
  let total = 0;
  for (const exercise of session.exercises)
    for (const set of exercise.sets) {
      if (isWarmup(set.setType) || set.weight === null || set.reps === null) continue;
      if (!canConvertLoad(set.unit, session.preferredUnit)) continue;
      total += convertLoad(set.weight, set.unit, session.preferredUnit) * set.reps;
    }
  return Math.round(total);
}

function Stat({ figure, unit, label }: { figure: string; unit?: string; label: string }) {
  return (
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className="whitespace-nowrap">
        <span className="type-figure-l">{figure}</span>
        {unit && <span className="figure-row-unit"> {unit}</span>}
      </dd>
      <dd aria-hidden className="type-caption font-medium text-ink-2">
        {label}
      </dd>
    </div>
  );
}

/** An exercise's sets as the app lists a past session's: its working sets, each with its unit. */
function setsLine(exercise: ExerciseVM): string {
  return formatSets(exercise.sets, (unit) => LOAD_UNIT_LABELS[unit]);
}

/**
 * A finished workout (boards Summary, Past workout): the print as it stands, the name, where
 * and when, what it came to, its records, then what it recorded. The moment it ends (Summary)
 * it is still the session's, with no tab bar: what was not done is named once, the routine can
 * be saved, and Done goes back to Today. Opened later (Past workout), it is a page of the
 * history it was opened from, its check-in under the sets.
 *
 * Each exercise still opens on its own log, read only; Session details keeps the rest (when it
 * started, the programme day, body weight, notes).
 *
 * For a week after its day it can be changed (ADR 0049): Edit, at the end of the header, opens
 * every exercise, done or not, on a log that takes sets again, and adds Add exercise under them;
 * each change saves as it is made, so Done only closes the edit. The summary offers the same
 * edit under what it recorded, as the past workout it then becomes.
 */
export function FinishedWorkout({
  session,
  title,
  justFinished,
  backHref,
  records,
  routine,
  onOpenExercise,
  onOpenDetails,
  edit = null,
}: {
  session: SessionVM;
  title: string;
  /** Straight after Finish session (board Summary), rather than opened again later. */
  justFinished: boolean;
  /** Where Back goes when opened later. */
  backHref: Route;
  records: ReactNode;
  routine: ReactNode;
  onOpenExercise: (id: string) => void;
  onOpenDetails: () => void;
  /** Its week of changes, while it lasts; null once it is history. */
  edit?: FinishedEdit | null;
}) {
  const editing = edit?.editing === true && !justFinished;
  const done = session.exercises.filter((exercise) => exercise.sets.length > 0);
  const notDone = session.exercises.filter((exercise) => exercise.sets.length === 0);
  const sets = done.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const volume = volumeOf(session);
  const minutes = session.completedAt
    ? Math.round(
        (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
      )
    : null;
  const day = todayInTimeZone(session.timeZone, new Date(session.startedAt));
  const checkIn = CHECK_IN_LABELS.flatMap(([key, label]) => {
    const value = session[key];
    return typeof value === "number" ? [{ label, value }] : [];
  });

  // What Add exercise just added stands at the end of the list: named on the status line, and
  // the first of them focused, as the open workout does.
  const listRef = useRef<HTMLUListElement>(null);
  const justAdded = editing && edit && edit.added > 0 ? session.exercises.slice(-edit.added) : [];
  const firstAdded = justAdded[0]?.id ?? null;
  const addedWords = firstAdded
    ? addedLine(justAdded.map((exercise) => exercise.exercise.name))
    : "";
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    if (!firstAdded) return;
    let words: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-workout-exercise="${firstAdded}"]`)
        ?.focus();
      words = setTimeout(() => setAnnounced(addedWords), 400);
    }, 0);
    return () => {
      clearTimeout(timer);
      clearTimeout(words);
    };
  }, [firstAdded, addedWords]);

  return (
    <div className={cn(justFinished && "session-page")}>
      <header className="page-header page-width pt-safe">
        <div className="page-header-bar">
          {justFinished ? (
            <>
              <span className="flex-1" />
              <Link href="/today" aria-label="Close" className="icon-button">
                <Glyph name="close" className="glyph-22" />
              </Link>
            </>
          ) : (
            <>
              <BackLink fallback={backHref} />
              {edit && (
                <div className="page-header-action">
                  {editing ? (
                    <Button size="sm" onClick={edit.onDone}>
                      Done
                    </Button>
                  ) : (
                    <Button
                      variant="tonal"
                      size="sm"
                      aria-label="Edit workout"
                      onClick={edit.onEdit}
                    >
                      <Glyph name="edit" className="glyph-18" />
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </header>

      <div className="session-page-body page-width">
        <figure className="finished-print" data-past={!justFinished}>
          <Art
            kind="print"
            parts={finishedParts(session)}
            label={`${title} as it ended: ${done.length} ${
              done.length === 1 ? "exercise" : "exercises"
            } done${notDone.length > 0 ? `, ${notDone.length} not done, dashed` : ""}`}
            className="size-full"
          />
        </figure>
        <FitTitle as="h1" sizes={{ base: 34, narrow: 30 }} className="mt-3">
          {title}
        </FitTitle>
        <p className="meta-line mt-1">
          {!justFinished && (
            <span className="meta-fact">
              <Glyph name="calendar" label="Date" className="glyph-16" />
              {formatIsoWeekdayDay(day)}
            </span>
          )}
          <span className="meta-fact">
            <Glyph name="pin" label="Gym" className="glyph-16" />
            {session.gym.name}
          </span>
        </p>

        <dl className="finished-stats">
          {minutes !== null && <Stat figure={String(minutes)} unit="min" label="Time" />}
          <Stat figure={String(sets)} label="Sets" />
          {volume > 0 && (
            <Stat
              figure={volume.toLocaleString("en-GB")}
              unit={LOAD_UNIT_LABELS[session.preferredUnit]}
              label="Volume"
            />
          )}
        </dl>

        {editing && edit && (
          <p role="status" className="finished-edit-note">
            <Glyph name="edit" className="mt-px glyph-18 shrink-0" />
            <span className="min-w-0">
              Tap an exercise to change its sets. Each change saves as you make it, until{" "}
              {formatIsoWeekdayDay(edit.until)}.
            </span>
          </p>
        )}

        {records}

        <section aria-labelledby="finished-sets">
          <h2 id="finished-sets" className="caption-head mt-4.5">
            {justFinished ? "Recorded" : editing ? "Exercises" : "Sets"}
          </h2>
          {editing && edit ? (
            <>
              {session.exercises.length > 0 && (
                <ul ref={listRef}>
                  {session.exercises.map((exercise) => (
                    <li key={exercise.id}>
                      <button
                        type="button"
                        data-workout-exercise={exercise.id}
                        onClick={() => onOpenExercise(exercise.id)}
                        className="record-row record-row-open w-full text-left"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="record-row-name">{exercise.exercise.name}</span>
                          {exercise.sets.length > 0 ? (
                            <span className="record-row-sets">{setsLine(exercise)}</span>
                          ) : (
                            <span className="record-row-sets text-ink-2">
                              {exercise.skippedAt ? "Skipped" : "No sets"}
                            </span>
                          )}
                        </span>
                        <Glyph name="chevronRight" className="glyph-18 shrink-0 text-ink-2" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p role="status" className={cn("type-meta font-semibold", announced && "mt-2")}>
                {announced}
              </p>
              {edit.drafts.count > 0 && (
                <p className="mt-2 flex items-start gap-2 type-meta font-semibold">
                  <Glyph name="warn" className="mt-px glyph-18" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {draftsLine(edit.drafts)}
                  </span>
                </p>
              )}
              <LinkButton href={edit.addHref} variant="tonal" size="sm" className="mt-2.5">
                <Glyph name="plus" className="glyph-18" />
                Add exercise
              </LinkButton>
            </>
          ) : done.length > 0 ? (
            <ul>
              {done.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => onOpenExercise(exercise.id)}
                    className="record-row w-full text-left"
                  >
                    <span className="record-row-name">{exercise.exercise.name}</span>{" "}
                    <span className="record-row-sets">{setsLine(exercise)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="record-row type-meta text-ink-2">No sets logged.</p>
          )}
        </section>

        {!editing && notDone.length > 0 && (
          <section aria-labelledby="finished-not-done">
            <h2 id="finished-not-done" className="caption-head mt-3.5">
              Not done
            </h2>
            <p className="not-done">
              {notDone
                .map(
                  (exercise) =>
                    `${exercise.exercise.name}${exercise.skippedAt ? " (skipped)" : ""}`,
                )
                .join(", ")}
            </p>
          </section>
        )}

        {justFinished && edit && (
          // Something missed is mended where it is noticed: the summary becomes the past workout,
          // open for changes, in place of itself.
          <Link
            href={`/workouts/${session.id}?${EDIT_PARAM}=1` as Route}
            replace
            className={buttonClassName("tonal", "sm", "mt-2.5")}
          >
            <Glyph name="edit" className="glyph-18" />
            Edit workout
          </Link>
        )}

        {!justFinished && checkIn.length > 0 && (
          <section aria-labelledby="finished-check-in">
            <h2 id="finished-check-in" className="caption-head mt-4.5">
              Check-in
            </h2>
            <dl className="finished-check-in">
              {checkIn.map(({ label, value }) => (
                <div key={label} className="min-w-0">
                  <dt className="type-caption font-medium text-ink-2">{label}</dt>
                  <dd className="mt-0.5 type-figure">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="mt-3">{routine}</div>
        <button type="button" onClick={onOpenDetails} className="disclosure-summary w-full">
          <span className="mark-cell">
            <Glyph name="note" className="glyph-20" />
          </span>
          <span className="min-w-0 flex-1 text-left font-bold">Session details</span>
          <Glyph name="chevronRight" className="glyph-18 shrink-0 text-ink-2" />
        </button>

        {justFinished && (
          <PinnedActions stack>
            <Link href="/today" className={buttonClassName("primary", "lg", "w-full")}>
              Done
            </Link>
          </PinnedActions>
        )}
      </div>
    </div>
  );
}
