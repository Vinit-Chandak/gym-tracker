import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { addGymFallbackAction } from "@/server/actions/availability";
import { requireUser } from "@/server/auth";
import { listEquipmentForGym } from "@/server/repositories/equipment";
import { getExercise, listExercises } from "@/server/repositories/exercises";
import { getGym } from "@/server/repositories/gyms";
import { requireUuid } from "@/server/validation/params";

import { FallbackForm } from "./fallback-form";

export const metadata: Metadata = { title: "Add fallback" };

export default async function GymFallbackPage(
  props: PageProps<"/gyms/[gymId]/programme/[exerciseId]/fallback">,
) {
  const { gymId, exerciseId } = await props.params;
  requireUuid(gymId);
  requireUuid(exerciseId);
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, async (tx) => {
    const [gym, exercise] = await Promise.all([
      getGym(tx, user.id, gymId),
      getExercise(tx, user.id, exerciseId),
    ]);
    if (!gym || !exercise) return null;
    const [all, machines] = await Promise.all([
      listExercises(tx),
      listEquipmentForGym(tx, user.id, gymId),
    ]);
    return {
      gym,
      exercise,
      exercises: all.filter((e) => e.isActive && e.id !== exerciseId),
      machines: machines.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name })),
    };
  });
  if (!data) notFound();

  return (
    <>
      <PageHeader title="Add fallback" backHref={`/gyms/${data.gym.id}/programme`} />
      <PageContent>
        <Card>
          <p className="flex items-center gap-1 text-sm text-ink-muted">
            <span>
              Instead of <span className="font-medium text-ink">{data.exercise.name}</span> at{" "}
              {data.gym.name}
            </span>
            <InfoTip label="About fallbacks">
              Used whenever this gym cannot do the exercise, on every day that plans it.
            </InfoTip>
          </p>
          <FallbackForm
            action={addGymFallbackAction.bind(null, data.gym.id, data.exercise.id)}
            exercises={data.exercises}
            machines={data.machines}
          />
        </Card>
      </PageContent>
    </>
  );
}
