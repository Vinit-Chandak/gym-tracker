import { and, eq } from "drizzle-orm";
import { CustomExerciseForm } from "@/components/coaching/custom-exercise-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { equipmentInstances, gyms } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
export default async function Page() {
  const user = await requireProfiledUser();
  const machines = await withUser(
    getDb(),
    user.id,
    (tx) =>
      tx
        .select({ id: equipmentInstances.id, name: equipmentInstances.name, gymName: gyms.name })
        .from(equipmentInstances)
        .innerJoin(gyms, eq(gyms.id, equipmentInstances.gymId))
        .where(
          and(
            eq(equipmentInstances.userId, user.id),
            eq(equipmentInstances.isActive, true),
            eq(gyms.isActive, true),
          ),
        ),
    { readOnly: true },
  );
  return (
    <>
      <PageHeader title="Custom exercise" backHref="/exercises" />
      <PageContent>
        <Card>
          <CustomExerciseForm machines={machines} />
        </Card>
      </PageContent>
    </>
  );
}
