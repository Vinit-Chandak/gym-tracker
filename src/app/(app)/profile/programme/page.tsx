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
import { Disclosure } from "@/components/ui/disclosure";
import { HeroCard } from "@/components/ui/hero-card";
import { ClipboardList } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/info-tip";
import { List } from "@/components/ui/link-row";
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
import { getProgramOverview, type ProgramOverview } from "@/server/repositories/schedule";

import { loadProgrammeChanges, ProgrammeChanges } from "./changes";
import { CycleDay } from "./cycle-day";
import { ProgrammeTabs } from "./programme-tabs";
import { PROGRAMME_VIEWS, type ProgrammeView } from "./programme-views";

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
              <p className="font-semibold [overflow-wrap:anywhere]">
                {programme.name}, version {programme.version}
              </p>
              <ProgrammeTools id={programme.id} active={false} />
            </li>
          ))}
        </ul>
      </Disclosure>
    </Section>
  );
}

/**
 * The programme being trained, as the screen's one filled card: where in it you are, its
 * name in the display face, how far through it you are and the shape of one cycle. What it
 * is meant to do sits behind the tip beside the name rather than across the card.
 */
function ProgrammeHero({ overview }: { overview: ProgramOverview }) {
  const { program, progress } = overview;
  const note = [
    program.notes,
    overview.projectedEnd ? `Projected end: ${formatIsoDate(overview.projectedEnd)}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <HeroCard tone="lift">
      <p className="flex min-h-7 items-center gap-2 text-sm font-semibold text-ink-muted tabular-nums">
        <ClipboardList aria-hidden />
        Cycle {overview.currentCycle} of {program.weeks}
      </p>
      <div>
        <h2 className="font-display text-display-m [overflow-wrap:anywhere]">{program.name}</h2>
        {/* The tip's tap target is taller than the line it sits on, so it gives the height
            back: a programme with notes is spaced exactly like one without. */}
        <p className="mt-2 flex items-center gap-1 text-callout leading-snug text-ink-muted tabular-nums">
          <span className="min-w-0">
            {program.startDate ? formatIsoDate(program.startDate) : "Not started"} to{" "}
            {program.endDate ? formatIsoDate(program.endDate) : "no end date"}
          </span>
          {note && (
            <InfoTip label="About this programme" className="-my-2">
              {note}
            </InfoTip>
          )}
        </p>
      </div>
      <div className="space-y-2">
        <ProgressBar
          value={progress.completed}
          max={progress.total}
          label={`${progress.completed} of ${progress.total} programme days done`}
        />
        <p className="text-sm font-semibold text-ink-muted tabular-nums">
          {progress.completed} of {progress.total} days done, {progress.remaining} to go
          {progress.skipped > 0 && `, ${progress.skipped} skipped`}
        </p>
      </div>
      <StatTileRow className="border-t border-line pt-4">
        <StatTile label="Weeks" value={program.weeks} />
        <StatTile label="Days a cycle" value={overview.days.length} />
        <StatTile label="Lifting days" value={overview.liftingDays} />
        <StatTile label="Sets a cycle" value={overview.setsPerCycle} />
      </StatTileRow>
    </HeroCard>
  );
}

/**
 * The programme, under two headings.
 *
 * Cycle is the whole programme and the only place it is printed in full. Changes is what the
 * coach has altered, proposed or answered, as differences rather than as a second copy of the
 * programme. The hero above them belongs to neither: it is what programme this is and how far
 * through it you are, which is true on both tabs, and so are the tools under them.
 */
export default async function ProgrammeSettingsPage(props: PageProps<"/profile/programme">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requested = Array.isArray(params.view) ? params.view[0] : params.view;
  const view: ProgrammeView = PROGRAMME_VIEWS.find((value) => value === requested) ?? "cycle";
  const profile = await getRequestProfile(user.id, user.email);
  const { overview, changes, archived } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [overview, changes, archived] = await Promise.all([
        getProgramOverview(tx, user.id, profile.timeZone),
        loadProgrammeChanges(tx, user.id, profile.timeZone),
        tx
          .select({ id: programs.id, name: programs.name, version: programs.version })
          .from(programs)
          .where(and(eq(programs.userId, user.id), eq(programs.status, "archived")))
          .orderBy(desc(programs.updatedAt))
          .limit(20),
      ]);
      return { overview, changes, archived };
    },
    { readOnly: true },
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
      <PageHeader title="Programme" backHref="/profile" />
      <PageContent>
        <SavedProgrammeWork />
        {overview ? (
          <>
            <ProgrammeHero overview={overview} />

            <ProgrammeTabs view={view} waiting={changes.waiting} />
            <div
              id="programme-panel"
              role="tabpanel"
              aria-labelledby={`programme-${view}-tab`}
              className="min-w-0 space-y-[var(--section-gap)]"
            >
              {view === "changes" ? (
                <ProgrammeChanges data={changes} />
              ) : (
                // Every session the programme asks for, in the order it asks for them.
                <Section
                  title="The cycle"
                  info="One pass through these days is a cycle, and the programme repeats it for its whole length. Open a day to see everything it prescribes."
                >
                  <List>
                    {overview.days.map((plan) => (
                      <li key={plan.day.id}>
                        <CycleDay plan={plan} />
                      </li>
                    ))}
                  </List>
                </Section>
              )}

              <Section title="Manage">
                <ProgrammeTools id={overview.program.id} />
              </Section>

              {view === "cycle" && (
                <>
                  {/* Folded away, because starting over is the rarest thing anyone comes here
                      to do — and open, it is three choices that each need a sentence. */}
                  <Section
                    title="Change programme"
                    info="You get your own copy of the template. Starting another archives the current one; logged sessions keep what they were prescribed."
                  >
                    <Disclosure summary="Start a new programme">
                      <div className="space-y-4">
                        <ProgrammeOptions nested />
                        <div className="space-y-2 border-t border-line pt-4">
                          <h3 className="font-semibold">Or use the suggested template</h3>
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
              )}
            </div>
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
