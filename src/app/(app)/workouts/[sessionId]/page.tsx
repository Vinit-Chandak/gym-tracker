import type { Metadata } from "next";
import { SaveWorkoutRoutine } from "@/components/coaching/routines";
import { notFound } from "next/navigation";

import { SessionRecordsCard } from "@/components/records-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { getSessionDetail } from "@/server/repositories/sessions";
import { readSessionRecords } from "@/server/repositories/shared-stats";
import { requireUuid } from "@/server/validation/params";

import { toSessionVM } from "./view-model";
import { WorkoutView } from "./workout-view";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage(props: PageProps<"/workouts/[sessionId]">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  // The sets saved after this render are added by the browser, which knows which ones it holds.
  const seen = await seenSetChanges();
  // Only reads, so no athlete lock: this also renders after every change to an exercise, beside
  // the shell's own read of the open session.
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const profile = requestProfile;
      // All three come from the request's profile, so the detail read never fetches it again.
      const detail = await getSessionDetail(tx, user.id, sessionId, {
        restTimerEnabled: profile.restTimerEnabled,
        preferredUnit: profile.preferredUnit === "lb" ? "lb" : "kg",
        timeZone: profile.timeZone,
      });
      if (!detail) return null;
      // The records were decided when the session finished; an open session has none yet.
      const records = detail.completedAt ? await readSessionRecords(tx, user.id, sessionId) : [];
      return {
        session: toSessionVM(
          detail,
          profile.timeZone,
          profile.preferredUnit === "lb" ? "lb" : "kg",
        ),
        records,
      };
    },
    { readOnly: true },
  );
  if (!found) notFound();
  const { session: data, records } = found;

  const title = data.day?.name ?? "Ad hoc session";
  // Remount the client view whenever the server-side shape of the session changes.
  const viewKey = data.exercises
    .map((e) => `${e.id}:${e.exercise.id}:${e.equipment?.id ?? ""}:${e.skippedAt ?? ""}`)
    .join("|");

  return (
    <>
      {/* The gym and the cycle are said once, here. The logger below never repeats them. */}
      <PageHeader
        title={title}
        meta={`${data.gym.name}${data.cycleIndex ? ` · cycle ${data.cycleIndex}` : ""}`}
        backHref={data.completedAt ? "/progress/history" : "/today"}
      />
      <PageContent>
        {data.completedAt && <SessionRecordsCard records={records} unit={data.preferredUnit} />}
        {data.completedAt && <SaveWorkoutRoutine sessionId={sessionId} name={title} />}
        <WorkoutView
          key={`${viewKey}:${data.completedAt ?? "open"}:${data.preferredUnit}`}
          session={data}
          seenSetChanges={seen}
          userId={user.id}
        />
      </PageContent>
    </>
  );
}
