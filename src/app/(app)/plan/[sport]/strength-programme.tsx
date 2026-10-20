import { SavedProgrammeWork } from "@/components/coaching/saved-work";
import { ProgrammeTools } from "@/components/coaching/programme-tools";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { Disclosure } from "@/components/ui/disclosure";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { cycleRepeatLabel, programLengthLabel } from "@/domain/cycle-repeat";
import { todayInTimeZone } from "@/domain/program-calendar";
import { isCoachServiceConfigured } from "@/lib/env";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getProgramOverview, type ProgramDayPlan } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { strengthPosition } from "@/server/repositories/sport-programmes";

import { loadProgrammeChanges, ProgrammeChanges } from "@/app/(app)/profile/programme/changes";
import { CycleDay } from "@/app/(app)/profile/programme/cycle-day";
import { ProgrammeTabs } from "@/app/(app)/profile/programme/programme-tabs";
import { PROGRAMME_VIEWS, type ProgrammeView } from "@/app/(app)/profile/programme/programme-views";

/**
 * The programme, under two headings.
 *
 * Cycle is the whole programme and the only place it is printed in full. Changes is what the
 * coach has altered, proposed or answered, as differences rather than as a second copy of the
 * programme. The card above them belongs to neither: it is what programme this is and how far
 * through it you are, which is true on both tabs. Once it is complete, the next block is planned
 * under the card, which is where Today's "Plan the next block" leads.
 */
export async function StrengthProgramme({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const requested = Array.isArray(params.view) ? params.view[0] : params.view;
  const view: ProgrammeView = PROGRAMME_VIEWS.find((value) => value === requested) ?? "cycle";
  const profile = await getRequestProfile(user.id, user.email);
  const [inProgress, { overview, changes, runUnits }] = await Promise.all([
    // The per-request read the session strip also makes.
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => {
        const [overview, changes, runUnits] = await Promise.all([
          getProgramOverview(tx, user.id, profile.timeZone),
          loadProgrammeChanges(tx, user.id, profile.timeZone, {
            sport: "strength",
            coachOn: profile.aiCoachEnabled,
          }),
          readSportUnits(tx, user.id),
        ]);
        return { overview, changes, runUnits };
      },
      { readOnly: true },
    ),
  ]);
  const today = todayInTimeZone(profile.timeZone);
  const complete = overview?.complete ?? false;
  const once = overview?.program.repeats === "once";
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
  // A list of folds is ruled rows that share their rules, never a stack of boxes (DESIGN.md).
  const dayList = (days: readonly ProgramDayPlan[]) => (
    <ul className="[&>li+li]:-mt-px">
      {days.map((plan) => (
        <li key={plan.day.id}>
          <CycleDay
            plan={plan}
            units={runUnits}
            open={inProgress !== null && inProgress.programDayId === plan.day.id}
          />
        </li>
      ))}
    </ul>
  );
  const days = overview?.days.map(({ day }) => day) ?? [];
  const pattern = overview
    ? cycleRepeatLabel({ weeks: overview.program.weeks, days, repeats: overview.program.repeats })
    : "";
  // Where it has got to, in the words its card on Plan says it in (ADR 0058), said once here.
  const position = overview
    ? strengthPosition({
        complete,
        repeats: overview.program.repeats,
        pattern,
        currentCycle: overview.currentCycle,
        cycles: overview.program.cycles,
        nextDayIndex: overview.days.find((plan) => plan.isNext)?.day.dayIndex,
        dayCount: overview.days.length,
      })
    : null;
  return (
    <>
      <PageHeader title="Strength programme" backHref="/plan" />
      <PageContent>
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
                <p className="mt-1.5 text-sm text-ink-muted">
                  {pattern}
                  {" · "}
                  {programLengthLabel({
                    weeks: overview.program.weeks,
                    days,
                    repeats: overview.program.repeats,
                  })}
                </p>
              </div>
              <ProgressBar
                value={overview.progress.completed}
                max={overview.progress.total}
                label={`${overview.progress.completed} of ${overview.progress.total} programme days done`}
              />
              {/* Each count kept with its words ("0 to go", never "0 to / go"), and each dot with
                  the fact after it, when the line wraps. */}
              <p className="text-sm text-ink-muted tabular-nums">
                {joinFacts([
                  position?.replace(/ /g, "\u00a0"),
                  !complete && `${overview.progress.remaining}\u00a0days\u00a0left`,
                  overview.progress.skipped > 0 && `${overview.progress.skipped}\u00a0skipped`,
                ])}
              </p>
              <ProgrammeTools id={overview.program.id} finished={complete} />
              {(overview.program.notes || overview.program.endDate) && (
                <Disclosure summary="Programme details" variant="footer">
                  <div className="space-y-3">
                    {overview.program.notes && (
                      <p className="text-sm [overflow-wrap:break-word]">{overview.program.notes}</p>
                    )}
                    <DetailList
                      entries={[
                        ["Started", start ? formatIsoDate(start, spanYear) : null],
                        [
                          complete ? "Finished" : "Estimated finish",
                          end ? formatIsoDate(end, spanYear) : null,
                        ],
                        [
                          once ? "Lifting days" : "Lifting days per cycle",
                          `${overview.liftingDays}`,
                        ],
                        [once ? "Planned sets" : "Sets per cycle", `${overview.setsPerCycle}`],
                        [
                          "Planned end",
                          overview.program.endDate
                            ? formatIsoDate(overview.program.endDate, today.slice(0, 4))
                            : null,
                        ],
                      ]}
                    />
                  </div>
                </Disclosure>
              )}
            </Card>

            <ProgrammeTabs view={view} waiting={changes.waiting} />
            <div
              id="programme-panel"
              role="tabpanel"
              aria-labelledby={`programme-${view}-tab`}
              className="min-w-0 space-y-6"
            >
              {view === "changes" ? (
                <ProgrammeChanges
                  data={changes}
                  // A note waits for the coach's next run: it needs the coach on, not this
                  // server able to start it.
                  request={
                    profile.aiCoachEnabled &&
                    process.env.COACH_WORKFLOW_ENABLED === "true" &&
                    isCoachServiceConfigured()
                      ? { noteId: crypto.randomUUID() }
                      : null
                  }
                />
              ) : (
                // Every day the programme asks for, in the order it asks for them; the tab names
                // the panel, and where the programme has got to is the card's, said once.
                <div>
                  {once && overview.days.length > 7 ? (
                    <ul className="[&>li+li]:-mt-px">
                      {Array.from({ length: Math.ceil(overview.days.length / 7) }, (_, index) => {
                        const week = overview.days.slice(index * 7, index * 7 + 7);
                        return (
                          <li key={week[0]!.day.id}>
                            <Disclosure
                              summary={`Days ${index * 7 + 1}–${index * 7 + week.length}`}
                              variant="inline"
                              defaultOpen={
                                week.some(
                                  (plan) => plan.isNext || inProgress?.programDayId === plan.day.id,
                                ) ||
                                (complete && index === 0)
                              }
                            >
                              {dayList(week)}
                            </Disclosure>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    dayList(overview.days)
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <SavedProgrammeWork />
            <Card>
              <h2 className="text-lg font-medium">No strength programme</h2>
              <LinkButton href="/plan/new?sport=strength">New programme</LinkButton>
            </Card>
          </>
        )}
      </PageContent>
    </>
  );
}
