import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { SessionPage } from "@/components/shell/session-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { canEditWorkout } from "@/domain/workout-edits";
import { UNPLANNED_SESSION } from "@/lib/labels";
import { EDIT_PARAM, ORIGIN_PARAM, parseOrigin } from "@/lib/nav";
import { addExercisesAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { sessionPageHeader } from "@/server/queries/session-page";
import { listEquipmentForGym, machinesByExerciseAtGym } from "@/server/repositories/equipment";
import { listExercises, preferredMachinesAtGym } from "@/server/repositories/exercises";
import {
  getSessionRecord,
  sessionDayName,
  sessionExerciseIds,
} from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { AddExercisesForm } from "./add-exercises-form";

export const metadata: Metadata = { title: "Add exercise" };

export default async function AddExercisePage(
  props: PageProps<"/workouts/[sessionId]/add-exercise">,
) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const origin = parseOrigin((await props.searchParams)[ORIGIN_PARAM]);
  const user = await requireUser();
  const header = sessionPageHeader(user, sessionId);
  const profile = getRequestProfile(user.id, user.email);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const session = await getSessionRecord(tx, user.id, sessionId);
      if (!session) return null;
      const [exercises, machines, machinesByExercise, preferredMachines, inWorkout, dayName] =
        await Promise.all([
          listExercises(tx),
          listEquipmentForGym(tx, user.id, session.gymId),
          machinesByExerciseAtGym(tx, user.id, session.gymId),
          preferredMachinesAtGym(tx, user.id, session.gymId),
          sessionExerciseIds(tx, user.id, sessionId),
          session.completedAt ? sessionDayName(tx, user.id, sessionId) : null,
        ]);
      return {
        session,
        dayName,
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
  // A finished workout takes exercises for a week after its day, from its edit (ADR 0049).
  const finished = data.session.completedAt !== null;
  if (finished && !canEditWorkout(data.session.startedAt, (await profile).timeZone))
    redirect(`/workouts/${sessionId}`);

  const { name, restTimerEnabled } = await header;
  const back = finished
    ? {
        href: `/workouts/${sessionId}?${origin ? `${ORIGIN_PARAM}=${origin}&` : ""}${EDIT_PARAM}=1` as Route,
        label: data.dayName ?? UNPLANNED_SESSION,
      }
    : { href: `/workouts/${sessionId}` as Route, label: name };

  // Board Add exercise: the session's page, its way back named by the session.
  return (
    <SessionPage
      title="Add exercise"
      back={back}
      rest={restTimerEnabled && !finished ? sessionId : null}
    >
      <AddExercisesForm
        action={addExercisesAction.bind(null, sessionId, finished ? origin : null)}
        exercises={data.exercises}
        machines={data.machines.map((m) => ({ id: m.id, name: m.name }))}
        machinesByExercise={data.machinesByExercise}
        preferredMachines={data.preferredMachines}
        inWorkout={data.inWorkout}
      />
    </SessionPage>
  );
}
