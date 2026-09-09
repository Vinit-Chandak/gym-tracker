import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { createEquipmentAction } from "@/server/actions/equipment";
import { requireUser } from "@/server/auth";
import { listEquipmentTypes } from "@/server/repositories/equipment";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getGym } from "@/server/repositories/gyms";
import { parseWorkoutReturn, requireUuid, workoutReturnPath } from "@/server/validation/params";

import { EquipmentForm } from "../../../equipment-form";

export const metadata: Metadata = { title: "Add machine" };

export default async function NewEquipmentPage(props: PageProps<"/gyms/[gymId]/equipment/new">) {
  const { gymId } = await props.params;
  requireUuid(gymId);
  const search = await props.searchParams;
  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  // A workout sent the user here to register a machine it needs; both ids are checked.
  const returnTo = parseWorkoutReturn(single(search.session), single(search.exercise));
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const [gym, types] = await Promise.all([getGym(tx, user.id, gymId), listEquipmentTypes(tx)]);
    if (!gym) return null;
    const profile = requestProfile;
    return {
      gym,
      types,
      preferredUnit: profile.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const),
    };
  });
  if (!data) notFound();

  return (
    <>
      <PageHeader
        title="Add machine"
        context={data.gym.name}
        backHref={returnTo ? workoutReturnPath(returnTo) : `/gyms/${data.gym.id}`}
        backLabel={returnTo ? "Back to the workout" : "Back to the gym"}
      />
      <PageContent>
        {returnTo && (
          <p className="text-sm text-ink-muted">
            Registering this machine returns you to the exercise that needs it.
          </p>
        )}
        <EquipmentForm
          action={createEquipmentAction.bind(null, data.gym.id, returnTo)}
          types={data.types}
          preferredUnit={data.preferredUnit}
          submitLabel="Add machine"
        />
      </PageContent>
    </>
  );
}
