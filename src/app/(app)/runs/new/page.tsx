import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LegacyUnavailable } from "@/components/activities/legacy-unavailable";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { occurrenceForLegacyPlannedRun } from "@/server/legacy-routes";

export const metadata: Metadata = { title: "Log a run" };

/**
 * The old run logger, now an alias onto the shared one (plan §3.2).
 *
 * `?planned=` names one exact plan. It resolves through the durable identifier map or it does
 * not resolve at all: falling back to another plan would log the wrong session (AT-NAV-07).
 */
export default async function NewRunPage(props: PageProps<"/runs/new">) {
  const { planned: plannedParam } = await props.searchParams;
  const requestedPlanId = typeof plannedParam === "string" ? plannedParam : null;
  const user = await requireUser();
  if (requestedPlanId) {
    const occurrenceId = await withUser(
      getDb(),
      user.id,
      (tx) => occurrenceForLegacyPlannedRun(tx, user.id, requestedPlanId),
      { readOnly: true },
    );
    if (!occurrenceId) return <LegacyUnavailable />;
    redirect(`/training/new?occurrence=${occurrenceId}`);
  }
  redirect("/training/new?sport=running");
}
