import type { Metadata } from "next";

import { ProgramTemplatePicker } from "@/components/program-template-picker";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { Disclosure } from "@/components/ui/disclosure";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Section } from "@/components/ui/section";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { getDb } from "@/db/client";
import { PROGRAM_TEMPLATES } from "@/db/seed/data/templates";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getProgramOverview } from "@/server/repositories/schedule";

import { CycleDay } from "./cycle-day";

export const metadata: Metadata = { title: "Programme" };

export default async function ProgrammeSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const overview = await withUser(getDb(), user.id, (tx) =>
    getProgramOverview(tx, user.id, profile.timeZone),
  );
  const templates = PROGRAM_TEMPLATES.map((template) => ({
    slug: template.slug,
    name: template.name,
    summary: template.summary,
    highlights: template.highlights,
    weeks: template.blueprint.weeks,
  }));
  const today = todayInTimeZone(profile.timeZone);

  return (
    <>
      <PageHeader title="Programme" backHref="/settings" />
      <PageContent>
        {overview ? (
          <>
            {/* What the programme is and how far through it you are. */}
            <Card>
              <div>
                <h2 className="text-lg font-medium [overflow-wrap:anywhere]">
                  {overview.program.name}
                </h2>
                <p className="mt-1.5 text-sm text-ink-muted tabular-nums">
                  {overview.program.startDate ? formatIsoDate(overview.program.startDate) : "—"} →{" "}
                  {overview.program.endDate ? formatIsoDate(overview.program.endDate) : "—"}
                </p>
              </div>
              <ProgressBar
                value={overview.progress.completed}
                max={overview.progress.total}
                label={`${overview.progress.completed} of ${overview.progress.total} sessions done`}
              />
              <p className="text-xs text-ink-muted tabular-nums">
                Cycle {overview.currentCycle} of {overview.program.weeks} ·{" "}
                {overview.progress.completed} of {overview.progress.total} sessions ·{" "}
                {overview.progress.remaining} to go
                {overview.progress.skipped > 0 && ` · ${overview.progress.skipped} skipped`}
              </p>
              <StatTileRow>
                <StatTile label="Weeks" value={overview.program.weeks} />
                <StatTile label="Days a cycle" value={overview.days.length} />
                <StatTile label="Lifting days" value={overview.liftingDays} />
                <StatTile label="Sets a cycle" value={overview.setsPerCycle} />
              </StatTileRow>
              {(overview.program.notes || overview.projectedEnd) && (
                <Disclosure summary="How it is meant to go" variant="footer">
                  <div className="space-y-3">
                    {overview.program.notes && (
                      <p className="text-sm [overflow-wrap:anywhere]">{overview.program.notes}</p>
                    )}
                    <DetailList
                      entries={[
                        [
                          "Projected end",
                          overview.projectedEnd ? formatIsoDate(overview.projectedEnd) : null,
                        ],
                      ]}
                    />
                  </div>
                </Disclosure>
              )}
            </Card>

            {/* Every session the programme asks for, in the order it asks for them. */}
            <Section
              title="The cycle"
              info="One pass through these days is a cycle, and the programme repeats it for its whole length. Open a day to see everything it prescribes."
            >
              <ul className="space-y-3">
                {overview.days.map((plan) => (
                  <li key={plan.day.id}>
                    <CycleDay plan={plan} />
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title="Change programme"
              info="You get your own copy of the template. Starting another archives the current one; logged sessions keep what they were prescribed."
            >
              <Disclosure summary="Start a new programme">
                <ProgramTemplatePicker
                  templates={templates}
                  today={today}
                  submitLabel="Replace my programme"
                />
              </Disclosure>
            </Section>
          </>
        ) : (
          <Card>
            <h2 className="text-lg font-medium">Choose a programme</h2>
            <ProgramTemplatePicker
              templates={templates}
              today={today}
              submitLabel="Start this programme"
            />
          </Card>
        )}
      </PageContent>
    </>
  );
}
