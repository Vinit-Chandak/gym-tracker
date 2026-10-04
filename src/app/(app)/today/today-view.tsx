import type { ReactNode } from "react";

import {
  CompletedOccurrences,
  isAnswered,
  isOutstanding,
  OccurrenceRow,
} from "@/components/activities/today-activities";
import { LinkButton } from "@/components/ui/button";
import { CoachNote } from "@/components/ui/coach-note";
import { Disclosure } from "@/components/ui/disclosure";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { writtenSummaryForSport } from "@/domain/sport-scope";
import type { WarmupDrill } from "@/domain/types";
import { formatDateTime, formatIsoWeekdayDay, formatTime } from "@/lib/format";
import type { TodayCoachState } from "@/server/repositories/coach-plans";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { SessionSummary } from "@/server/repositories/sessions";
import type { TodayPlan } from "@/server/repositories/schedule";

import { CoachPending, CoachWaiting, type CoachGym } from "./coach-actions";
import { GymChoice, type SwitcherGym } from "./gym-switcher";
import {
  CompleteRestButton,
  DiscardSessionButton,
  MoreOptions,
  StartAdHocButton,
  StartPlannedButton,
} from "./plan-actions";
import { cycleCells, cycleLabel, planRows, todayParts, type PlanRowModel } from "./today-model";
import { CycleMark, Fact, MetaLine, PlanRows, TodayPrint } from "./today-parts";

export type TodayViewProps = {
  today: string;
  timeZone: string;
  gyms: SwitcherGym[];
  plan: TodayPlan | null;
  inProgress: SessionSummary | null;
  restProtocol: { name: string; drills: WarmupDrill[] } | null;
  /** The coach's standing for the day's lifting slot; null when the coach is off or it is not a lifting day. */
  coach?: TodayCoachState | null;
  /** The label for loads the coach writes without a machine, e.g. "kg". */
  unit?: string;
  /** The programme's endurance work for the slot being offered — by sequence, not by date. */
  programmeOccurrences?: readonly ScheduledOccurrence[];
  /** What the athlete put on the calendar for today, which is dated today by definition. */
  standaloneOccurrences?: readonly ScheduledOccurrence[];
};

/**
 * One note under the day's name about the coach, only when there is something to say: that it
 * is planning now, that it has not reached the session, or that its plan was made for another
 * gym.
 */
function CoachStatus({
  coach,
  gymName,
  gyms,
  timeZone,
}: {
  coach: TodayCoachState;
  /** The gym the athlete is about to train at. */
  gymName: string | null;
  gyms: readonly SwitcherGym[];
  timeZone: string;
}) {
  if (coach.pending) {
    const planningFor = gyms.find((gym) => gym.id === coach.pending?.gymId)?.name ?? gymName;
    return (
      <CoachPending
        startedAt={coach.pending.requestedAt.toISOString()}
        startedAtLabel={formatTime(coach.pending.requestedAt, timeZone)}
        gymName={planningFor ?? "your gym"}
        workflow={coach.workflow}
      />
    );
  }
  if (coach.waiting) {
    return (
      <CoachWaiting
        jobId={coach.waiting.jobId}
        attempted={coach.waiting.attempted}
        hasPlan={Boolean(coach.plan && coach.matchesGym)}
      />
    );
  }
  if (coach.plan && !coach.matchesGym) {
    return (
      <CoachNote small>
        The coach planned this for {coach.plan.gymName}
        {gymName ? `, not ${gymName}` : ""}. Re-plan from More options, or start by the rule.
      </CoachNote>
    );
  }
  // Only when there is no plan to follow: a failure under a plan that is on screen said the
  // opposite of what the screen showed. What went wrong is the coach owner's to read, on the
  // AI coach page, not a line of the athlete's day.
  if (coach.failure && !coach.plan) {
    return (
      <CoachNote tone="failed" small>
        The coach could not prepare this session, so your programme&apos;s own targets apply.
      </CoachNote>
    );
  }
  return null;
}

/** A finished part of the day says so, quietly, where its button was. */
function DoneLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-2 type-meta text-ink-2">
      <Glyph name="check" className="glyph-18 text-ink" />
      {children}
    </p>
  );
}

/** A caption over a part of the page that is not the day on offer: "Today", "Up next". */
function Caption({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-4 mb-0.5 type-caption text-ink-2">
      {children}
    </h2>
  );
}

