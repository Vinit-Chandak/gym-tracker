import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listEquipmentTypes } from "@/server/repositories/equipment";
import { listGyms } from "@/server/repositories/gyms";

import { SkipLink } from "../skip-link";
import { Steps } from "../steps";
import { EquipmentStepForm } from "./equipment-step-form";

export const metadata: Metadata = { title: "Machines at your gym" };

export default async function WelcomeEquipmentPage(props: PageProps<"/welcome/equipment">) {
  const user = await requireUser();
  const { gym: gymParam } = await props.searchParams;
  const { gyms, types } = await withUser(getDb(), user.id, async (tx) => ({
    gyms: await listGyms(tx, user.id),
    types: await listEquipmentTypes(tx),
  }));

  // Landing here without a gym means the previous step was skipped or the link was stale.
  const gym =
    gyms.find((candidate) => candidate.id === gymParam) ??
    gyms.find((candidate) => candidate.isDefault) ??
    gyms[0];
  if (!gym) redirect("/welcome/gym");

  return (
    <PageContent>
      <Steps current="equipment" />
      <Card>
        <div>
          <h1 className="text-xl font-medium">What does {gym.name} have?</h1>
          <p className="text-sm text-ink-muted">
            Tick what you can see. Barbells, dumbbells and bodyweight work are assumed at every gym,
            so only machines need ticking — and you can change this any time.
          </p>
        </div>
        <EquipmentStepForm gymId={gym.id} types={types} />
      </Card>
      <SkipLink />
    </PageContent>
  );
}
