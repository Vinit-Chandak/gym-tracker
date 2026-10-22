"use client";

import type { Route } from "next";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Art } from "@/components/art/art";
import { sessionParts } from "@/components/art/session-print";
import { BackLink } from "@/components/shell/back-link";
import Link from "@/components/ui/app-link";
import { buttonClassName, LinkButton } from "@/components/ui/button";
import { Figures } from "@/components/ui/figures";
import { boldEmWidth, emWidth, textEmWidth } from "@/components/ui/fit";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SavedNotice } from "@/components/ui/saved-notice";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatSets, loadReadingOf, workingSetCount } from "@/domain/sets";
import type { SetLengthUnit } from "@/lib/distance-units";
import { formatIsoDate, formatSleep } from "@/lib/format";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { canConvertLoad, convertLoad } from "@/lib/units";
import { cn } from "@/lib/utils";

import { isWarmup, printedSession, warmupName } from "./logger-model";
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
  /**
   * The summary's Edit, which puts the past workout it becomes in its place, opened from where
   * the summary was: Today, where it was finished (NAV-03).
   */
  editHref: Route;
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
    ? `Unsaved set ${where}: save or remove it.`
    : `Unsaved sets ${where}: save or remove them.`;
}

/** Load moved, the app's rule (working sets, load × reps), in the reader's unit. */
function volumeOf(session: SessionVM): number {
  let total = 0;
  for (const exercise of session.exercises) {
    // An assisted machine's number is help, and more help is not more work: it lifts no volume.
    if (exercise.equipment?.ladder?.assisted) continue;
    for (const set of exercise.sets) {
      if (isWarmup(set.setType) || set.weight === null || set.reps === null) continue;
      if (!canConvertLoad(set.unit, session.preferredUnit)) continue;
      total += convertLoad(set.weight, set.unit, session.preferredUnit) * set.reps;
    }
  }
  return Math.round(total);
}

