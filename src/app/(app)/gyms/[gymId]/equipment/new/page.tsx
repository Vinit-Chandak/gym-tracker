import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { createEquipmentAction } from "@/server/actions/equipment";
import { requireUser } from "@/server/auth";
import { listEquipmentTypes } from "@/server/repositories/equipment";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getGym } from "@/server/repositories/gyms";
import { requireUuid } from "@/server/validation/params";

import { EquipmentForm } from "../../../equipment-form";

export const metadata: Metadata = { title: "Add machine" };

export default async function NewEquipmentPage(props: PageProps<"/gyms/[gymId]/equipment/new">) {
  const { gymId } = await props.params;
  requireUuid(gymId);
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const gym = await getGym(tx, user.id, gymId);
    if (!gym) return null;
    const profile = requestProfile;
    return {
      gym,
      types: await listEquipmentTypes(tx),
      preferredUnit: profile.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const),
    };
  });
  if (!data) notFound();

  return (
    <>
      <PageHeader title={`Add machine · ${data.gym.name}`} backHref={`/gyms/${data.gym.id}`} />
      <PageContent>
        <Card>
          <EquipmentForm
            action={createEquipmentAction.bind(null, data.gym.id)}
            types={data.types}
            preferredUnit={data.preferredUnit}
            submitLabel="Add machine"
          />
        </Card>
      </PageContent>
    </>
  );
}
