import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronRight, ClipboardList } from "@/components/ui/icons";
import { PRESSABLE_ROW_CLASS, ROW_CLASS, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { SportChip } from "@/components/ui/sport-chip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
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
              icon={ClipboardList}
              title="No templates yet"
              description="Write a session once and schedule it whenever you want it."
            />
          ) : (
            <List>
              {templates.map((template) => (
                <li key={template.id}>
                  {/* The row is the way in: a template's page is its editor. */}
                  <Link
                    href={`/training/templates/${template.id}/edit`}
                    prefetch="intent"
                    className={PRESSABLE_ROW_CLASS}
                  >
                    <SportChip sport={template.sport} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold [overflow-wrap:anywhere]">
                        {template.name}
                      </span>
                      <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                        {ACTIVITY_SPORT_LABELS[template.sport]},{" "}
                        {describePrescription(template.prescription)}, version {template.version}
                      </span>
                    </span>
                    <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </List>
          )}
        </Section>

        {routines.length > 0 && (
          <Section title="Strength routines">
            <List>
              {routines.map((routine) => (
                <li key={routine.id} className={ROW_CLASS}>
                  <SportChip sport="strength" size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">
                      {routine.name}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-muted tabular-nums">
                      {routine.day.exercises.length}{" "}
                      {routine.day.exercises.length === 1 ? "exercise" : "exercises"}
                    </span>
                  </span>
                </li>
              ))}
            </List>
          </Section>
        )}
      </PageContent>
    </>
  );
}
