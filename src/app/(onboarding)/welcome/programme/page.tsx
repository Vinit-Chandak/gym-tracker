import type { Metadata } from "next";
import { ProgrammeOptions } from "@/components/coaching/programme-options";
import { SavedProgrammeWork } from "@/components/coaching/saved-work";

import { ProgramTemplatePicker } from "@/components/program-template-picker";
import { PageContent } from "@/components/shell/page-content";
import { Disclosure } from "@/components/ui/disclosure";
import { PROGRAM_TEMPLATES } from "@/db/seed/data/templates";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { FinishSetupLink } from "../skip-link";
import { StepHeader, Steps } from "../steps";

export const metadata: Metadata = { title: "Choose a programme" };

/**
 * The last step: the ways to get a programme, and the ways to go without one. The template
 * picker, whose own Start button would be a second highlighter beside "Create with the
 * coach", folds away behind its heading until the athlete asks for it.
 */
export default async function WelcomeProgrammePage() {
  const user = await requireProfiledUser();
  // The cached read: it writes only for a missing profile, where this used to lock every visit.
  const profile = await getRequestProfile(user.id, user.email, user.displayName);

  return (
    <>
      <StepHeader current="programme" />
      <PageContent>
        <Steps current="programme" />
        <h2 className="text-2xl">Choose a programme</h2>
        <SavedProgrammeWork onboarding />
        <ProgrammeOptions onboarding />
        <Disclosure summary="Or start with a suggested template">
          <ProgramTemplatePicker
            templates={PROGRAM_TEMPLATES.map((template) => ({
              slug: template.slug,
              name: template.name,
              summary: template.summary,
              highlights: template.highlights,
              weeks: template.blueprint.weeks,
            }))}
            today={todayInTimeZone(profile.timeZone)}
            submitLabel="Start training"
            finishOnboarding
          />
        </Disclosure>
        <FinishSetupLink label="I'll train without a programme" />
      </PageContent>
    </>
  );
}
