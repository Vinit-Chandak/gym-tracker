import type { Metadata } from "next";
import { ProgrammeOptions } from "@/components/coaching/programme-options";
import { SavedProgrammeWork } from "@/components/coaching/saved-work";
import { ProgrammeTools } from "@/components/coaching/programme-tools";
import { and, desc, eq } from "drizzle-orm";
import { programs } from "@/db/schema";

import { ProgramTemplatePicker } from "@/components/program-template-picker";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { Disclosure } from "@/components/ui/disclosure";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Section } from "@/components/ui/section";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { getDb } from "@/db/client";
import { PROGRAM_TEMPLATES } from "@/db/seed/data/templates";
import { withUser } from "@/db/with-user";
import { cycleRepeatLabel } from "@/domain/cycle-repeat";
import { todayInTimeZone } from "@/domain/program-calendar";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getProgramOverview } from "@/server/repositories/schedule";
import { enabledSportsFor, unitsFor } from "@/server/repositories/sport-preferences";

import { loadProgrammeChanges, ProgrammeChanges } from "./changes";
import { CycleDay } from "./cycle-day";
import { closedByNextBlock, templateOffer } from "./next-block";
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
              <p className="font-medium [overflow-wrap:break-word]">
                {joinFacts([holdHyphens(programme.name), `version\u00a0${programme.version}`])}
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
 * The programme, under two headings.
 *
 * Cycle is the whole programme and the only place it is printed in full. Changes is what the
 * coach has altered, proposed or answered, as differences rather than as a second copy of the
 * programme. The card above them belongs to neither: it is what programme this is and how far
 * through it you are, which is true on both tabs. Once it is complete, the next block is planned
 * under the card, which is where Today's "Plan the next block" leads.
 */
