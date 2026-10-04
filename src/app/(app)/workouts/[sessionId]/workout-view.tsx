"use client";

import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { useSetChanges } from "@/components/set-changes";
import { PageContent } from "@/components/shell/page-content";
import { startRestTimer } from "@/components/shell/rest-timer";
import { useSessionDraftExercises, useSessionDrafts } from "@/components/use-session-drafts";
import { UNPLANNED_SESSION } from "@/lib/labels";

import { ExerciseLogger } from "./exercise-logger";
import { FinishedWorkout } from "./finished-workout";
import { SessionDetails } from "./session-details";
import { SupersetSheet } from "./superset-sheet";
import { WorkoutOverview } from "./workout-overview";
import { withSetChanges, type SessionVM } from "./view-model";

/** Which exercise is open, if any. A record's id, never a position in the array. */
const EXERCISE_PARAM = "exercise";

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
}) {
  const changes = useSetChanges();
  const session = useMemo(
    () => withSetChanges(rendered, changes, seenSetChanges),
    [rendered, changes, seenSetChanges],
  );
  const searchParams = useSearchParams();
  const readOnly = session.completedAt !== null;

  const draftCount = useSessionDrafts(userId, session.id);
  const draftIds = useSessionDraftExercises(userId, session.id);
  const [focusedDirty, setFocusedDirty] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [supersetFor, setSupersetFor] = useState<{ group: string | null } | null>(null);
  const listScroll = useRef(0);

  const selectedId = searchParams.get(EXERCISE_PARAM);
  const selected = session.exercises.find((exercise) => exercise.id === selectedId) ?? null;

  const onDirtyChange = useCallback((dirty: boolean) => setFocusedDirty(dirty), []);

  const openExercise = (id: string) => {
    // An open workout's list scrolls in its layer and keeps its own place there.
    if (readOnly) listScroll.current = window.scrollY;
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
    if (readOnly) window.scrollTo({ top: listScroll.current });
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

  // A finished workout's list is its record (boards Summary, Past workout).
  if (readOnly && !selected)
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
        />
        <SessionDetails
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          session={session}
          readOnly={readOnly}
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
            onBack={backToList}
            onDirtyChange={onDirtyChange}
            onLogged={(seconds) => {
              if (session.restTimerEnabled) startRestTimer(session.id, seconds);
            }}
            onEditSuperset={readOnly ? undefined : (group) => setSupersetFor({ group })}
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
          />
        )}
      </PageContent>

      <SessionDetails
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        session={session}
        readOnly={readOnly}
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