function Stat({ figure, unit, label }: { figure: string; unit?: string; label: string }) {
  return (
    <div>
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

/**
 * The room a check-in reading needs on one line, as a CSS length: its name or its figure,
 * whichever is wider ("Sleep quality", "10 h 45 min"), each figure in Jost and its unit at the
 * caption's size. A figure also stands 0.4 of its size clear of the next reading's beyond the
 * row's gap (twice the room a name has, at the default text size), so "7 h 15 min" is never read
 * on into "2 / 5" as one run.
 */
function readingWidth({ label, parts }: { label: string; parts: string[][] }): string {
  const at = (em: number, size: "figure" | "caption") =>
    `${em.toFixed(3)} * var(--ov-type-${size})`;
  const figure = parts
    .map(
      ([value = "", unit = ""]) =>
        `${at(emWidth(value), "figure")} + ${at(boldEmWidth(` ${unit}`), "caption")}`,
    )
    .join(` + ${textEmWidth(" ").toFixed(3)}em + `);
  return `max(${at(textEmWidth(label), "caption")}, ${figure} + ${at(0.4, "figure")})`;
}

/**
 * An exercise's sets as the app lists a past session's: its working sets, each with its unit,
 * a bodyweight movement's and an assisted machine's read as the logger reads them, and a carry
 * in the session's length.
 */
function setsLine(exercise: ExerciseVM, length: SetLengthUnit): string {
  return formatSets(
    exercise.sets,
    (unit) => LOAD_UNIT_LABELS[unit],
    loadReadingOf(exercise.exercise, exercise.equipment?.ladder?.assisted),
    length,
  );
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
  const summaryDestination = session.loggedRetrospectively ? backHref : "/today";
  const done = session.exercises.filter((exercise) => exercise.sets.length > 0);
  const notDone = session.exercises.filter((exercise) => exercise.sets.length === 0);
  // The record as a print, drawn as the day it was done on draws it: the warm-up's fan as it
  // ended, then a column for each exercise. The rows under it name the fan first, as the
  // programme day's do, done or not, as the Edit list does.
  const printed = printedSession(session);
  const drills = printed.drills;
  const warmup = drills > 0 ? warmupName(session) : null;
  const warmupLine = `${drills}\u00a0${drills === 1 ? "drill" : "drills"}`;
  // The sets listed under it, warm-ups aside: the print draws those, grey, and counts nothing.
  const sets = done.reduce((sum, exercise) => sum + workingSetCount(exercise.sets), 0);
  const volume = volumeOf(session);
  const minutes = session.completedAt
    ? Math.round(
        (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
      )
    : null;
  const day = todayInTimeZone(session.timeZone, new Date(session.startedAt));
  // Each reading as figures and their units: a night's sleep is said as every other time is,
  // "7 h 45 min", two of each, not "7.75 h".
  const checkIn = CHECK_IN_LABELS.flatMap(([key, label, unit]) => {
    const value = session[key];
    if (typeof value !== "number") return [];
    const parts =
      key === "sleepHours"
        ? formatSleep(value)
            .split(" ")
            .map((part) => part.split("\u00a0"))
        : [[String(value), unit]];
    return [{ label, parts }];
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
              <Link href={summaryDestination} aria-label="Close" className="icon-button">
                <Glyph name="close" className="glyph-22" />
              </Link>
            </>
          ) : (
            <>
              <BackLink fallback={backHref} />
              {edit && (
                <div className="page-header-action">
                  {/* Edit and Done are words at the end of the bar, as a gym's Edit is, on the
                      content's edge at every text size: a fill as tall as the bar (Android, large
                      text) ran from the screen's top edge to the print. */}
                  {editing ? (
                    <button type="button" className="header-text-action" onClick={edit.onDone}>
                      Done
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="header-text-action"
                      aria-label="Edit workout"
                      onClick={edit.onEdit}
                    >
                      Edit
                    </button>
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
            parts={sessionParts(printed)}
            label={`${title} as it ended: ${[
              warmup
                ? `the warm-up ${session.warmupCompleted ? "done" : "not done, dashed"}`
                : null,
              `${done.length} ${done.length === 1 ? "exercise" : "exercises"} done${
                notDone.length > 0 ? `, ${notDone.length} not done, dashed` : ""
              }`,
            ]
              .filter(Boolean)
              .join(", then ")}`}
            className="size-full"
          />
        </figure>
        <FitTitle as="h1" sizes={{ base: 34, narrow: 30 }} className="mt-3">
          {title}
        </FitTitle>
        <p className="meta-line mt-1">
          {(!justFinished || session.loggedRetrospectively) && (
            <span className="meta-fact">
              <Glyph name="calendar" label="Date" className="glyph-16" />
              {formatIsoDate(day, session.today.slice(0, 4))}
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

        {/* Each row ends in its chevron, and a change saves as it is made: the note says only
            how long the record stays open. */}
        {editing && edit && (
          <p role="status" className="finished-edit-note">
            <Glyph name="edit" className="mt-px glyph-18 shrink-0" />
            <span className="min-w-0">
              Editable until {formatIsoDate(edit.until, session.today.slice(0, 4))}
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
              {(warmup || session.exercises.length > 0) && (
                <ul ref={listRef}>
                  {warmup && (
                    <li className="record-row">
                      <span className="record-row-name">{warmup}</span>
                      <span
                        className={cn("record-row-sets", !session.warmupCompleted && "text-ink-2")}
                      >
                        {session.warmupCompleted ? warmupLine : "Not done"}
                      </span>
                    </li>
                  )}
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
                            <span className="record-row-sets">
                              <Figures>{setsLine(exercise, session.length)}</Figures>
                            </span>
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
                  <span className="min-w-0 [overflow-wrap:break-word]">
                    {draftsLine(edit.drafts)}
                  </span>
                </p>
              )}
              <LinkButton href={edit.addHref} variant="tonal" size="sm" className="mt-2.5">
                <Glyph name="plus" className="glyph-18" />
                Add exercise
              </LinkButton>
            </>
          ) : (
            <>
              {(done.length > 0 || warmup) && (
                <ul>
                  {warmup && (
                    <li className="record-row">
                      <span className="record-row-name">{warmup}</span>{" "}
                      <span
                        className={cn("record-row-sets", !session.warmupCompleted && "text-ink-2")}
                      >
                        {session.warmupCompleted ? warmupLine : "Not done"}
                      </span>
                    </li>
                  )}
                  {done.map((exercise) => (
                    <li key={exercise.id}>
                      <button
                        type="button"
                        onClick={() => onOpenExercise(exercise.id)}
                        className="record-row w-full text-left"
                      >
                        <span className="record-row-name">{exercise.exercise.name}</span>{" "}
                        <span className="record-row-sets">
                          <Figures>{setsLine(exercise, session.length)}</Figures>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {done.length === 0 && (
                <p className="record-row type-meta text-ink-2">No sets logged.</p>
              )}
            </>
          )}
        </section>

        {/* The warm-up is named once, on its row above. */}
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
          <Link href={edit.editHref} replace className={buttonClassName("tonal", "sm", "mt-2.5")}>
            <Glyph name="edit" className="glyph-18" />
            Edit workout
          </Link>
        )}

        {!justFinished && checkIn.length > 0 && (
          <section aria-labelledby="finished-check-in">
            <h2 id="finished-check-in" className="caption-head mt-4.5">
              Check-in
            </h2>
            {/* Four to a row while the widest reading, its name or its figure, has a quarter of
                it; else two and two (session.css). A figure keeps one line ("7 h 15 min"). */}
            <dl
              className="finished-check-in"
              style={
                {
                  "--check-in-cell": `max(${checkIn.map(readingWidth).join(", ")})`,
                  "--check-in-count": checkIn.length,
                } as CSSProperties
              }
            >
              {checkIn.map(({ label, parts }) => (
                <div key={label} className="flex min-w-0 flex-col justify-between">
                  <dt className="type-caption font-medium text-ink-2">{label}</dt>
                  <dd className="mt-0.5 whitespace-nowrap">
                    {parts.map(([figure, unit], index) => (
                      <Fragment key={index}>
                        {index > 0 && " "}
                        <span className="type-figure">{figure}</span>
                        <span className="figure-row-unit"> {unit}</span>
                      </Fragment>
                    ))}
                  </dd>
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
            <SavedNotice>Workout saved</SavedNotice>
            <Link href={summaryDestination} className={buttonClassName("primary", "lg", "w-full")}>
              Done
            </Link>
          </PinnedActions>
        )}
      </div>
    </div>
  );
}
