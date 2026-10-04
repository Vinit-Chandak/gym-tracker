import type { Metadata } from "next";

import type { StrengthColumn } from "@/components/art/geometry";
import { JustTrackButton, ProgrammeOptions } from "@/components/coaching/programme-options";
import { SavedProgrammeWork } from "@/components/coaching/saved-work";
import { ProgramTemplatePicker } from "@/components/program-template-picker";
import { PROGRAM_TEMPLATES } from "@/db/seed/data/templates";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { OnboardingFrame } from "../onboarding-frame";
import { FinishSetupLink } from "../skip-link";

export const metadata: Metadata = { title: "Choose a programme" };

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
 * The last step (board Plan): the suggested programme, chosen, with its start date; the two
 * ways to make one instead; Start training, or just track workouts, at the foot.
 */
export default async function WelcomeProgrammePage() {
  const user = await requireProfiledUser();
  // The cached read: it writes only for a missing profile, where this used to lock every visit.
  const profile = await getRequestProfile(user.id, user.email, user.displayName);

  return (
    <OnboardingFrame step="programme" back="/welcome/equipment" title="Choose a programme">
      <SavedProgrammeWork onboarding />
      <div className="mt-3.5">
        <ProgramTemplatePicker
          templates={PROGRAM_TEMPLATES.map((template) => ({
            slug: template.slug,
            name: template.name,
            summary: template.summary,
            highlights: template.highlights,
            weeks: template.blueprint.weeks,
            firstDay: firstDay(template.blueprint),
          }))}
          today={todayInTimeZone(profile.timeZone)}
          submitLabel="Start training"
          finishOnboarding
          pinned
          extra={<JustTrackButton />}
        />
      </div>
      <div className="mt-1.5">
        <ProgrammeOptions onboarding />
      </div>
      {/* Ends setup with no programme and nothing else decided; Just track my workouts, at the
          foot, also says the athlete means to log as they go. */}
      <div className="mt-2">
        <FinishSetupLink label="I'll train without a programme" />
      </div>
    </OnboardingFrame>
  );
}
