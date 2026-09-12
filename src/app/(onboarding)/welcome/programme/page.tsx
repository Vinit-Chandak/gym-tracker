import type { Metadata } from "next";
import { ProgrammeOptions } from "@/components/coaching/programme-options";
import { SavedProgrammeWork } from "@/components/coaching/saved-work";

import { ProgramTemplatePicker } from "@/components/program-template-picker";
import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { PROGRAM_TEMPLATES } from "@/db/seed/data/templates";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireProfiledUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";

import { SkipLink } from "../skip-link";
import { Steps } from "../steps";

export const metadata: Metadata = { title: "Choose a programme" };

export default async function WelcomeProgrammePage() {
  const user = await requireProfiledUser();
  const profile = await withUser(getDb(), user.id, (tx) => ensureProfile(tx, user));

  return (
    <PageContent>
      <Steps current="programme" />
      <SavedProgrammeWork onboarding />
      <ProgrammeOptions onboarding />
      <Card>
        <h2 className="text-xl font-medium">Or start with a suggested template</h2>
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
      <SkipLink label="I'll train without a programme" />
    </PageContent>
  );
}
