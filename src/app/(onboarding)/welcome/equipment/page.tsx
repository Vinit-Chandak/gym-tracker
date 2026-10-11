import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { equipmentQuestion } from "@/lib/setup-place";
import { requireProfiledUser } from "@/server/auth";
import { drawingUrls } from "@/server/queries/equipment-art";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readSetupState, setupStepsOf } from "@/server/queries/setup-state";
import { machinesStep } from "@/server/repositories/starter-equipment";

import { OnboardingFrame } from "../onboarding-frame";
import { EquipmentStepForm } from "./equipment-step-form";

export const metadata: Metadata = { title: "Equipment" };

/** The line under the question: what is taken as there, and what to do here. */
function sub(kind: "gym" | "home" | "outdoor"): string {
  if (kind === "gym")
    return "The usual gym kit is taken as there. Add what’s special now, or when a workout needs it.";
  if (kind === "home")
    return "Tick what you own. Bodyweight exercises need nothing, so leave it blank if that’s you.";
  return "Tick what’s there. Bodyweight exercises need nothing, so leave it blank if that’s you.";
}

/**
 * Setup's optional equipment step (boards Anything unusual, What you have), about the place the
 * athlete gave on the step before. A beginner at a gym is never sent here: the basics are taken
 * as there, and a workout asks about anything else with a picture (owner decision, 10 October
 * 2026). Arriving here without a place means the step before was not answered.
 */
export default async function WelcomeEquipmentPage() {
  const user = await requireProfiledUser();
  const profile = await getRequestProfile(user.id, user.email);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const state = await readSetupState(tx, user.id, profile.trainingExperience);
      if (!state.place) return null;
      const step = await machinesStep(tx, user.id, state.place.id, profile.trainingExperience);
      return step ? { state, step } : null;
    },
    { readOnly: true },
  );
  if (!data) redirect("/welcome/gym");
  const { state, step } = data;
  if (step.gym.kind === "gym" && state.experience !== "experienced") redirect("/welcome/programme");

  const slugs = [...step.basics, ...step.suggestions, ...step.catalogue].flatMap((item) => [
    item.slug,
    ...(item.variants ?? []).map((variant) => variant.slug),
  ]);

  return (
    <OnboardingFrame
      steps={setupStepsOf(state)}
      current={step.gym.kind === "gym" ? "unusual" : "kit"}
      back="/welcome/gym"
      title={equipmentQuestion(step.gym)}
      sub={sub(step.gym.kind)}
    >
      <EquipmentStepForm step={step} art={drawingUrls(slugs)} />
    </OnboardingFrame>
  );
}
