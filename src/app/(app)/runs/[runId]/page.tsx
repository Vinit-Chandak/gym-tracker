import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LegacyUnavailable } from "@/components/activities/legacy-unavailable";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { activityForLegacyRun } from "@/server/legacy-routes";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Run" };

/**
 * An old `/runs/<uuid>` link (plan §3.2).
 *
 * The run it names is an activity now, and the identifier map says which one. A link that
 * cannot be resolved says so rather than landing on somebody else's session.
 */
export default async function RunPage(props: PageProps<"/runs/[runId]">) {
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
  redirect(`/training/activities/${activityId}`);
}
