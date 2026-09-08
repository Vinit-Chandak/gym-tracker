import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { substituteExerciseAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { listEquipmentForGym } from "@/server/repositories/equipment";
import { listExercises } from "@/server/repositories/exercises";
import { getSessionDetail } from "@/server/repositories/sessions";

import { PickExerciseForm } from "../../../add-exercise/add-exercise-form";

export const metadata: Metadata = { title: "Choose a fallback" };

export default async function SubstitutePage(
  props: PageProps<"/workouts/[sessionId]/exercises/[workoutExerciseId]/substitute">,
) {
  const { sessionId, workoutExerciseId } = await props.params;
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, async (tx) => {
    const session = await getSessionDetail(tx, user.id, sessionId, { includeGuidance: false });
    const slot = session?.exercises.find((e) => e.id === workoutExerciseId);
    if (!session || !slot) return null;
    const [exercises, machines] = await Promise.all([
      listExercises(tx),
      listEquipmentForGym(tx, user.id, session.gym.id),
    ]);
    return {
      session,
      slot,
      exercises: exercises.filter((e) => e.isActive && e.id !== slot.exercise.id),
      machines: machines.filter((m) => m.isActive),
    };
  });
  if (!data) notFound();
  if (data.session.completedAt) redirect(`/workouts/${sessionId}`);
  const plannedExerciseId = data.slot.planned ? data.slot.exercise.id : null;

  return (
    <>
      <PageHeader title="Choose a fallback" backHref={`/workouts/${sessionId}`} />
      <PageContent>
        <Card>
          <p className="text-sm text-ink-muted">
            Instead of <span className="font-medium text-ink">{data.slot.exercise.name}</span> at{" "}
            {data.session.gym.name}, do:
          </p>
          <PickExerciseForm
            action={substituteExerciseAction.bind(
              null,
              sessionId,
              workoutExerciseId,
              data.session.gym.id,
              plannedExerciseId,
            )}
            exercises={data.exercises}
            machines={data.machines.map((m) => ({ id: m.id, name: m.name }))}
            submitLabel="Use this instead"
            remember={plannedExerciseId !== null}
          />
        </Card>
      </PageContent>
    </>
  );
}
