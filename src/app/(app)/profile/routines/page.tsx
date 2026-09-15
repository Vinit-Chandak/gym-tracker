import { and, eq, isNull, or } from "drizzle-orm";
import { RoutineLibrary } from "@/components/coaching/routines";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { gyms, exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { listSavedRoutines } from "@/server/repositories/manual-training";
export default async function Page() {
  const user = await requireProfiledUser();
  const [routines, locations, library] = await withUser(
    getDb(),
    user.id,
    (tx) =>
      Promise.all([
        listSavedRoutines(tx, user.id),
        tx
          .select({ id: gyms.id, name: gyms.name })
          .from(gyms)
          .where(and(eq(gyms.userId, user.id), eq(gyms.isActive, true))),
        tx
          .select({ slug: exercises.slug, name: exercises.name })
          .from(exercises)
          .where(or(isNull(exercises.userId), eq(exercises.userId, user.id))),
      ]),
    { readOnly: true },
  );
  return (
    <>
      <PageHeader title="Routines" backHref="/today" />
      <PageContent>
        <RoutineLibrary routines={routines} gyms={locations} library={library} />
      </PageContent>
    </>
  );
}
