"use client";

import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useSetChanges } from "@/components/set-changes";
import { PageContent } from "@/components/shell/page-content";
import { startRestTimer } from "@/components/shell/rest-timer";
import { useSessionDraftExercises, useSessionDrafts } from "@/components/use-session-drafts";
import { UNPLANNED_SESSION } from "@/lib/labels";
import { EDIT_PARAM } from "@/lib/nav";

import { ExerciseLogger } from "./exercise-logger";
import { FinishedWorkout } from "./finished-workout";
import { SessionDetails } from "./session-details";
import { SupersetSheet } from "./superset-sheet";
import { WorkoutOverview } from "./workout-overview";
import { withSetChanges, type SessionVM } from "./view-model";

/** Which exercise is open, if any. A record's id, never a position in the array. */
const EXERCISE_PARAM = "exercise";

/** How many exercises Add exercise just added, said once on arrival and then dropped. */
const ADDED_PARAM = "added";

/**
 * The workout: a list of exercises, and one of them in focus.
 *
 * Focus is a search parameter rather than component state, so back, forward and a shared
 * link all land on a real exercise. It moves through the History API rather than the
 * router, which keeps the change local — no navigation, and no second fetch of a session
 * the page already has.
 *
 * Saving a set does not render the page again either (ADR 0030). The sets saved and deleted
 * here since the render are laid over it, so the list, a reopened exercise and this page
 * brought back by Back all show them.
 *
 * A finished workout is its record, read only, until Edit opens it for a week after its day
 * (ADR 0049). Editing is a search parameter too, so Add exercise, a reload and Back from an
 * exercise come back to it; it is switched in place, adding no step to Back.
 */
