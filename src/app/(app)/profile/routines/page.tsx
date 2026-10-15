import { and, eq, isNull, or } from "drizzle-orm";
import type { Metadata } from "next";
import { RoutineLibrary } from "@/components/coaching/routines";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { gyms, exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";

import { setLengthFor } from "@/lib/distance-units";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { suggestion } from "@/domain/schedule";
import { listSavedRoutines } from "@/server/repositories/manual-training";
import { getSchedule } from "@/server/repositories/schedule";

export const metadata: Metadata = { title: "Routines" };

export default async function Page() {
  const user = await requireProfiledUser();
  // The cached read `requireProfiledUser` made: what a carry's range reads in.
  const length = setLengthFor(await getRequestProfile(user.id, user.email));
  const [routines, locations, library, schedule] = await withUser(
    getDb(),
    user.id,
    (tx) =>
      Promise.all([
        listSavedRoutines(tx, user.id),
        tx
          .select({ id: gyms.id, name: gyms.name, isDefault: gyms.isDefault })
          .from(gyms)
          .where(and(eq(gyms.userId, user.id), eq(gyms.isActive, true))),
        tx
          .select({ slug: exercises.slug, name: exercises.name })
          .from(exercises)
          .where(or(isNull(exercises.userId), eq(exercises.userId, user.id))),
        getSchedule(tx, user.id),
      ]),
    { readOnly: true },
  );
  // A programme with days still to do is under way; a finished one, or none, has nothing a
  // routine could change, and the line above the routines does not speak of one.
  const programme = schedule && suggestion(schedule.state) ? "ongoing" : "none";
  return (
    <>
      {/* Under Profile, whose tab is lit here, so that is where Back goes without a page
          before it. */}
      <PageHeader title="Routines" backHref="/profile" />
      <PageContent>
        <RoutineLibrary
          routines={routines}
          gyms={locations}
          library={library}
          programme={programme}
          length={length}
        />
      </PageContent>
    </>
  );
}