/** A screen that has nothing to offer yet: what is missing, and the way to it. */
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="mt-3">
      <FitTitle sizes={{ base: 36, short: 32, narrow: 30 }}>{title}</FitTitle>
      {children}
    </section>
  );
}

export function TodayView({
  today,
  timeZone,
  gyms,
  plan,
  inProgress,
  restProtocol,
  coach = null,
  unit = "kg",
  programmeOccurrences = [],
  standaloneOccurrences = [],
}: TodayViewProps) {
  const defaultGym =
    gyms.find((gym) => (coach?.selectedGymId ? gym.id === coach.selectedGymId : gym.isDefault)) ??
    null;
  const day = plan?.suggestedDay ?? null;
  // The coach's plan stands in for the programme's only when it was made for this gym and
  // nothing newer is on its way.
  const coachPlan = coach?.plan && coach.matchesGym && !coach.pending ? coach.plan : null;
  const coachGyms: CoachGym[] = gyms
    .filter((gym) => coach?.workflow || gym.kind === "gym")
    .map((gym) => ({ id: gym.id, name: gym.name, isDefault: gym.id === defaultGym?.id }));

  const sessionStatus = plan?.sessionStatus ?? "pending";
  const restDay = day !== null && !day.includesLifting && !day.includesRun;
  // The open session belongs to the day when it was started from it; anything else — an ad hoc
  // session, or another day started early — is its own thing and gets its own row.
  const openHere = inProgress !== null && day !== null && inProgress.programDayId === day.id;
  const openElsewhere = inProgress !== null && !openHere;

  // Everything due today in one list, whatever scheduled it: the day's workout, the
  // programme's own endurance for that same day, and whatever the athlete put on the
  // calendar. What is still owed is on the page; what is already answered is one tap
  // behind it, so the top of Today is only ever what is left to do.
  const scheduled = [...programmeOccurrences, ...standaloneOccurrences];
  const completed = scheduled.filter(isAnswered);
  const programmeIds = new Set(programmeOccurrences.map((occurrence) => occurrence.id));
  const isProgramme = (occurrence: ScheduledOccurrence) => programmeIds.has(occurrence.id);

  // Once today's programme day is done, the sequence offers the next one at once. It is still
  // the next one, not today's: Today keeps what was finished and whatever else is dated today,
  // and the day on offer, with its own endurance, moves under a heading of its own. A session
  // already open for it is being trained today, so then it stays today's.
  const finishedToday = plan?.suggestion && day && !openHere ? plan.finishedToday : null;
  // What the day on offer lists: everything, unless today has a section of its own.
  const onOffer = (occurrence: ScheduledOccurrence) => !finishedToday || isProgramme(occurrence);
  const programmeOutstanding = programmeOccurrences.filter(isOutstanding);
  const standaloneOutstanding = standaloneOccurrences.filter(isOutstanding);

  const rows: PlanRowModel[] =
    day?.includesLifting && plan ? planRows(plan.suggestedExercises, coachPlan, unit) : [];
  const coachSaid = coachPlan ? writtenSummaryForSport(coachPlan, "workout") : null;

  // ---------- the pinned actions: the one thing the screen is for, and More ----------
  const more =
    plan && plan.suggestion && day ? (
      <MoreOptions
        gymId={defaultGym?.id ?? null}
        skip={
          day.includesLifting && sessionStatus === "pending"
            ? { dayIndex: day.dayIndex, dayName: day.name }
            : null
        }
        coach={
          coach
            ? {
                gyms: coachGyms,
                requestsLeft: coach.requestsLeft,
                pending: coach.pending !== null,
                hasPlan: coach.plan !== null,
                workflow: coach.workflow,
              }
            : null
        }
      />
    ) : null;

  let primary: ReactNode = null;
  if (gyms.length === 0)
    primary = (
      <LinkButton href="/gyms/new" size="lg" className="min-w-0 flex-1">
        Add your first gym
      </LinkButton>
    );
  else if (!plan)
    primary = (
      <LinkButton href="/profile/programme" size="lg" className="min-w-0 flex-1">
        Choose a programme
      </LinkButton>
    );
  else if (!plan.suggestion || !day)
    primary = (
      <LinkButton href="/profile/programme" size="lg" className="min-w-0 flex-1">
        Plan the next block
      </LinkButton>
    );
  else if (openHere && inProgress)
    primary = (
      <LinkButton
        href={`/workouts/${inProgress.id}`}
        size="lg"
        className="min-w-0 flex-1"
        aria-label={`Resume session: ${day.name}`}
      >
        <Glyph name="play" className="glyph-20" />
        Resume session
      </LinkButton>
    );
  else if (day.includesLifting && sessionStatus === "pending")
    primary = (
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <StartPlannedButton
          gymId={defaultGym?.id ?? null}
          programDayId={day.id}
          dayIndex={day.dayIndex}
          label="Start workout"
          dayName={day.name}
          glyph="play"
        />
      </div>
    );
  else if (restDay && sessionStatus === "pending")
    primary = (
      <div className="min-w-0 flex-1">
        <CompleteRestButton dayIndex={day.dayIndex} label="Mark rest day done" />
      </div>
    );

  // ---------- the day on offer ----------
  const parts =
    day && plan
      ? todayParts({
          programme: programmeOccurrences.filter(onOffer),
          rows,
          standalone: finishedToday ? [] : standaloneOccurrences,
          restDrills: restDay ? restProtocol?.drills.length : undefined,
        })
      : [];
  const printLabel =
    day && plan
      ? `${day.name}: ${[
          programmeOccurrences.length > 0 ? "the endurance first" : null,
          rows.length > 0 ? `${rows.length} exercises as columns of their sets` : null,
        ]
          .filter(Boolean)
          .join(", then ")}. Nothing done yet.`
      : "";

  const daySection = day && plan && plan.suggestion && (
    <>
      <TodayPrint
        parts={parts}
        label={printLabel}
        // A note from the coach takes some of the print's height (Today-Coach).
        coach={Boolean(coachSaid || coach?.pending || coach?.waiting)}
      />
      <section aria-labelledby="today-day" className="today-day">
        <FitTitle id="today-day" sizes={{ base: 36, short: 32, narrow: 30 }}>
          {day.name}
        </FitTitle>
        <MetaLine>
          {gyms.length > 0 && (
            <GymChoice
              gyms={gyms}
              workflow={coach?.workflow}
              selectedGymId={coach?.selectedGymId}
            />
          )}
          {day.timeNote && <Fact glyph="rest">{day.timeNote}</Fact>}
          {coachPlan && <Fact glyph="coach">Planned by the coach</Fact>}
        </MetaLine>
      </section>

      {coach && (
        <div className="mt-2.5 empty:hidden">
          <CoachStatus
            coach={coach}
            gymName={defaultGym?.name ?? null}
            gyms={gyms}
            timeZone={timeZone}
          />
        </div>
      )}
      {coachSaid && (
        <CoachNote small clamp className="mt-2.5">
          {coachSaid}
        </CoachNote>
      )}
      {defaultGym === null && day.includesLifting && sessionStatus === "pending" && (
        <p className="mt-2 type-meta text-ink-2">Choose a gym above to start.</p>
      )}

      {openHere && inProgress && (
        <p className="mt-2 type-meta text-ink-2 tabular-nums">
          Started {formatDateTime(inProgress.startedAt, timeZone)} · {inProgress.gymName} ·{" "}
          {inProgress.setCount} {inProgress.setCount === 1 ? "set" : "sets"}
        </p>
      )}
      {openHere && inProgress && inProgress.setCount === 0 && (
        <div className="mt-1">
          <DiscardSessionButton sessionId={inProgress.id} />
        </div>
      )}
      {!openHere && sessionStatus === "completed" && (
        <DoneLine>Workout logged. Nothing left to do here today.</DoneLine>
      )}
      {!openHere && sessionStatus === "skipped" && <DoneLine>Workout skipped.</DoneLine>}
      {!day.includesLifting && !restDay && (
        <p className="mt-2 type-meta text-ink-2">No workout planned for this day.</p>
      )}

      <ul aria-label={`${finishedToday ? "Up next" : "Today"}: ${day.name}`} className="mt-2">
        {programmeOutstanding.filter(onOffer).map((occurrence) => (
          <OccurrenceRow
            key={occurrence.id}
            occurrence={occurrence}
            meta={programmeIds.has(occurrence.id) && finishedToday ? `Part of ${day.name}` : null}
          />
        ))}
        <PlanRows rows={rows} isLast={finishedToday ? true : standaloneOutstanding.length === 0} />
        {!finishedToday &&
          standaloneOutstanding.map((occurrence, index) => (
            <OccurrenceRow
              key={occurrence.id}
              occurrence={occurrence}
              last={index === standaloneOutstanding.length - 1}
            />
          ))}
      </ul>
      <CompletedOccurrences occurrences={completed.filter(onOffer)} />

      {/* A rest day: rest, the mobility, and one tick. Resting is the suggestion, not a rule:
          the next lifting day stays one tap away. */}
      {restDay && sessionStatus === "completed" && <DoneLine>Rest day done.</DoneLine>}
      {restDay && plan.nextTrainingDay && (
        <StartPlannedButton
          gymId={defaultGym?.id ?? null}
          programDayId={plan.nextTrainingDay.id}
          dayIndex={plan.nextTrainingDay.dayIndex}
          variant="tonal"
          label={`Start ${plan.nextTrainingDay.name} instead`}
          className="mt-3 w-full"
        />
      )}
      {restDay && restProtocol && (
        <div className="mt-3">
          <Disclosure
            summary={restProtocol.name}
            meta={`${restProtocol.drills.length} drills`}
            variant="footer"
          >
            <ul>
              {restProtocol.drills.map((drill, index) => (
                <li
                  key={drill.order}
                  className={
                    index < restProtocol.drills.length - 1 ? "border-b border-hair py-2" : "py-2"
                  }
                >
                  <p className="font-bold [overflow-wrap:anywhere]">{drill.name}</p>
                  <p className="type-meta-small text-ink-2 tabular-nums">{drill.dose}</p>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      )}
    </>
  );

  return (
    <>
      <h1 className="sr-only">Today</h1>
      <div className="today page-width">
        <header className="today-head">
          <p className="type-heading tabular-nums">{formatIsoWeekdayDay(today)}</p>
          {plan && plan.suggestion && day && (
            <CycleMark cells={cycleCells(plan)} label={cycleLabel(plan)} behind={plan.behind} />
          )}
        </header>

        {/* A session already open that is not the day on offer: an ad hoc one, or another
            day started early. */}
        {openElsewhere && inProgress && (
          <ul aria-label="In progress" className="mt-1">
            <li className="plan-row plan-row-last">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="plan-row-name">{inProgress.dayName ?? "Ad hoc session"}</span>
                <span className="mt-0.5 type-meta-small text-ink-2 tabular-nums">
                  In progress · {inProgress.gymName} ·{" "}
                  {formatDateTime(inProgress.startedAt, timeZone)} · {inProgress.setCount}{" "}
                  {inProgress.setCount === 1 ? "set" : "sets"}
                </span>
              </span>
              <LinkButton href={`/workouts/${inProgress.id}`} className="shrink-0">
                Resume
              </LinkButton>
            </li>
            {inProgress.setCount === 0 && (
              <li>
                <DiscardSessionButton sessionId={inProgress.id} />
              </li>
            )}
          </ul>
        )}

        {gyms.length === 0 ? (
          <Empty title="Add a gym to start training" />
        ) : !plan ? (
          <Empty title="No programme">
            <div className="mt-4">
              <StartAdHocButton gymId={defaultGym?.id ?? null} />
            </div>
          </Empty>
        ) : !plan.suggestion || !day ? (
          <Empty title={plan.program.name}>
            <MetaLine className="mt-1">
              <Fact glyph="flag">Programme complete</Fact>
              <Fact glyph="calendar">{plan.progress.total} programme days</Fact>
            </MetaLine>
            <div className="mt-4">
              <StartAdHocButton gymId={defaultGym?.id ?? null} />
            </div>
          </Empty>
        ) : (
          <>
            {finishedToday && (
              <section aria-labelledby="today-finished">
                <Caption id="today-finished">Today</Caption>
                <ul>
                  <li className="plan-row">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="plan-row-name text-ink-2">{finishedToday.name}</span>
                      <span className="mt-0.5 type-meta-small text-ink-2">
                        {finishedToday.includesLifting || finishedToday.includesRun
                          ? "Done. Nothing left to do here today."
                          : "Rest day done."}
                      </span>
                    </span>
                    <Glyph name="check" label="Done" className="glyph-20" />
                  </li>
                  {standaloneOutstanding.map((occurrence, index) => (
                    <OccurrenceRow
                      key={occurrence.id}
                      occurrence={occurrence}
                      last={index === standaloneOutstanding.length - 1}
                    />
                  ))}
                </ul>
                <CompletedOccurrences
                  occurrences={completed.filter((occurrence) => !isProgramme(occurrence))}
                />
                <Caption>Up next</Caption>
              </section>
            )}
            {daySection}
          </>
        )}
      </div>

      {(primary || more) && (
        <PinnedActions>
          {primary ?? <span className="flex-1" />}
          {more}
        </PinnedActions>
      )}
    </>
  );
}
