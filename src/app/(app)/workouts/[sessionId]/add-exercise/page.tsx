import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { addExerciseAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { listEquipmentForGym } from "@/server/repositories/equipment";
import { listExercises } from "@/server/repositories/exercises";
import { getSessionRecord } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { PickExerciseForm } from "./add-exercise-form";

export const metadata: Metadata = { title: "Add exercise" };

export default async function AddExercisePage(
  props: PageProps<"/workouts/[sessionId]/add-exercise">,
) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, async (tx) => {
    const session = await getSessionRecord(tx, user.id, sessionId);
    if (!session) return null;
    const [exercises, machines] = await Promise.all([
      listExercises(tx),
      listEquipmentForGym(tx, user.id, session.gymId),
    ]);
    return {
      session,
      exercises: exercises.filter((e) => e.isActive),
      machines: machines.filter((m) => m.isActive),
    };
  });
  if (!data) notFound();
  if (data.session.completedAt) redirect(`/workouts/${sessionId}`);

  return (
    <>
      <PageHeader title="Add exercise" backHref={`/workouts/${sessionId}`} />
      <PageContent>
        <Card>
          <PickExerciseForm
            action={addExerciseAction.bind(null, sessionId)}
            exercises={data.exercises}
            machines={data.machines.map((m) => ({ id: m.id, name: m.name }))}
            submitLabel="Add to session"
          />
        </Card>
      </PageContent>
    </>
  );
}
