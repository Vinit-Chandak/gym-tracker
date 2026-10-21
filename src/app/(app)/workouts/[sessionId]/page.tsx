import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { SessionRecordsCard } from "@/components/records-card";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { canEditWorkout, lastEditDay } from "@/domain/workout-edits";
import { setLengthFor } from "@/lib/distance-units";
import { ORIGIN_PARAM, originQuery, parseOrigin, workoutBackPath, workoutOrigin } from "@/lib/nav";
import { namingExercises, sessionName } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { getSessionDetail } from "@/server/repositories/sessions";
import { readSessionRecords } from "@/server/repositories/shared-stats";
import { requireUuid } from "@/server/validation/params";

import { toSessionVM, type SessionVM } from "./view-model";
import { WorkoutView } from "./workout-view";

/**
 * The session, once a request: the page draws it and the document is named from it. Only reads,
 * so no athlete lock: this also renders after every change to an exercise, beside the shell's
 * own read of the open session.
 */
const readWorkout = cache(async (sessionId: string) => {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const profile = requestProfile;
      // All four come from the request's profile, so the detail read never fetches it again.
      const detail = await getSessionDetail(tx, user.id, sessionId, {
        restTimerEnabled: profile.restTimerEnabled,
        preferredUnit: profile.preferredUnit === "lb" ? "lb" : "kg",
        timeZone: profile.timeZone,
        bodyWeightKg: profile.bodyWeightKg,
      });
      if (!detail) return null;
      // The records were decided when the session finished; an open session has none yet.
      const records = detail.completedAt ? await readSessionRecords(tx, user.id, sessionId) : [];
      return {
        session: toSessionVM(
          detail,
          profile.timeZone,
          profile.preferredUnit === "lb" ? "lb" : "kg",
          todayInTimeZone(profile.timeZone),
          setLengthFor(profile),
        ),
        records,
      };
    },
    { readOnly: true },
  );
  return found && { user, requestProfile, ...found };
});

/** Its day's, its routine's or, once finished, what it held (`sessionName`), as its title. */
const titleOf = (session: SessionVM) =>
  sessionName(session.day?.name, session.title, namingExercises(session));

/** Named as its title is: "Lower A", "Pull-up, Bent-over row", "Unplanned session". */
export async function generateMetadata(
  props: PageProps<"/workouts/[sessionId]">,
): Promise<Metadata> {
  const { sessionId } = await props.params;
  // A malformed address is the page's to refuse; the title only names what is there.
  if (!z.uuid().safeParse(sessionId).success) return { title: "Not found" };
  const read = await readWorkout(sessionId);
  return { title: read ? titleOf(read.session) : "Not found" };
}

export default async function SessionPage(props: PageProps<"/workouts/[sessionId]">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const searchParams = await props.searchParams;
  const requestedOrigin = parseOrigin(searchParams[ORIGIN_PARAM]);
  // Finish session lands here saying so: the summary, once (board Summary).
  const justFinished = searchParams.finished === "1";
  // The sets saved after this render are added by the browser, which knows which ones it holds.
  const seen = await seenSetChanges();
  const read = await readWorkout(sessionId);
  if (!read) notFound();
  const { user, requestProfile, session: data, records } = read;
  const origin = requestedOrigin ?? (data.loggedRetrospectively ? "today" : null);

  const title = titleOf(data);
  // A finished workout can be changed for a week after its day (ADR 0049).
  const startedAt = new Date(data.startedAt);
  const editUntil =
    data.completedAt && canEditWorkout(startedAt, requestProfile.timeZone)
      ? lastEditDay(todayInTimeZone(requestProfile.timeZone, startedAt))
      : null;
  const backHref = (
    data.loggedRetrospectively ? "/today" : workoutBackPath(origin, data.completedAt !== null)
  ) as Route;
  // Where it was opened from, carried on to its own pages so they keep the tab it lit.
  const carried = originQuery(workoutOrigin(origin, data.completedAt !== null));
  // Remount the client view whenever the server-side shape of the session changes.
  const viewKey = data.exercises
    .map((e) => `${e.id}:${e.exercise.id}:${e.equipment?.id ?? ""}:${e.skippedAt ?? ""}`)
    .join("|");

  return (
    // An open workout is the session's layer over the tabs (DESIGN.md, The session): its title,
    // the gym and the day's time once, and Minimise back to Today, which is where a workout is
    // started and finished. A finished one is a page with a header, whose Back goes wherever it
    // was opened from when that said so. An exercise in focus is a layer of its own.
    <WorkoutView
      key={`${viewKey}:${data.completedAt ?? "open"}:${data.preferredUnit}:${data.length}`}
      session={data}
      seenSetChanges={seen}
      userId={user.id}
      title={title}
      backHref={backHref}
      header={<PageHeader title={title} meta={data.gym.name} backHref={backHref} />}
      justFinished={justFinished}
      records={
        <SessionRecordsCard records={records} unit={data.preferredUnit} length={data.length} />
      }
      editUntil={editUntil}
      addExerciseHref={`/workouts/${sessionId}/add-exercise${carried}` as Route}
    />
  );
}
