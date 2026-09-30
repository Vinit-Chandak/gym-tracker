import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { listEquipmentTypes } from "@/server/repositories/equipment";
import { listGyms } from "@/server/repositories/gyms";

import { SkipLink } from "../skip-link";
import { StepHeading, Steps } from "../steps";
import { EquipmentStepForm } from "./equipment-step-form";

export const metadata: Metadata = { title: "Machines at your gym" };

export default async function WelcomeEquipmentPage(props: PageProps<"/welcome/equipment">) {
  const user = await requireProfiledUser();
  const { gym: gymParam } = await props.searchParams;
  const { gyms, types } = await withUser(
    getDb(),
    user.id,
    async (tx) => ({
      gyms: await listGyms(tx, user.id),
      types: await listEquipmentTypes(tx),
    }),
    { readOnly: true },
  );

  // Landing here without a gym means the previous step was skipped or the link was stale.
  const gym =
    gyms.find((candidate) => candidate.id === gymParam) ??
    gyms.find((candidate) => candidate.isDefault) ??
    gyms[0];
  if (!gym) redirect("/welcome/gym");

  return (
    <PageContent className="pt-6">
      <Steps current="equipment" />
      <StepHeading
        title={`What does ${gym.name} have?`}
        infoLabel="About machines"
        info="Barbells, dumbbells and bodyweight are assumed everywhere, so only machines and cable stations need ticking. This can be changed any time."
      >
        Tick the machines it has.
      </StepHeading>
      <EquipmentStepForm gymId={gym.id} types={types} />
      <SkipLink href="/welcome/programme" />
    </PageContent>
  );
}
