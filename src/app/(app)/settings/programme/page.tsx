import type { Metadata } from "next";
import { ProgrammeOptions } from "@/components/coaching/programme-options";
import { SavedProgrammeWork } from "@/components/coaching/saved-work";
import { ProgrammeTools } from "@/components/coaching/programme-tools";
import { and, desc, eq } from "drizzle-orm";
import { programs } from "@/db/schema";

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

/**
 * Programmes that have been retired, under everything they were retired in favour of.
 *
 * They used to open the screen, above the programme actually being trained, which put the
 * past before the present for the one account in ten that has a past at all. Folded, and
 * last.
 */
function Archived({
  programmes,
}: {
  programmes: readonly { id: string; name: string; version: number }[];
}) {
  return (
    <Section title="Archived programmes">
      <Disclosure summary="Programmes you have retired" meta={`${programmes.length}`}>
        <ul className="ruled-list">
          {programmes.map((programme) => (
            <li key={programme.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <p className="font-medium [overflow-wrap:anywhere]">
                {programme.name} · version {programme.version}
              </p>
              <ProgrammeTools id={programme.id} active={false} />
            </li>
          ))}
        </ul>
      </Disclosure>
    </Section>
  );
}

export default async function ProgrammeSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const { overview, proposals, archived } = await withUser(getDb(), user.id, async (tx) => {
    const [overview, proposals, archived] = await Promise.all([
      getProgramOverview(tx, user.id, profile.timeZone),
      listOpenProposals(tx, user.id),
      tx
        .select({ id: programs.id, name: programs.name, version: programs.version })
        .from(programs)
        .where(and(eq(programs.userId, user.id), eq(programs.status, "archived")))
        .orderBy(desc(programs.updatedAt))
        .limit(20),
    ]);
    return { overview, proposals, archived };
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
        <SavedProgrammeWork />
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
              <ProgrammeTools id={overview.program.id} />
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

            {/* Folded away, because starting over is the rarest thing anyone comes here to
                do — and open, it is three choices that each need a sentence of their own. */}
            <Section
              title="Change programme"
              info="You get your own copy of the template. Starting another archives the current one; logged sessions keep what they were prescribed."
            >
              <Disclosure summary="Start a new programme">
                <div className="space-y-4">
                  <ProgrammeOptions nested />
                  <div className="space-y-2 border-t border-line pt-4">
                    <h3 className="font-medium">Or use the suggested template</h3>
                    <ProgramTemplatePicker
                      templates={templates}
                      today={today}
                      submitLabel="Replace my programme"
                    />
                  </div>
                </div>
              </Disclosure>
            </Section>

            {archived.length > 0 && <Archived programmes={archived} />}
          </>
        ) : (
          <>
            <Section title="Start a programme">
              <ProgrammeOptions />
            </Section>
            <Section title="Or use the suggested template">
              <Card>
                <ProgramTemplatePicker
                  templates={templates}
                  today={today}
                  submitLabel="Start this programme"
                />
              </Card>
            </Section>
            {archived.length > 0 && <Archived programmes={archived} />}
          </>
        )}
      </PageContent>
    </>
  );
}
