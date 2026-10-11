import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { requireUser } from "@/server/auth";
import { listTemplates } from "@/server/repositories/activity-templates";
import { listSavedRoutines } from "@/server/repositories/manual-training";
import { enabledSportsFor, unitsBySport } from "@/server/repositories/sport-preferences";
import { joinFacts } from "@/lib/facts";

import { templateSessions } from "./template-sessions";

export const metadata: Metadata = { title: "Templates" };

/**
 * Reusable sessions, in one picker (PLAN-01).
 *
 * Endurance templates and the strength routines this account already had, side by side. The
 * routines keep their own storage and their own behaviour: they are adapted into the picker,
 * not converted into something they are not (§5.1).
 */
export default async function TemplatesPage() {
  const user = await requireUser();
  const { templates, routines, units, enabled } = await withUser(
    getDb(),
    user.id,
    async (tx) => ({
      templates: await listTemplates(tx, user.id),
      routines: await listSavedRoutines(tx, user.id),
      units: await unitsBySport(tx, user.id),
      enabled: await enabledSportsFor(tx, user.id),
    }),
    { readOnly: true },
  );

  return (
    <>
      <PageHeader title="Templates" backHref="/training" />
      <PageContent>
        <LinkButton href="/training/templates/new" className="w-full">
          New template
        </LinkButton>

        {/* A heading names a list; over nothing, the empty state says what a template is. */}
        {templates.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No templates yet"
            description={`Write ${templateSessions(enabled)} once and schedule it whenever you want it.`}
          />
        ) : (
          <Section title="Endurance">
            {templates.map((template) => (
              <Card key={template.id}>
                <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                  {ACTIVITY_SPORT_LABELS[template.sport]}
                </p>
                <h2 className="mt-1 text-base font-medium [overflow-wrap:break-word]">
                  {template.name}
                </h2>
                <p className="text-sm text-ink-muted">
                  {joinFacts([
                    describePrescription(template.prescription, units[template.sport]),
                    `version\u00a0${template.version}`,
                  ])}
                </p>
                <Link
                  href={`/training/templates/${template.id}/edit`}
                  className="inline-flex min-h-[var(--ov-target)] items-center text-sm text-accent"
                >
                  Edit
                </Link>
              </Card>
            ))}
          </Section>
        )}

        {routines.length > 0 && (
          <Section title="Strength routines">
            {routines.map((routine) => (
              <Card key={routine.id}>
                <h2 className="text-base font-medium [overflow-wrap:break-word]">{routine.name}</h2>
                <p className="text-sm text-ink-muted">
                  {routine.day.exercises.length} exercise
                  {routine.day.exercises.length === 1 ? "" : "s"}
                </p>
              </Card>
            ))}
          </Section>
        )}
      </PageContent>
    </>
  );
}
