import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InfoTip } from "@/components/ui/info-tip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { listEquipmentTypes } from "@/server/repositories/equipment";
import { listGyms } from "@/server/repositories/gyms";

import { OnboardingFrame } from "../onboarding-frame";
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
    <OnboardingFrame
      step="equipment"
      back="/welcome/gym"
      title={`What does ${gym.name} have?`}
      sub={
        <span className="flex items-center gap-0.5">
          Tick the machines it has.
          <InfoTip label="About machines">
            {gym.kind === "gym"
              ? "A gym's basics count as here until you say otherwise, and each machine is confirmed the first time you use it. This can be changed any time."
              : "Nothing is assumed here: tick what this place has, and anything else is asked about when an exercise needs it. This can be changed any time."}
          </InfoTip>
        </span>
      }
    >
      <EquipmentStepForm gymId={gym.id} types={types} />
    </OnboardingFrame>
  );
}
