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
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listOpenProposals } from "@/server/repositories/program-revisions";
import { getProgramOverview } from "@/server/repositories/schedule";

import { CycleDay } from "./cycle-day";
import { Proposals } from "./proposals";

export const metadata: Metadata = { title: "Programme" };

export default async function ProgrammeSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const { overview, proposals } = await withUser(getDb(), user.id, async (tx) => {
    const [overview, proposals] = await Promise.all([
      getProgramOverview(tx, user.id, profile.timeZone),
      listOpenProposals(tx, user.id),
    ]);
    return { overview, proposals };
  });
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
                label={`${overview.progress.completed} of ${overview.progress.total} programme days done`}
              />
              <p className="text-xs text-ink-muted tabular-nums">
                Cycle {overview.currentCycle} of {overview.program.weeks} ·{" "}
                {overview.progress.completed} of {overview.progress.total} programme days ·{" "}
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

            {/* A change waiting on you comes before the programme it would change. */}
            {proposals.length > 0 && (
              <Section
                title="Suggested changes"
                info="The coach proposes a change when a session-by-session fix keeps repeating. Applying one writes the next version of the programme, keeping your position and everything you have logged."
              >
                <Proposals
                  proposals={proposals.map((proposal) => ({
                    id: proposal.id,
                    summary: proposal.summary,
                    rationale: proposal.rationale,
                    lines: proposal.lines,
                    createdAt: formatDateTime(proposal.createdAt, profile.timeZone),
                    fromCoach: proposal.source === "ai",
                  }))}
                />
              </Section>
            )}

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
