import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { updateGymAction } from "@/server/actions/gyms";
import { requireUser } from "@/server/auth";
import { getGym } from "@/server/repositories/gyms";
import { requireUuid } from "@/server/validation/params";

import { GymForm } from "../../gym-form";

export const metadata: Metadata = { title: "Edit gym" };

export default async function EditGymPage(props: PageProps<"/gyms/[gymId]/edit">) {
  const { gymId } = await props.params;
  requireUuid(gymId);
  const user = await requireUser();
  const gym = await withUser(getDb(), user.id, (tx) => getGym(tx, user.id, gymId));
  if (!gym) notFound();

  return (
    <>
      <PageHeader title="Edit gym" backHref={`/gyms/${gym.id}`} />
      <PageContent>
        <Card>
          <GymForm
            action={updateGymAction.bind(null, gym.id)}
            initial={{
              name: gym.name,
              kind: gym.kind,
              address: gym.address ?? "",
              notes: gym.notes ?? "",
            }}
            submitLabel="Save changes"
          />
        </Card>
      </PageContent>
    </>
  );
}
