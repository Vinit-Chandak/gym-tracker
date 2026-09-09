import type { Metadata } from "next";

import { ProgramTemplatePicker } from "@/components/program-template-picker";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { PROGRAM_TEMPLATES } from "@/db/seed/data/templates";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getStarterStatus } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";

export const metadata: Metadata = { title: "Programme" };

export default async function ProgrammeSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const status = await withUser(getDb(), user.id, (tx) => getStarterStatus(tx, user.id));
  const active = status.activeProgram;

  return (
    <>
      <PageHeader title="Programme" backHref="/settings" />
      <PageContent>
        {active && (
          <Card>
            <h2 className="text-base font-medium">{active.name}</h2>
            <p className="text-sm text-ink-muted">
              {active.startDate ? formatIsoDate(active.startDate) : "—"} →{" "}
              {active.endDate ? formatIsoDate(active.endDate) : "—"}
              {active.weeks ? ` · ${active.weeks} weeks` : ""}
            </p>
            <p className="text-sm text-ink-muted">
              Starting another programme archives this one. Sessions you have already logged keep
              pointing at what they were prescribed.
            </p>
          </Card>
        )}
        <Card>
          <h2 className="text-base font-medium">
            {active ? "Start a new programme" : "Choose a programme"}
          </h2>
          <p className="text-sm text-ink-muted">
            Templates are shared, read-only starting points. Adopting one gives you your own copy.
          </p>
          <ProgramTemplatePicker
            templates={PROGRAM_TEMPLATES.map((template) => ({
              slug: template.slug,
              name: template.name,
              summary: template.summary,
              highlights: template.highlights,
              weeks: template.blueprint.weeks,
            }))}
            today={todayInTimeZone(profile.timeZone)}
            submitLabel={active ? "Replace my programme" : "Start this programme"}
          />
        </Card>
      </PageContent>
    </>
  );
}
