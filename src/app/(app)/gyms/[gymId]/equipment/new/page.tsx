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
import { getGym } from "@/server/repositories/gyms";

import { EquipmentForm } from "../../../equipment-form";

export const metadata: Metadata = { title: "Add machine" };

export default async function NewEquipmentPage(props: PageProps<"/gyms/[gymId]/equipment/new">) {
  const { gymId } = await props.params;
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, async (tx) => {
    const gym = await getGym(tx, user.id, gymId);
    if (!gym) return null;
    return { gym, types: await listEquipmentTypes(tx) };
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
            submitLabel="Add machine"
          />
        </Card>
      </PageContent>
    </>
  );
}
