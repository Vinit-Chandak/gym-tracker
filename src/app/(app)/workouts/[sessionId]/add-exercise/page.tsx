import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { SessionPage } from "@/components/shell/session-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { addExercisesAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { sessionPageHeader } from "@/server/queries/session-page";
import { listEquipmentForGym, machinesByExerciseAtGym } from "@/server/repositories/equipment";
import { listExercises, preferredMachinesAtGym } from "@/server/repositories/exercises";
import { getSessionRecord, sessionExerciseIds } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { AddExercisesForm } from "./add-exercises-form";

export const metadata: Metadata = { title: "Add exercise" };

export default async function AddExercisePage(
  props: PageProps<"/workouts/[sessionId]/add-exercise">,
) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const header = sessionPageHeader(user, sessionId);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const session = await getSessionRecord(tx, user.id, sessionId);
      if (!session) return null;
      const [exercises, machines, machinesByExercise, preferredMachines, inWorkout] =
        await Promise.all([
          listExercises(tx),
          listEquipmentForGym(tx, user.id, session.gymId),
          machinesByExerciseAtGym(tx, user.id, session.gymId),
          preferredMachinesAtGym(tx, user.id, session.gymId),
          sessionExerciseIds(tx, user.id, sessionId),
        ]);
      return {
        session,
        exercises: exercises.filter((e) => e.isActive),
        machines: machines.filter((m) => m.isActive),
        machinesByExercise,
        preferredMachines,
        inWorkout,
      };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  if (data.session.completedAt) redirect(`/workouts/${sessionId}`);

  const { name, restTimerEnabled } = await header;

  // Board Add exercise: the session's page, its way back named by the session.
  return (
    <SessionPage
      title="Add exercise"
      back={{ href: `/workouts/${sessionId}` as Route, label: name }}
      rest={restTimerEnabled ? sessionId : null}
    >
      <AddExercisesForm
        action={addExercisesAction.bind(null, sessionId)}
        exercises={data.exercises}
        machines={data.machines.map((m) => ({ id: m.id, name: m.name }))}
        machinesByExercise={data.machinesByExercise}
        preferredMachines={data.preferredMachines}
        inWorkout={data.inWorkout}
      />
    </SessionPage>
  );
}
