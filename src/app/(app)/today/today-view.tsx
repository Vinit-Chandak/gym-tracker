import type { ReactNode } from "react";

import { Art } from "@/components/art/art";
import { EnduranceCard, isAnswered, isOutstanding } from "@/components/activities/today-activities";
import { DiscardSessionButton } from "@/components/discard-session-button";
import { ActivityCard } from "@/components/ui/activity-card";
import { LinkButton } from "@/components/ui/button";
import { CoachNote } from "@/components/ui/coach-note";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph } from "@/components/ui/glyphs";
import { todayInTimeZone } from "@/domain/program-calendar";
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
  MoreOptions,
  StartAdHocButton,
  StartPlannedButton,
} from "./plan-actions";
import {
  cycleCells,
  cycleLabel,
  planRows,
  printLabel,
  todayParts,
  type PlanRowModel,
} from "./today-model";
import { CycleMark, Fact, PlanRows, TodayPrint } from "./today-parts";

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
 * What the coach is doing about the day, only when there is something to say: that it is
 * planning now, that it has not reached the session, or that its plan was made for another
 * gym. A passage of the workout's card, never a box of its own.
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
        flat
      />
    );
  }
  if (coach.waiting) {
    return (
      <CoachWaiting
        jobId={coach.waiting.jobId}
        attempted={coach.waiting.attempted}
        hasPlan={Boolean(coach.plan && coach.matchesGym)}
        flat
      />
    );
  }
  if (coach.plan && !coach.matchesGym) {
    return (
      <CoachNote small flat>
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
      <CoachNote tone="failed" small flat>
        The coach could not prepare this session, so your programme&apos;s own targets apply.
      </CoachNote>
    );
  }
  return null;
}

