import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { getSessionDetail } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { SessionView } from "./session-view";
import { toSessionVM } from "./view-model";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage(props: PageProps<"/workouts/[sessionId]">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = await ensureProfile(tx, user);
    const detail = await getSessionDetail(tx, user.id, sessionId);
    return detail ? toSessionVM(detail, profile.timeZone) : null;
  });
  if (!data) notFound();

  const title = data.day?.name ?? "Ad hoc session";
  // Remount the client view whenever the server-side shape of the session changes.
  const viewKey = data.exercises
    .map((e) => `${e.id}:${e.exercise.id}:${e.equipment?.id ?? ""}:${e.skippedAt ?? ""}`)
    .join("|");

  return (
    <>
      <PageHeader title={title} backHref={data.completedAt ? "/history" : "/today"} />
      <PageContent>
        {!data.completedAt && (
          <p className="px-1 text-sm text-ink-muted">
            {data.gym.name}
            {data.cycleIndex ? ` · cycle ${data.cycleIndex}` : ""}
          </p>
        )}
        <SessionView
          key={`${viewKey}:${data.completedAt ?? "open"}`}
          session={data}
          userId={user.id}
        />
      </PageContent>
    </>
  );
}
