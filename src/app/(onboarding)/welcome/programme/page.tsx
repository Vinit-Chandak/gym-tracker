import type { Metadata } from "next";
import { ProgrammeOptions } from "@/components/coaching/programme-options";
import { SavedProgrammeWork } from "@/components/coaching/saved-work";

import { ProgramTemplatePicker } from "@/components/program-template-picker";
import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { PROGRAM_TEMPLATES } from "@/db/seed/data/templates";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { FinishSetupLink } from "../skip-link";
import { Steps } from "../steps";

export const metadata: Metadata = { title: "Choose a programme" };

export default async function WelcomeProgrammePage() {
  const user = await requireProfiledUser();
  // The cached read: it writes only for a missing profile, where this used to lock every visit.
  const profile = await getRequestProfile(user.id, user.email, user.displayName);

  return (
    <PageContent>
      <Steps current="programme" />
      <SavedProgrammeWork onboarding />
      <ProgrammeOptions onboarding />
      <Card>
        <h2 className="text-lg font-medium">Or start with a suggested template</h2>
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
      </Card>
      <FinishSetupLink label="I'll train without a programme" />
    </PageContent>
  );
}
