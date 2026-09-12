"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { startRestTimer } from "@/components/shell/rest-timer";
import { useSessionDrafts } from "@/components/use-session-drafts";

import { ExerciseLogger } from "./exercise-logger";
import { SessionDetails } from "./session-details";
import { SupersetSheet } from "./superset-sheet";
import { WorkoutOverview } from "./workout-overview";
import type { SessionVM } from "./view-model";

/** Which exercise is open, if any. A record's id, never a position in the array. */
const EXERCISE_PARAM = "exercise";

/**
 * The workout: a list of exercises, and one of them in focus.
 *
 * Focus is a search parameter rather than component state, so back, forward and a shared
 * link all land on a real exercise. It moves through the History API rather than the
 * router, which keeps the change local — no navigation, and no second fetch of a session
 * the page already has.
 */
export function WorkoutView({ session, userId }: { session: SessionVM; userId: string }) {
  const searchParams = useSearchParams();
  const readOnly = session.completedAt !== null;

  const draftCount = useSessionDrafts(userId, session.id);
  const [focusedDirty, setFocusedDirty] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [supersetFor, setSupersetFor] = useState<{ group: string | null } | null>(null);
  const listScroll = useRef(0);

  const selectedId = searchParams.get(EXERCISE_PARAM);
  const selected = session.exercises.find((exercise) => exercise.id === selectedId) ?? null;

  const onDirtyChange = useCallback((dirty: boolean) => setFocusedDirty(dirty), []);

  const openExercise = (id: string) => {
    listScroll.current = window.scrollY;
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
    window.scrollTo({ top: listScroll.current });
  };

  // A draft anywhere in the session blocks finishing, whether or not its exercise is open:
  // the count comes from storage, so an exercise that is not mounted still counts.
  const hasDrafts = draftCount > 0 || focusedDirty;

  return (
    <>
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
        />
      ) : (
        <WorkoutOverview
          session={session}
          readOnly={readOnly}
          hasDrafts={hasDrafts}
          onOpenExercise={openExercise}
          onOpenDetails={() => setDetailsOpen(true)}
          onEditSuperset={(group) => setSupersetFor({ group })}
        />
      )}

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