export function WorkoutView({
  session: rendered,
  seenSetChanges,
  userId,
  header,
  intro,
  title,
  backHref,
  justFinished = false,
  records,
  routine,
  editUntil = null,
  addExerciseHref,
}: {
  session: SessionVM;
  /** How many of this browser's set changes the render already held. */
  seenSetChanges: number;
  userId: string;
  /**
   * The finished workout's header. An open workout is the session's layer, with its own, as is
   * an exercise in focus.
   */
  header?: ReactNode;
  /** What stands above the list once the workout is finished: its records, Save as routine. */
  intro?: ReactNode;
  /** The day's name, or UNPLANNED_SESSION. */
  title?: string;
  /** Where minimising the open workout goes, or Back from a finished one. */
  backHref?: Route;
  /** A finished workout seen straight after Finish session (board Summary). */
  justFinished?: boolean;
  /** A finished workout's records and Save or repeat, which its page places. */
  records?: ReactNode;
  routine?: ReactNode;
  /** The last day a finished workout can be changed ("2026-10-16"); null once it is history. */
  editUntil?: string | null;
  /** Add exercise, carrying where the workout was opened from. */
  addExerciseHref?: Route;
}) {
  const changes = useSetChanges();
  const session = useMemo(
    () => withSetChanges(rendered, changes, seenSetChanges),
    [rendered, changes, seenSetChanges],
  );
  const searchParams = useSearchParams();
  const finished = session.completedAt !== null;
  // A finished workout opened for changes takes sets and exercises, and nothing else an open
  // one does (ADR 0049).
  const editing = finished && editUntil !== null && searchParams.get(EDIT_PARAM) === "1";
  const readOnly = finished && !editing;

  const draftCount = useSessionDrafts(userId, session.id);
  const draftIds = useSessionDraftExercises(userId, session.id);
  const [focusedDirty, setFocusedDirty] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [supersetFor, setSupersetFor] = useState<{ group: string | null } | null>(null);
  const listScroll = useRef(0);

  const selectedId = searchParams.get(EXERCISE_PARAM);
  const selected = session.exercises.find((exercise) => exercise.id === selectedId) ?? null;

  // Add exercise lands here with how many it added: the list says which, once. The count is
  // taken as the view mounts and dropped from the address, so a reload does not say it again.
  const [added, setAdded] = useState(() =>
    readOnly ? 0 : Math.max(0, Math.trunc(Number(searchParams.get(ADDED_PARAM)) || 0)),
  );
  // Edit and Done switch the record in place: the address changes, Back's steps do not.
  const setEditing = (on: boolean) => {
    setAdded(0);
    const params = new URLSearchParams(searchParams.toString());
    if (on) params.set(EDIT_PARAM, "1");
    else params.delete(EDIT_PARAM);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  };
  useEffect(() => {
    if (!searchParams.has(ADDED_PARAM)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(ADDED_PARAM);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [searchParams]);

  const onDirtyChange = useCallback((dirty: boolean) => setFocusedDirty(dirty), []);

  const openExercise = (id: string) => {
    setAdded(0);
    // An open workout's list scrolls in its layer and keeps its own place there.
    if (finished) listScroll.current = window.scrollY;
    const params = new URLSearchParams(searchParams.toString());
    params.set(EXERCISE_PARAM, id);
    window.history.pushState(null, "", `?${params.toString()}`);
    window.scrollTo({ top: 0 });
  };

  const backToList = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(EXERCISE_PARAM);
    const query = params.toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
    // The list comes back where it was left, so a long workout does not restart at the top.
    if (finished) window.scrollTo({ top: listScroll.current });
  };

  // A draft anywhere in the session blocks finishing, whether or not its exercise is open:
  // the count comes from storage, so an exercise that is not mounted still counts.
  const hasDrafts = draftCount > 0 || focusedDirty;
  const drafts = {
    count: Math.max(draftCount, hasDrafts ? 1 : 0),
    names: session.exercises
      .filter((exercise) => draftIds.includes(exercise.id))
      .map((exercise) => exercise.exercise.name),
  };

  // A finished workout's list is its record (boards Summary, Past workout), and its edit.
  if (finished && !selected)
    return (
      <>
        <FinishedWorkout
          session={session}
          title={title ?? UNPLANNED_SESSION}
          justFinished={justFinished}
          backHref={backHref ?? "/today"}
          records={records}
          routine={routine}
          onOpenExercise={openExercise}
          onOpenDetails={() => setDetailsOpen(true)}
          edit={
            editUntil === null
              ? null
              : {
                  until: editUntil,
                  editing,
                  onEdit: () => setEditing(true),
                  onDone: () => setEditing(false),
                  addHref: addExerciseHref ?? (`/workouts/${session.id}/add-exercise` as Route),
                  added: editing ? added : 0,
                  drafts,
                }
          }
        />
        <SessionDetails
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          session={session}
          readOnly
        />
      </>
    );

  return (
    <>
      {!selected && readOnly && header}
      <PageContent>
        {!selected && intro}
        {selected ? (
          <ExerciseLogger
            // Remount when the slot's identity changes, so drafts stay scoped to it.
            key={`${selected.id}:${selected.exercise.id}:${selected.equipment?.id ?? "none"}`}
            exercise={selected}
            session={session}
            userId={userId}
            readOnly={readOnly}
            amending={editing}
            onBack={backToList}
            onDirtyChange={onDirtyChange}
            onLogged={(seconds) => {
              // A set put into a finished workout is not one between sets.
              if (session.restTimerEnabled && !finished) startRestTimer(session.id, seconds);
            }}
            onEditSuperset={finished ? undefined : (group) => setSupersetFor({ group })}
          />
        ) : (
          <WorkoutOverview
            session={session}
            readOnly={readOnly}
            drafts={drafts}
            onOpenExercise={openExercise}
            onOpenDetails={() => setDetailsOpen(true)}
            onEditSuperset={(group) => setSupersetFor({ group })}
            title={title}
            backHref={backHref}
            layer={!readOnly}
            listScrollRef={listScroll}
            added={added}
          />
        )}
      </PageContent>

      <SessionDetails
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        session={session}
        readOnly={finished}
      />

      {/* Mounted per group so the checkbox selection starts from that group's members. */}
      {supersetFor && (
        <SupersetSheet
          key={supersetFor.group ?? "new"}
          sessionId={session.id}
          exercises={session.exercises}
          group={supersetFor.group}
          onEditGroup={(group) => setSupersetFor({ group })}
          onClose={() => setSupersetFor(null)}
        />
      )}
    </>
  );
}