export default async function ProgrammeSettingsPage(props: PageProps<"/profile/programme">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requested = Array.isArray(params.view) ? params.view[0] : params.view;
  const view: ProgrammeView = PROGRAMME_VIEWS.find((value) => value === requested) ?? "cycle";
  const profile = await getRequestProfile(user.id, user.email);
  const [inProgress, { overview, changes, archived, runUnits, enabled }] = await Promise.all([
    // The per-request read the session strip also makes.
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => {
        const [overview, changes, archived, runUnits, enabled] = await Promise.all([
          getProgramOverview(tx, user.id, profile.timeZone),
          loadProgrammeChanges(tx, user.id, profile.timeZone),
          tx
            .select({ id: programs.id, name: programs.name, version: programs.version })
            .from(programs)
            .where(and(eq(programs.userId, user.id), eq(programs.status, "archived")))
            .orderBy(desc(programs.updatedAt))
            .limit(20),
          unitsFor(tx, user.id, "running"),
          enabledSportsFor(tx, user.id),
        ]);
        return { overview, changes, archived, runUnits, enabled };
      },
      { readOnly: true },
    ),
  ]);
  // The athlete's own sports first; one asking for a sport they have off says so.
  const offer = templateOffer(PROGRAM_TEMPLATES, enabled);
  const today = todayInTimeZone(profile.timeZone);
  const complete = overview?.complete ?? false;
  // The sequence waits (owner, 11 October 2026), so the end it was written with is rarely when it
  // ends: a finished programme ends when its last day was answered, one under way when its days
  // left would be done at a day each from today. The written end stays under How it is meant to go.
  const end = overview
    ? ((complete ? overview.finishedOn : overview.projectedEnd) ?? overview.program.endDate)
    : null;
  // A span inside this year names no year; one that crosses into another names both ends' years.
  const start = overview?.program.startDate;
  const spanYear =
    start && end && start.slice(0, 4) !== end.slice(0, 4) ? undefined : today.slice(0, 4);
  // What starting another closes of this one, said under the button that starts it.
  const closes = closedByNextBlock(
    overview && {
      name: overview.program.name,
      complete,
      skipped: overview.progress.skipped,
    },
  );
  // Starting over: rarely why anyone comes here, so folded at the foot of the cycle — until the
  // programme is finished, when it is the next thing to do and opens under the card.
  const nextBlock = (
    <div className="space-y-4">
      <ProgrammeOptions nested />
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="font-medium">{offer.heading}</h3>
        <ProgramTemplatePicker
          templates={offer.options}
          today={today}
          // A finished programme is not replaced: the next one starts after it.
          submitLabel={complete ? "Start this programme" : "Replace my programme"}
          extra={
            closes && <p className="type-meta [overflow-wrap:break-word] text-ink-2">{closes}</p>
          }
        />
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Programme" backHref="/profile" />
      <PageContent>
        <SavedProgrammeWork />
        {overview ? (
          <>
            {/* What the programme is and how far through it you are. */}
            <Card>
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="text-lg font-medium [overflow-wrap:break-word]">
                    {holdHyphens(overview.program.name)}
                  </h2>
                  {/* Today's word for it, "Programme complete", as the card's badge. */}
                  {complete && <Badge tone="success">Complete</Badge>}
                </div>
                <p className="mt-1.5 text-sm text-ink-muted tabular-nums">
                  {start ? formatIsoDate(start, spanYear) : "—"} →{" "}
                  {end ? formatIsoDate(end, spanYear) : "—"}
                </p>
              </div>
              <ProgressBar
                value={overview.progress.completed}
                max={overview.progress.total}
                label={`${overview.progress.completed} of ${overview.progress.total} programme days done`}
              />
              {/* Each count kept with its words ("0 to go", never "0 to / go"), and each dot with
                  the fact after it, when the line wraps. */}
              <p className="text-xs text-ink-muted tabular-nums">
                {joinFacts([
                  !complete &&
                    `Cycle\u00a0${overview.currentCycle}\u00a0of\u00a0${overview.program.cycles}`,
                  `${overview.progress.completed}\u00a0of\u00a0${overview.progress.total} programme days`,
                  !complete && `${overview.progress.remaining}\u00a0to\u00a0go`,
                  overview.progress.skipped > 0 && `${overview.progress.skipped}\u00a0skipped`,
                ])}
              </p>
              <StatTileRow>
                <StatTile label="Weeks" value={overview.program.weeks} />
                <StatTile label="Days a cycle" value={overview.days.length} />
                <StatTile label="Lifting days" value={overview.liftingDays} />
                <StatTile label="Sets a cycle" value={overview.setsPerCycle} />
              </StatTileRow>
              <ProgrammeTools id={overview.program.id} finished={complete} />
              {(overview.program.notes || overview.program.endDate) && (
                <Disclosure summary="How it is meant to go" variant="footer">
                  <div className="space-y-3">
                    {overview.program.notes && (
                      <p className="text-sm [overflow-wrap:break-word]">{overview.program.notes}</p>
                    )}
                    <DetailList
                      entries={[
                        [
                          "Planned end",
                          overview.program.endDate
                            ? formatIsoDate(overview.program.endDate, today.slice(0, 4))
                            : null,
                        ],
                        [
                          "Repeats",
                          cycleRepeatLabel({
                            weeks: overview.program.weeks,
                            days: overview.days.map((entry) => entry.day),
                            repeats: overview.program.repeats,
                          }),
                        ],
                      ]}
                    />
                  </div>
                </Disclosure>
              )}
            </Card>

            {/* Where Today's "Plan the next block" leads: the next thing to do, so not folded. */}
            {complete && (
              <Section
                title="Plan the next block"
                info="Starting another archives this one; logged sessions keep what they were prescribed. Duplicate it above to train it again."
              >
                <Card>{nextBlock}</Card>
              </Section>
            )}

            <ProgrammeTabs view={view} waiting={changes.waiting} />
            <div
              id="programme-panel"
              role="tabpanel"
              aria-labelledby={`programme-${view}-tab`}
              className="min-w-0 space-y-6"
            >
              {view === "changes" ? (
                <ProgrammeChanges data={changes} />
              ) : (
                <>
                  {/* Every session the programme asks for, in the order it asks for them. */}
                  <Section
                    title="The cycle"
                    info="One pass through these days is a cycle, and the programme repeats it for its whole length. Open a day to see everything it prescribes."
                  >
                    <ul className="space-y-3">
                      {overview.days.map((plan) => (
                        <li key={plan.day.id}>
                          <CycleDay
                            plan={plan}
                            units={runUnits}
                            open={inProgress !== null && inProgress.programDayId === plan.day.id}
                          />
                        </li>
                      ))}
                    </ul>
                  </Section>

                  {/* Folded away, because starting over is the rarest thing anyone comes here
                      to do — and open, it is three choices that each need a sentence. */}
                  {!complete && (
                    <Section
                      title="Change programme"
                      info="You get your own copy of the template. Starting another archives the current one; logged sessions keep what they were prescribed."
                    >
                      <Disclosure summary="Start a new programme">{nextBlock}</Disclosure>
                    </Section>
                  )}

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
            <Section title={offer.heading}>
              <Card>
                <ProgramTemplatePicker
                  templates={offer.options}
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
