import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivitySummary } from "@/components/activities/activity-summary";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getDirectoryProfile } from "@/server/repositories/people";
import { canViewTraining, readSharedActivity } from "@/server/repositories/shared-stats";
import { requireUuid, requireUsername } from "@/server/validation/params";
import type { BodyLoadUnit, LoadUnit } from "@/domain/types";

/** Shared loads are kilograms or pounds; a stack index is not a load anyone else can read. */
function bodyLoadUnit(unit: LoadUnit): BodyLoadUnit {
  return unit === "lb" ? "lb" : "kg";
}

export const metadata: Metadata = { title: "Shared session" };

/**
 * One shared session, opened from a friend's feed or profile (plan §9.2).
 *
 * Everything about this route is deliberately narrow. It is addressed by the shared row's own
 * id, never by the activity's — guessing a raw id must not reveal that a record exists, let
 * alone what is in it. It reads the shared projection and nothing else, so a private note or
 * a heart rate is not merely hidden here, it is out of reach. And it checks that the reader
 * may see this person's training at all before it reads anything, so an unfollowed account
 * and a missing row give the same answer (AT-PRIV-04).
 */
export default async function SharedActivityPage(
  props: PageProps<"/u/[username]/activities/[sharedStatId]">,
) {
  const { username, sharedStatId } = await props.params;
  requireUsername(username);
  requireUuid(sharedStatId);
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const activity = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const person = await getDirectoryProfile(tx, username);
      if (!person) return null;
      // Not found and not permitted read the same on purpose.
      if (person.id !== user.id && !(await canViewTraining(tx, person.id))) return null;
      return readSharedActivity(tx, person.id, sharedStatId);
    },
    { readOnly: true },
  );
  if (!activity) notFound();

  return (
    <>
      <PageHeader title="Session" backHref={`/u/${username}`} />
      <PageContent>
        <ActivitySummary activity={activity} unit={bodyLoadUnit(profile.preferredUnit)} />
      </PageContent>
    </>
  );
}