/** Where a card stands, in words, when that is news: in progress, done, skipped, waiting. */
function State({ glyph, children }: { glyph?: "check" | "skip"; children: ReactNode }) {
  return (
    <p className="activity-card-state">
      {glyph && <Glyph name={glyph} className="glyph-18 text-ink" />}
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}

/** A caption over a part of the page that is not the day on offer: "Today", "Up next". */
function Caption({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="today-caption type-caption text-ink-2">
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

/** "Started 17:23", or with its day when the session was left open from another one. */
function started(session: SessionSummary, today: string, timeZone: string): string {
  const startedOn = todayInTimeZone(timeZone, new Date(session.startedAt));
  return `Started ${
    startedOn === today
      ? formatTime(session.startedAt, timeZone)
      : formatDateTime(session.startedAt, timeZone)
  }`;
}

const sets = (count: number) => `${count} ${count === 1 ? "set" : "sets"}`;

/** "In progress · Started 17:23 · 0 sets", each part kept whole when the line wraps. */
function Progress({
  session,
  today,
  timeZone,
}: {
  session: SessionSummary;
  today: string;
  timeZone: string;
}) {
  return (
    <>
      <span className="whitespace-nowrap">In progress</span> ·{" "}
      <span className="whitespace-nowrap">{started(session, today, timeZone)}</span> ·{" "}
      <span className="whitespace-nowrap">{sets(session.setCount)}</span>
    </>
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
  // session, or another day started early — is its own thing and gets its own card.
  const openHere = inProgress !== null && day !== null && inProgress.programDayId === day.id;
  const openElsewhere = inProgress !== null && !openHere;
  // One unfinished workout at a time: while one is open, nothing on Today offers to start,
  // skip or re-plan another, and its gym is the session's, fixed (Must survive).
  const sessionOpen = inProgress !== null;

  // Everything due today, whatever scheduled it: the day's workout, the programme's own
  // endurance for that same day, and whatever the athlete put on the calendar. What is still
  // owed comes first; what is already logged stays on the day as a card inked done.
  const programmeIds = new Set(programmeOccurrences.map((occurrence) => occurrence.id));
  const isProgramme = (occurrence: ScheduledOccurrence) => programmeIds.has(occurrence.id);

  // Once today's programme day is done, the sequence offers the next one at once. It is still
  // the next one, not today's: Today keeps what was finished and whatever else is dated today,
  // and the day on offer, with its own endurance, moves under a heading of its own. A session
  // already open for it is being trained today, so then it stays today's.
  const finishedToday = plan?.suggestion && day && !openHere ? plan.finishedToday : null;
  // What the day on offer lists: everything, unless today has a section of its own.
  const onOffer = (occurrence: ScheduledOccurrence) => !finishedToday || isProgramme(occurrence);

  const rows: PlanRowModel[] =
    day?.includesLifting && plan ? planRows(plan.suggestedExercises, coachPlan, unit) : [];
  const coachSaid = coachPlan ? writtenSummaryForSport(coachPlan, "workout") : null;
  const coachRun = coachPlan ? writtenSummaryForSport(coachPlan, "run") : null;

  // ---------- the day's print, a band over the cards ----------
  const parts =
    day && plan
      ? todayParts({
          programme: programmeOccurrences.filter(onOffer),
          rows,
          standalone: finishedToday ? [] : standaloneOccurrences,
          restDrills: restDay ? restProtocol?.drills.length : undefined,
          lifted: day.includesLifting && sessionStatus === "completed",
        })
      : [];
  const print = day && plan && plan.suggestion && (
    <TodayPrint parts={parts} label={printLabel(day.name, parts)} />
  );

  // ---------- the cards ----------
  const more =
    plan && plan.suggestion && day && !sessionOpen ? (
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

  /** A session open that is not the day on offer: an ad hoc one, or another day started early. */
  const elsewhereCard = openElsewhere && inProgress && (
    <li>
      <ActivityCard
        mark={<Art kind="mark" sport="strength" size={22} state="todo" />}
        title={inProgress.dayName ?? "Ad hoc session"}
        facts={
          <Fact glyph="pin" label="Gym">
            {inProgress.gymName}
          </Fact>
        }
        status={
          <State>
            <Progress session={inProgress} today={today} timeZone={timeZone} />
          </State>
        }
        actions={
          <LinkButton href={`/workouts/${inProgress.id}`} size="lg" className="w-full">
            <Glyph name="play" className="glyph-20" />
            Resume
          </LinkButton>
        }
        footer={
          inProgress.setCount === 0 ? <DiscardSessionButton sessionId={inProgress.id} /> : null
        }
      />
    </li>
  );

  const workoutCard = day && plan && plan.suggestion && day.includesLifting && (
    <li>
      <ActivityCard
        mark={
          <Art
            kind="mark"
            sport="strength"
            size={22}
            state={
              !openHere && sessionStatus === "completed"
                ? "done"
                : !openHere && sessionStatus === "skipped"
                  ? "skipped"
                  : "todo"
            }
          />
        }
        title={day.name}
        muted={!openHere && sessionStatus !== "pending"}
        facts={
          <>
            {openHere && inProgress ? (
              <Fact glyph="pin" label="Gym">
                {inProgress.gymName}
              </Fact>
            ) : sessionOpen ? (
              // Another session is open: nothing here can start, so the gym is not a choice.
              defaultGym && (
                <Fact glyph="pin" label="Gym">
                  {defaultGym.name}
                </Fact>
              )
            ) : (
              gyms.length > 0 &&
              sessionStatus === "pending" && (
                <GymChoice
                  gyms={gyms}
                  workflow={coach?.workflow}
                  selectedGymId={coach?.selectedGymId}
                />
              )
            )}
            {day.timeNote && <Fact glyph="rest">{day.timeNote}</Fact>}
            {day.focus && <Fact glyph="target">{day.focus}</Fact>}
            {coachPlan && <Fact glyph="coach">Planned by the coach</Fact>}
          </>
        }
        status={
          openHere && inProgress ? (
            <State>
              <Progress session={inProgress} today={today} timeZone={timeZone} />
            </State>
          ) : sessionStatus === "completed" ? (
            <State glyph="check">Workout logged.</State>
          ) : sessionStatus === "skipped" ? (
            <State glyph="skip">Workout skipped.</State>
          ) : openElsewhere ? (
            <State>Finish or discard your open session to start this one.</State>
          ) : (
            <>
              {coach && (
                <CoachStatus
                  coach={coach}
                  gymName={defaultGym?.name ?? null}
                  gyms={gyms}
                  timeZone={timeZone}
                />
              )}
              {defaultGym === null && <State>Choose a gym to start.</State>}
            </>
          )
        }
        details={
          rows.length > 0 || coachSaid ? (
            <div className="activity-card-plan">
              {coachSaid && (
                <CoachNote flat small className="activity-card-passage">
                  {coachSaid}
                </CoachNote>
              )}
              <ul aria-label={`${day.name}: the exercises`} className="activity-card-passage">
                <PlanRows rows={rows} notes="glyph" isLast />
              </ul>
            </div>
          ) : undefined
        }
        actions={
          openHere && inProgress ? (
            <LinkButton
              href={`/workouts/${inProgress.id}`}
              size="lg"
              className="w-full"
              aria-label={`Resume session: ${day.name}`}
            >
              <Glyph name="play" className="glyph-20" />
              Resume
            </LinkButton>
          ) : sessionStatus === "pending" && !openElsewhere ? (
            <div className="activity-card-actions-row">
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
              {more}
            </div>
          ) : null
        }
        footer={
          openHere && inProgress && inProgress.setCount === 0 ? (
            <DiscardSessionButton sessionId={inProgress.id} />
          ) : null
        }
      />
    </li>
  );

  // A rest day: rest, the mobility, and one tick. Resting is the suggestion, not a rule: the
  // next lifting day stays one tap away.
  const restCard = day && plan && plan.suggestion && restDay && (
    <li>
      <ActivityCard
        mark={
          <Art
            kind="mark"
            sport="mobility"
            size={22}
            segments={restProtocol?.drills.length || 3}
            state={sessionStatus === "completed" ? "done" : "todo"}
          />
        }
        title={day.name}
        muted={sessionStatus === "completed"}
        facts={
          (day.timeNote || day.focus) && (
            <>
              {day.timeNote && <Fact glyph="rest">{day.timeNote}</Fact>}
              {day.focus && <Fact glyph="target">{day.focus}</Fact>}
            </>
          )
        }
        status={sessionStatus === "completed" ? <State glyph="check">Rest day done.</State> : null}
        details={
          restProtocol ? (
            <div className="activity-card-plan">
              <div className="activity-card-passage">
                <p className="type-meta font-semibold">
                  {restProtocol.name} · {restProtocol.drills.length} drills
                </p>
                <ul className="mt-1">
                  {restProtocol.drills.map((drill, index) => (
                    <li
                      key={drill.order}
                      className={
                        index < restProtocol.drills.length - 1
                          ? "border-b border-hair py-2"
                          : "pt-2"
                      }
                    >
                      <p className="font-bold [overflow-wrap:anywhere]">{drill.name}</p>
                      <p className="type-meta-small text-ink-2 tabular-nums">{drill.dose}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : undefined
        }
        actions={
          (sessionStatus === "pending" || plan.nextTrainingDay) && !sessionOpen ? (
            <div className="flex flex-col gap-2">
              {sessionStatus === "pending" && (
                <div className="activity-card-actions-row">
                  <div className="min-w-0 flex-1">
                    <CompleteRestButton dayIndex={day.dayIndex} label="Mark rest day done" />
                  </div>
                  {more}
                </div>
              )}
              {plan.nextTrainingDay && (
                <StartPlannedButton
                  gymId={defaultGym?.id ?? null}
                  programDayId={plan.nextTrainingDay.id}
                  dayIndex={plan.nextTrainingDay.dayIndex}
                  variant="tonal"
                  label={`Start ${plan.nextTrainingDay.name} instead`}
                  className="w-full"
                />
              )}
            </div>
          ) : null
        }
      />
    </li>
  );

  const enduranceCards = (occurrences: readonly ScheduledOccurrence[]) =>
    occurrences.map((occurrence) => (
      <li key={occurrence.id}>
        <EnduranceCard
          occurrence={occurrence}
          partOf={isProgramme(occurrence) && finishedToday && day ? day.name : null}
          coachSummary={isProgramme(occurrence) && occurrence.sport === "running" ? coachRun : null}
        />
      </li>
    ));

  const programmeOnOffer = programmeOccurrences.filter(onOffer);
  const daySection = day && plan && plan.suggestion && (
    <>
      <ul aria-label={finishedToday ? `Up next: ${day.name}` : "Today"} className="today-cards">
        {workoutCard}
        {restCard}
        {enduranceCards(programmeOnOffer.filter(isOutstanding))}
        {!finishedToday && enduranceCards(standaloneOccurrences.filter(isOutstanding))}
        {enduranceCards(
          [...programmeOnOffer, ...(finishedToday ? [] : standaloneOccurrences)].filter(
            (occurrence) => isAnswered(occurrence) && !isOutstanding(occurrence),
          ),
        )}
      </ul>
      {!day.includesLifting && !restDay && programmeOnOffer.length === 0 && (
        <p className="mt-3 type-meta text-ink-2">No workout planned for this day.</p>
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

        {/* The day's print stands over the day it draws: at the top, or under Up next once
            today's day is done and the next one is on offer. */}
        {!finishedToday && print}

        {elsewhereCard && <ul className="today-cards">{elsewhereCard}</ul>}

        {gyms.length === 0 ? (
          <Empty title="Add a gym to start training">
            <LinkButton href="/gyms/new" size="lg" className="mt-4 w-full">
              Add your first gym
            </LinkButton>
          </Empty>
        ) : !plan ? (
          <Empty title="No programme">
            <div className="mt-4 flex flex-col gap-2">
              <LinkButton href="/profile/programme" size="lg" className="w-full">
                Choose a programme
              </LinkButton>
              {!sessionOpen && <StartAdHocButton gymId={defaultGym?.id ?? null} />}
            </div>
          </Empty>
        ) : !plan.suggestion || !day ? (
          <Empty title={plan.program.name}>
            <div className="meta-line mt-1">
              <Fact glyph="flag">Programme complete</Fact>
              <Fact glyph="calendar">{plan.progress.total} programme days</Fact>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <LinkButton href="/profile/programme" size="lg" className="w-full">
                Plan the next block
              </LinkButton>
              {!sessionOpen && <StartAdHocButton gymId={defaultGym?.id ?? null} />}
            </div>
          </Empty>
        ) : (
          <>
            {finishedToday && (
              <section aria-labelledby="today-finished">
                <Caption id="today-finished">Today</Caption>
                <ul className="today-cards">
                  <li>
                    <ActivityCard
                      mark={
                        <Art
                          kind="mark"
                          sport={finishedToday.includesLifting ? "strength" : "mobility"}
                          size={22}
                          state="done"
                        />
                      }
                      title={finishedToday.name}
                      muted
                      status={
                        <State glyph="check">
                          {finishedToday.includesLifting || finishedToday.includesRun
                            ? "Done."
                            : "Rest day done."}
                        </State>
                      }
                    />
                  </li>
                  {enduranceCards(standaloneOccurrences.filter(isOutstanding))}
                  {enduranceCards(
                    standaloneOccurrences.filter(
                      (occurrence) => isAnswered(occurrence) && !isOutstanding(occurrence),
                    ),
                  )}
                </ul>
                <Caption>Up next</Caption>
                {print}
              </section>
            )}
            {daySection}
          </>
        )}
      </div>
    </>
  );
}
