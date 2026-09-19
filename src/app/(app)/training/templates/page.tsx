import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
import { multisportRollout } from "@/lib/multisport-rollout";
import { requireUser } from "@/server/auth";
import { listTemplates } from "@/server/repositories/activity-templates";
import { listSavedRoutines } from "@/server/repositories/manual-training";

export const metadata: Metadata = { title: "Templates" };

/**
 * Reusable sessions, in one picker (PLAN-01).
 *
 * Endurance templates and the strength routines this account already had, side by side. The
 * routines keep their own storage and their own behaviour: they are adapted into the picker,
 * not converted into something they are not (§5.1).
 */
export default async function TemplatesPage() {
  if (!multisportRollout().sharedNavigation) notFound();
  const user = await requireUser();
  const { templates, routines } = await withUser(
    getDb(),
    user.id,
    async (tx) => ({
      templates: await listTemplates(tx, user.id),
      routines: await listSavedRoutines(tx, user.id),
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

        <Section title="Endurance">
          {templates.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No templates yet"
              description="Write a session once and schedule it whenever you want it."
            />
          ) : (
            templates.map((template) => (
              <Card key={template.id}>
                <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                  {ACTIVITY_SPORT_LABELS[template.sport]}
                </p>
                <h2 className="mt-1 text-base font-medium [overflow-wrap:anywhere]">
                  {template.name}
                </h2>
                <p className="text-sm text-ink-muted">
                  {describePrescription(template.prescription)} · version {template.version}
                </p>
                <Link
                  href={`/training/templates/${template.id}/edit`}
                  className="text-sm text-accent"
                >
                  Edit
                </Link>
              </Card>
            ))
          )}
        </Section>

        {routines.length > 0 && (
          <Section title="Strength routines">
            {routines.map((routine) => (
              <Card key={routine.id}>
                <h2 className="text-base font-medium [overflow-wrap:anywhere]">{routine.name}</h2>
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
