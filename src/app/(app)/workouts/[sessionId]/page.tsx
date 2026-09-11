import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getSessionDetail } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { toSessionVM } from "./view-model";
import { WorkoutView } from "./workout-view";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage(props: PageProps<"/workouts/[sessionId]">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
    const detail = await getSessionDetail(tx, user.id, sessionId, {
      restTimerEnabled: profile.restTimerEnabled,
    });
    return detail
      ? toSessionVM(detail, profile.timeZone, profile.preferredUnit === "lb" ? "lb" : "kg")
      : null;
  });
  if (!data) notFound();

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
        backHref={data.completedAt ? "/history" : "/today"}
      />
      <PageContent>
        <WorkoutView
          key={`${viewKey}:${data.completedAt ?? "open"}`}
          session={data}
          userId={user.id}
        />
      </PageContent>
    </>
  );
}
