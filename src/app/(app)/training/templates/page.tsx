import type { Metadata } from "next";

import { SPORT_ICONS } from "@/components/activities/sport-icons";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Dumbbell, Repeat } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
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
        <Section title="Endurance">
          {templates.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No templates yet"
              description="Write a session once and schedule it whenever you want it."
              action={<LinkButton href="/training/templates/new">New template</LinkButton>}
            />
          ) : (
            <>
              <ul className="box-rows">
                {templates.map((template) => {
                  const Icon = SPORT_ICONS[template.sport];
                  return (
                    <li
                      key={template.id}
                      className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-3"
                    >
                      <div className="flex min-w-0 flex-[1_1_10rem] items-start gap-3">
                        <Icon scale="row" className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <h2 className="font-medium [overflow-wrap:anywhere]">{template.name}</h2>
                          <p className="mt-0.5 font-data text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                            {ACTIVITY_SPORT_LABELS[template.sport]} ·{" "}
                            {describePrescription(template.prescription)} · version{" "}
                            {template.version}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/training/templates/${template.id}/edit`}
                        transitionTypes={["nav-forward"]}
                        className="ml-auto inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-medium text-pen"
                      >
                        Edit
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <LinkButton href="/training/templates/new" size="lg" className="w-full">
                New template
              </LinkButton>
            </>
          )}
        </Section>

        {/* Read-only here: routines are started from Today. */}
        {routines.length > 0 && (
          <Section title="Strength routines">
            <ul className="box-rows">
              {routines.map((routine) => (
                <li key={routine.id} className="flex min-h-14 items-center gap-3 py-3">
                  <Dumbbell scale="row" className="shrink-0 text-ink-muted" aria-hidden />
                  <h2 className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                    {routine.name}
                  </h2>
                  <p className="shrink-0 font-data text-sm text-ink-muted tabular-nums">
                    {routine.day.exercises.length} exercise
                    {routine.day.exercises.length === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </PageContent>
    </>
  );
}
