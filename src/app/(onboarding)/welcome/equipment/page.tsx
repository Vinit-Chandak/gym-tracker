import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InfoTip } from "@/components/ui/info-tip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { drawingUrls } from "@/server/queries/equipment-art";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import type { MachinesStep } from "@/lib/machines-step";
import { machinesStep } from "@/server/repositories/starter-equipment";

import { OnboardingFrame } from "../onboarding-frame";
import { EquipmentStepForm } from "./equipment-step-form";

export const metadata: Metadata = { title: "Machines at your gym" };

/** The line under the question: what to do here, for this place and this answer. */
function instruction(step: MachinesStep): string {
  if (step.gym.kind === "outdoor") return "Tick what’s there.";
  if (step.gym.kind === "home") return "Tick what you have.";
  return step.suggestions.length > 0
    ? "Tick what you recognise."
    : "Tick what it has beyond the basics.";
}

/** True for each kind of place (plan: onboarding flow): only a gym has basics. */
function about(step: MachinesStep): string {
  return step.gym.kind === "gym"
    ? "A gym’s basics count as here until you say otherwise. Anything else is asked about the first time an exercise needs it, and everything can be changed on the gym’s page."
    : "Nothing is taken as here. Anything you don’t tick is asked about the first time an exercise needs it, and everything can be changed on this place’s page.";
}

export default async function WelcomeEquipmentPage(props: PageProps<"/welcome/equipment">) {
  const user = await requireProfiledUser();
  const { gym: gymParam } = await props.searchParams;
  const profile = await getRequestProfile(user.id, user.email);
  const step = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const gyms = await listGyms(tx, user.id);
      // Landing here without a gym means the previous step was skipped or the link was stale.
      const gym =
        gyms.find((candidate) => candidate.id === gymParam) ??
        gyms.find((candidate) => candidate.isDefault) ??
        gyms[0];
      return gym ? machinesStep(tx, user.id, gym.id, profile.trainingExperience) : null;
    },
    { readOnly: true },
  );
  if (!step) redirect("/welcome/gym");

  const slugs = [...step.basics, ...step.suggestions, ...step.catalogue].flatMap((item) => [
    item.slug,
    ...(item.variants ?? []).map((variant) => variant.slug),
  ]);

  return (
    <OnboardingFrame
      step="equipment"
      back="/welcome/gym"
      title={`What does ${step.gym.name} have?`}
      sub={
        <span className="flex items-center gap-0.5">
          {instruction(step)}
          <InfoTip label="About equipment here">{about(step)}</InfoTip>
        </span>
      }
    >
      <EquipmentStepForm step={step} art={drawingUrls(slugs)} />
    </OnboardingFrame>
  );
}
