import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { SessionPage } from "@/components/shell/session-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { likeOf } from "@/lib/exercise-search";
import { substituteExerciseAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listEquipmentForGym, machinesByExerciseAtGym } from "@/server/repositories/equipment";
import { listExercises } from "@/server/repositories/exercises";
import { slotExerciseId } from "@/server/repositories/fallbacks";
import { getSessionDetail } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { PickExerciseForm } from "../../../add-exercise/add-exercise-form";

export const metadata: Metadata = { title: "Swap the exercise" };

export default async function SubstitutePage(
  props: PageProps<"/workouts/[sessionId]/exercises/[workoutExerciseId]/substitute">,
) {
  const { sessionId, workoutExerciseId } = await props.params;
  // "Out of use today" comes here with Remember unticked: today's machine says nothing lasting.
  const { remember: rememberParam } = await props.searchParams;
  requireUuid(sessionId);
  requireUuid(workoutExerciseId);
  const user = await requireUser();
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const session = await getSessionDetail(tx, user.id, sessionId, { includeGuidance: false });
      const slot = session?.exercises.find((e) => e.id === workoutExerciseId);
      if (!session || !slot) return null;
      const programExerciseId = slot.planned?.programExerciseId ?? null;
      const [exercises, machines, machinesByExercise, plannedExerciseId] = await Promise.all([
        listExercises(tx),
        listEquipmentForGym(tx, user.id, session.gym.id),
        machinesByExerciseAtGym(tx, user.id, session.gym.id),
        programExerciseId ? slotExerciseId(tx, user.id, programExerciseId) : null,
      ]);
      // An exercise on a machine stays on offer while another machine here can take it: the way
      // to move it off the one it was put on, which may be busy, or not the one this athlete uses.
      // One on no machine is asked which in the workout instead.
      const machine = slot.equipment?.id;
      const otherMachine =
        machine !== undefined &&
        (machinesByExercise[slot.exercise.id] ?? []).some((id) => id !== machine);
      return {
        session,
        slot,
        // A fallback is remembered for the lift the programme slot plans, which may not be the
        // one the row is doing now; an ad hoc row has no slot, so nothing to remember it for.
        programExerciseId,
        plannedExerciseId,
        exercises: exercises.filter(
          (e) => e.isActive && (e.id !== slot.exercise.id || otherMachine),
        ),
        // The list opens on the same movement, closest first: a squat's swap began at the chest
        // exercises, and then at the leg press rather than the high-bar squat.
        like: likeOf(exercises.find((e) => e.id === slot.exercise.id)),
        machines: machines.filter((m) => m.isActive),
        machinesByExercise,
      };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  if (data.session.completedAt) redirect(`/workouts/${sessionId}`);

  const { restTimerEnabled } = await getRequestProfile(user.id, user.email ?? null);

  return (
    // No board: Add fallback's page, the session's own. Returning lands back on the exercise,
    // which is where the request came from.
    <SessionPage
      title="Swap the exercise"
      meta={
        <span className="min-w-0">
          Instead of <span className="font-bold text-ink">{data.slot.exercise.name}</span> at{" "}
          {data.session.gym.name}
        </span>
      }
      back={{
        href: `/workouts/${sessionId}?exercise=${workoutExerciseId}` as Route,
        label: data.slot.exercise.name,
      }}
      rest={restTimerEnabled ? sessionId : null}
    >
      <PickExerciseForm
        action={substituteExerciseAction.bind(
          null,
          sessionId,
          workoutExerciseId,
          data.session.gym.id,
          data.programExerciseId,
        )}
        exercises={data.exercises}
        machines={data.machines.map((m) => ({
          id: m.id,
          name: m.name,
          typeSlug: m.typeSlug,
          typeCategory: m.typeCategory,
          resistanceMode: m.resistanceMode,
        }))}
        machinesByExercise={data.machinesByExercise}
        submitLabel="Use this instead"
        remember={data.plannedExerciseId !== null}
        rememberByDefault={rememberParam !== "0"}
        plannedExerciseId={data.plannedExerciseId}
        like={data.like}
        long
      />
    </SessionPage>
  );
}
