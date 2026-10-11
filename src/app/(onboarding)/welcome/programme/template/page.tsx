import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { StrengthColumn } from "@/components/art/geometry";
import { PROGRAM_TEMPLATES } from "@/db/seed/data/templates";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readSetupState, setupStepsOf } from "@/server/queries/setup-state";

import { OnboardingFrame } from "../../onboarding-frame";
import { TemplateStart } from "./template-start";

export const metadata: Metadata = { title: "Follow a programme" };

/** A template's first lifting day as its print's columns, a superset's two standing closer. */
function firstDay(blueprint: ProgramBlueprint): StrengthColumn[] {
  const exercises = blueprint.days.find((day) => day.includesLifting)?.exercises ?? [];
  return exercises.map((exercise, index) => ({
    sets: exercise.sets,
    done: 0,
    pair:
      exercise.supersetGroup !== undefined &&
      exercises[index + 1]?.supersetGroup === exercise.supersetGroup,
  }));
}

/**
 * Board Follow a programme, for someone who already trains: a written programme, its first
 * day's print, what it is, the facts that decide whether it suits, and the day it starts.
 */
export default async function WelcomeTemplatePage() {
  const user = await requireProfiledUser();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  const state = await withUser(
    getDb(),
    user.id,
    (tx) => readSetupState(tx, user.id, profile.trainingExperience),
    { readOnly: true },
  );
  if (state.experience === null || state.sports === null || !state.sports.includes("strength"))
    redirect("/welcome");
  if (!state.place) redirect("/welcome/gym");
  const template = PROGRAM_TEMPLATES[0];
  if (!template) redirect("/welcome/programme");

  return (
    <OnboardingFrame
      steps={setupStepsOf(state)}
      current="start"
      back="/welcome/programme"
      title="Follow a programme"
    >
      <TemplateStart
        template={{
          slug: template.slug,
          name: template.name,
          summary: template.summary,
          highlights: template.highlights,
          firstDay: firstDay(template.blueprint),
        }}
        today={todayInTimeZone(profile.timeZone)}
      />
    </OnboardingFrame>
  );
}
