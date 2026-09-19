import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LegacyUnavailable } from "@/components/activities/legacy-unavailable";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { activityForLegacyRun } from "@/server/legacy-routes";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Edit run" };

/** The old edit link, resolved onto the activity the run became (plan §3.2). */
export default async function EditRunPage(props: PageProps<"/runs/[runId]/edit">) {
  const { runId } = await props.params;
  requireUuid(runId);
  const user = await requireUser();
  const activityId = await withUser(
    getDb(),
    user.id,
    (tx) => activityForLegacyRun(tx, user.id, runId),
    { readOnly: true },
  );
  if (!activityId) return <LegacyUnavailable />;
  redirect(`/training/activities/${activityId}/edit`);
}
