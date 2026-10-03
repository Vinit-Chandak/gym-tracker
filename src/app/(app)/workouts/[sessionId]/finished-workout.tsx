"use client";

import type { Route } from "next";
import type { ReactNode } from "react";

import { Art } from "@/components/art/art";
import type { PrintPart, StrengthColumn } from "@/components/art/geometry";
import { BackLink } from "@/components/shell/back-link";
import Link from "@/components/ui/app-link";
import { buttonClassName } from "@/components/ui/button";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatSets } from "@/domain/sets";
import { formatIsoWeekdayDay } from "@/lib/format";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { canConvertLoad, convertLoad } from "@/lib/units";
import { cn } from "@/lib/utils";

import { isWarmup, plannedSets } from "./logger-model";
import { CHECK_IN_LABELS } from "./session-details";
import type { ExerciseVM, SessionVM } from "./view-model";

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
}) {
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
            <BackLink fallback={backHref} />
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

        {records}

        <section aria-labelledby="finished-sets">
          <h2 id="finished-sets" className="caption-head mt-4.5">
            {justFinished ? "Recorded" : "Sets"}
          </h2>
          {done.length > 0 ? (
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

        {notDone.length > 0 && (
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
