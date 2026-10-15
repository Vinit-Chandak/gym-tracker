import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivitySummary } from "@/components/activities/activity-summary";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { setLengthFor } from "@/lib/distance-units";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getDirectoryProfile } from "@/server/repositories/people";
import {
  canViewTraining,
  readDistanceUnits,
  readSharedActivity,
  readSharedSessionExercises,
} from "@/server/repositories/shared-stats";
import { requireUuid, requireUsername } from "@/server/validation/params";
import type { BodyLoadUnit, LoadUnit } from "@/domain/types";

/** Shared loads are kilograms or pounds; a stack index is not a load anyone else can read. */
function bodyLoadUnit(unit: LoadUnit): BodyLoadUnit {
  return unit === "lb" ? "lb" : "kg";
}

export const metadata: Metadata = { title: "Shared session" };

/**
 * One shared session, opened from a friend's feed or profile (plan §9.2): its name, whose it is
 * (opening their page) and its day, where the owner's own record has its day and gym, then what
 * the shared rows say of it.
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
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const person = await getDirectoryProfile(tx, username);
      if (!person) return null;
      // Not found and not permitted read the same on purpose.
      if (person.id !== user.id && !(await canViewTraining(tx, person.id))) return null;
      const [activity, exercises, distanceUnits] = await Promise.all([
        readSharedActivity(tx, person.id, sharedStatId),
        // A workout's shared-library movements; a run, a ride or a swim has none.
        readSharedSessionExercises(tx, person.id, sharedStatId),
        // A distance reads in the reader's own unit for the sport, as on every friend's row.
        readDistanceUnits(tx, user.id),
      ]);
      return activity ? { person, activity, exercises, distanceUnits } : null;
    },
    { readOnly: true },
  );
  if (!found) notFound();
  const { person, activity } = found;
  const name = person.displayName || person.username;
  // The reader's year, as their own records are dated: a day in another year names it.
  const year = todayInTimeZone(profile.timeZone).slice(0, 4);

  return (
    <>
      <PageHeader
        title={activity.title}
        backHref={`/u/${person.username}`}
        // Their page, by the name it is titled with.
        backLabel={name}
        meta={
          <>
            <Link
              href={`/u/${person.username}`}
              prefetch="intent"
              className="meta-fact tap-area font-semibold text-ink underline-offset-4 hover:underline"
            >
              <Glyph name="profile" className="glyph-16" />
              {name}
            </Link>
            <span className="meta-fact">
              <Glyph name="calendar" label="Date" className="glyph-16" />
              {formatIsoDate(activity.occurredOn, year)}
            </span>
          </>
        }
      />
      <div className="page-width pb-8">
        <ActivitySummary
          activity={activity}
          exercises={found.exercises}
          name={name}
          unit={bodyLoadUnit(profile.preferredUnit)}
          length={setLengthFor(profile)}
          distanceUnits={found.distanceUnits}
        />
      </div>
    </>
  );
}
