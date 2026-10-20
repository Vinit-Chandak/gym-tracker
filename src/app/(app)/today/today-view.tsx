import type { Route } from "next";
import type { ReactNode } from "react";

import { Art } from "@/components/art/art";
import { enduranceName } from "@/components/activities/endurance-line";
import { EnduranceCard, isOutstanding } from "@/components/activities/today-activities";
import { DiscardSessionButton } from "@/components/discard-session-button";
import { FinishLeftOpenButton } from "@/components/finish-left-open-button";
import { ActivityCard } from "@/components/ui/activity-card";
import { LinkButton } from "@/components/ui/button";
import { CoachNote } from "@/components/ui/coach-note";
import { Figures } from "@/components/ui/figures";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import type { ActivitySport } from "@/domain/activity";
import { isLeftOpen, lastTrainedAt } from "@/domain/left-open";
import { formatDuration } from "@/domain/pace";
import { writtenSummaryForSport } from "@/domain/sport-scope";
import type { WarmupDrill } from "@/domain/types";
import {
  DEFAULT_SPORT_UNITS,
  sportDistanceParts,
  type SetLengthUnit,
  type SportUnits,
} from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures, holdHyphens, joinFacts } from "@/lib/facts";
import { formatIsoWeekdayDay, formatTime, formatTimeOrDateTime } from "@/lib/format";
import { sessionName, UNPLANNED_SESSION } from "@/lib/labels";
import { originQuery } from "@/lib/nav";
import type { LoggedActivity } from "@/server/repositories/activity-analytics";
import type { TodayCoachState } from "@/server/repositories/coach-plans";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { OpenSessionSummary, SessionSummary } from "@/server/repositories/sessions";
import type { TodayPlan } from "@/server/repositories/schedule";

import { startDayLabel } from "./start-option";
import { CoachPending, CoachWaiting, type CoachGym } from "./coach-actions";
import { DiscardedNote } from "./discarded-note";
import { GymChoice, type SwitcherGym } from "./gym-switcher";
import {
  CompleteRestButton,
  MoreOptions,
  PickUpFromToday,
  StartPlannedButton,
} from "./plan-actions";
import { planRows } from "./today-model";
import { Fact, PlanRows } from "./today-parts";

/**
 * One missed session is ordinary: the waiting sequence simply offers it next. From the second,
 * Today offers to pick up from today instead (owner, 11 October 2026).
 */
const PICK_UP_AFTER = 2;

export type TodayViewProps = {
  today: string;
  timeZone: string;
  /** Whose device this is: a set it holds unsaved keeps a workout left open from finishing. */
  userId: string;
  /** The moment Today is drawn for, which says whether an open workout was left open. */
  now?: Date;
  gyms: SwitcherGym[];
  plan: TodayPlan | null;
  inProgress: OpenSessionSummary | null;
  restProtocol: { name: string; drills: WarmupDrill[] } | null;
  /** The coach's standing for the day's lifting slot; null when the coach is off or it is not a lifting day. */
  coach?: TodayCoachState | null;
  /** The label for loads the coach writes without a machine, e.g. "kg". */
  unit?: string;
  /** What a carry's distance reads in: metres, or yards beside miles. */
  length?: SetLengthUnit;
  /** The programme's endurance work for the slot being offered — by sequence, not by date. */
  programmeOccurrences?: readonly ScheduledOccurrence[];
  /** What is dated today, whatever scheduled it. */
  standaloneOccurrences?: readonly ScheduledOccurrence[];
  /** Kept for the preview's fixtures; what a finished day logged is a row of what was done. */
  finishedOccurrences?: readonly ScheduledOccurrence[];
  /** How the athlete reads each sport's distances, which the endurance cards say targets in. */
  distanceUnits?: Partial<Record<ActivitySport, SportUnits>>;
  /** Everything finished today, scheduled or not: each is a row of what was done. */
  logged?: readonly LoggedActivity[];
  /** An empty session was just discarded, which Today says once. */
  discarded?: boolean;
  /** The sports the athlete trains; lifting unless told otherwise. */
  sports?: readonly ActivitySport[];
  /** The athlete chose to log their own workouts rather than follow a programme. */
  tracking?: boolean;
};

/**
 * What the coach is doing about the day, only when there is something to say, in one line: that
 * it is planning now, that it has not reached the session, or that its plan was made for another
 * gym. Never how or when the coach works, nor where a control is (DESIGN.md, Activity cards). A
 * passage of the workout's card, never a box of its own.
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
        Prepared for {coach.plan.gymName}
        {gymName ? `, not ${gymName}` : ""}.
      </CoachNote>
    );
  }
  // Only when there is no plan to follow: a failure under a plan that is on screen said the
  // opposite of what the screen showed. What went wrong is the coach owner's to read, on the
  // AI coach page, not a line of the athlete's day.
  if (coach.failure && !coach.plan) {
    return (
      <CoachNote tone="failed" small flat>
        Preparation failed: programme targets apply.
      </CoachNote>
    );
  }
  return null;
}

/** Where a card stands, in words, when that is news: in progress, waiting. */
function State({ children }: { children: ReactNode }) {
  return (
    <p className="activity-card-state">
      <span className="min-w-0 [overflow-wrap:break-word]">{children}</span>
    </p>
  );
}

/** A caption over a part of the page: "Done". */
function Caption({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="today-caption type-caption text-ink-2">
      {children}
    </h2>
  );
}

const MARK = { strength: "strength", running: "run", cycling: "ride", swimming: "swim" } as const;

/** "Started 17:23", or with its day when the session was left open from another one. */
function startedAt(session: SessionSummary, today: string, timeZone: string): string {
  return formatTimeOrDateTime(session.startedAt, timeZone, today);
}

/**
 * "In progress · Started 17:23 · 0 sets", each part kept whole when the line wraps, and each dot
 * inside the box of the fact after it, so a wrapped line starts "· Started" and none ends on a
 * dot. The sets are the work, warm-ups aside, as the workout will list and count them.
 */
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
      {/* The figures in Jost, whose zero is plain (DESIGN.md, Typography): "0 sets", not "Ø". */}
      <span className="whitespace-nowrap">In progress</span>{" "}
      {/* Whole while it fits a line; at large text a start on another day ("Started Sun 11 Oct,
          10:30") is longer than the line, and wraps inside its own box rather than run off. */}
      <span className="inline-block max-w-full">
        {FACT_SEPARATOR.trimStart()}Started <Figures>{startedAt(session, today, timeZone)}</Figures>
      </span>{" "}
      <span className="whitespace-nowrap">
        {FACT_SEPARATOR.trimStart()}
        <span className="figures">{session.workingSetCount}</span>{" "}
        {session.workingSetCount === 1 ? "set" : "sets"}
      </span>
    </>
  );
}

/**
 * What one finished activity came to, in a row's few words: a run, ride or swim how far, else
 * how long; a workout how long. Marked unplanned when it answered nothing planned and its name
 * does not already say so.
 */
function doneValue(logged: LoggedActivity, title: string, units: SportUnits): string | undefined {
  const strength = logged.sport === "strength";
  const seconds = logged.durationMs === null ? null : logged.durationMs / 1000;
  const distance =
    !strength && logged.distanceMetres !== null
      ? sportDistanceParts(logged.distanceMetres, logged.sport, units)
      : null;
  const result = distance
    ? `${distance.figure} ${distance.unit}`
    : seconds === null
      ? null
      : strength
        ? `${Math.round(seconds / 60)} min`
        : formatDuration(seconds);
  const unplanned = strength ? logged.programDayId === null : logged.occurrenceId === null;
  return joinFacts([unplanned && title !== UNPLANNED_SESSION && "Unplanned", result]) || undefined;
}

/**
 * Today (ADR 0058): what is owed today, one card per session, and then what has been done, a row
 * each. Nothing that is not today's: where a programme has got to and what comes next are
 * Plan's, and logging anything else is Log's. Owed first, done after; a session done today stops
 * being a card and becomes a row that opens its record.
 */
export function TodayView({
  today,
  timeZone,
  userId,
  now = new Date(),
  gyms,
  plan,
  inProgress,
  restProtocol,
  coach = null,
  unit = "kg",
  length = "m",
  programmeOccurrences = [],
  standaloneOccurrences = [],
  distanceUnits = {},
  logged = [],
  discarded = false,
  sports = ["strength"],
}: TodayViewProps) {
  // A gym is a lifter's to add: someone who only runs, rides or swims is never asked for one
  // (audit B1).
  const lifts = sports.includes("strength");
  const defaultGym =
    gyms.find((gym) => (coach?.selectedGymId ? gym.id === coach.selectedGymId : gym.isDefault)) ??
    null;
  // Once today's programme day is done, the sequence offers the next one at once. That one is
  // not today's, so Today does not show it (ADR 0058): it is on Plan, and Log can start it.
  const finishedToday = plan?.suggestion && plan.suggestedDay ? plan.finishedToday : null;
  const openHere =
    inProgress !== null &&
    plan?.suggestedDay !== null &&
    plan?.suggestedDay !== undefined &&
    inProgress.programDayId === plan.suggestedDay.id;
  const day = plan?.suggestion && (!finishedToday || openHere) ? plan.suggestedDay : null;
  // The coach's plan stands in for the programme's only when it was made for this gym and
  // nothing newer is on its way.
  const coachPlan = coach?.plan && coach.matchesGym && !coach.pending ? coach.plan : null;
  const coachGyms: CoachGym[] = gyms
    .filter((gym) => coach?.workflow || gym.kind === "gym")
    .map((gym) => ({
      id: gym.id,
      name: gym.name,
      kind: gym.kind,
      isDefault: gym.id === defaultGym?.id,
    }));

  const sessionStatus = plan?.sessionStatus ?? "pending";
  const restDay = day !== null && !day.includesLifting && !day.includesRun;
  // The open session belongs to the day when it was started from it; anything else — an
  // unplanned one, or another day started early — is its own thing and gets its own card.
  const openElsewhere = inProgress !== null && !openHere;
  // One unfinished workout at a time: while one is open, nothing on Today offers to start,
  // skip or re-plan another, and its gym is the session's, fixed (Must survive).
  const sessionOpen = inProgress !== null;
  // Left open, with nothing logged in it for six hours, it offers to finish as of its last set;
  // left open empty, the Discard it already offers is the way out.
  const finishLeftOpen =
    inProgress &&
    !inProgress.loggedRetrospectively &&
    inProgress.setCount > 0 &&
    isLeftOpen(inProgress.startedAt, inProgress.lastSetAt, now) ? (
      <FinishLeftOpenButton
        userId={userId}
        sessionId={inProgress.id}
        at={formatTimeOrDateTime(
          lastTrainedAt(inProgress.startedAt, inProgress.lastSetAt),
          timeZone,
          today,
        )}
      />
    ) : null;
  // A gym is what a workout is planned for, so without one Today asks for it — but only of a
  // lifter, and only with no programme or with lifting to do today (audit B1).
  const needsGym =
    lifts && gyms.length === 0 && !openHere && (!plan || day?.includesLifting === true);

  // Everything dated today, whatever scheduled it: the programme's own and the athlete's.
  const dated = [...programmeOccurrences, ...standaloneOccurrences].filter(
    (occurrence) => occurrence.resolution.kind !== "cancelled",
  );
  const owed = dated.filter(isOutstanding);
  const skippedToday = dated.filter((occurrence) => occurrence.disposition === "skipped");

  const rows =
    day?.includesLifting && plan ? planRows(plan.suggestedExercises, coachPlan, unit, length) : [];
  const coachSaid = coachPlan ? writtenSummaryForSport(coachPlan, "workout") : null;
  const coachRun = coachPlan ? writtenSummaryForSport(coachPlan, "run") : null;

  // ---------- the cards: what is owed ----------
  const more =
    plan && day && !sessionOpen ? (
      <MoreOptions
        skip={
          day.includesLifting && sessionStatus === "pending"
            ? {
                dayIndex: day.dayIndex,
                dayName: day.name,
                // Skipping is the workout's alone: a run still owed stays on Today after it.
                runOwed: owed.some((occurrence) => occurrence.sport === "running"),
              }
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

  /** A session open that is not the day on offer: an unplanned one, or another day started early. */
  const elsewhereCard = openElsewhere && inProgress && (
    <li key="open">
      <ActivityCard
        mark={<Art kind="mark" sport="strength" size={22} state="todo" />}
        title={sessionName(inProgress.dayName, inProgress.title)}
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
          // The whole workout, prefetched, so Resume opens it at once (ADR 0050); its sets saved
          // after this copy was made are laid over it by the browser (ADR 0030).
          <LinkButton
            href={`/workouts/${inProgress.id}`}
            prefetch
            size="lg"
            className="w-full"
            aria-label={`Resume session: ${sessionName(inProgress.dayName, inProgress.title)}`}
          >
            <Glyph name="play" className="glyph-20" />
            Resume
          </LinkButton>
        }
        footer={
          inProgress.setCount === 0 ? (
            <DiscardSessionButton sessionId={inProgress.id} />
          ) : (
            finishLeftOpen
          )
        }
      />
    </li>
  );

  // The day's workout, while it is owed or open. Done, it is a row of what was done.
  const workoutCard = day &&
    plan &&
    day.includesLifting &&
    (openHere || (sessionStatus === "pending" && !needsGym)) && (
      <li key="workout">
        <ActivityCard
          mark={<Art kind="mark" sport="strength" size={22} state="todo" />}
          title={day.name}
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
                gyms.length > 0 && (
                  <GymChoice
                    gyms={gyms}
                    workflow={coach?.workflow}
                    selectedGymId={coach?.selectedGymId}
                  />
                )
              )}
              {day.timeNote && (
                <Fact glyph="rest">
                  <Figures>{holdFigures(day.timeNote)}</Figures>
                </Fact>
              )}
              {day.focus && <Fact glyph="target">{holdFigures(day.focus)}</Fact>}
              {coachPlan && <Fact glyph="coach">Prepared by the coach</Fact>}
            </>
          }
          status={
            openHere && inProgress ? (
              <State>
                <Progress session={inProgress} today={today} timeZone={timeZone} />
              </State>
            ) : openElsewhere ? (
              <State>Finish or discard your open workout first.</State>
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
                {/* With gyms to choose from, the chip says "Choose a gym" itself; with none at
                    all there is no chip to say it. */}
                {defaultGym === null && gyms.length === 0 && <State>Add a gym to start.</State>}
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
                  <PlanRows rows={rows} notes="none" isLast />
                </ul>
              </div>
            ) : undefined
          }
          actions={
            openHere && inProgress ? (
              <LinkButton
                href={`/workouts/${inProgress.id}`}
                prefetch
                size="lg"
                className="w-full"
                aria-label={`Resume session: ${day.name}`}
              >
                <Glyph name="play" className="glyph-20" />
                Resume
              </LinkButton>
            ) : !openElsewhere ? (
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
            ) : openHere ? (
              finishLeftOpen
            ) : null
          }
        />
      </li>
    );

  // A rest day: rest, the mobility, and one tick. Resting is the suggestion, not a rule: the
  // next lifting day stays one tap away. Done, it is a row of what was done.
  const startInstead = plan?.nextTrainingDay?.includesLifting ? plan.nextTrainingDay : null;
  const restCard = day && plan && plan.suggestion && restDay && sessionStatus === "pending" && (
    <li key="rest">
      <ActivityCard
        mark={
          <Art
            kind="mark"
            sport="mobility"
            size={22}
            segments={restProtocol?.drills.length || 3}
            state="todo"
          />
        }
        title={day.name}
        facts={
          (day.timeNote || day.focus) && (
            <>
              {day.timeNote && (
                <Fact glyph="rest">
                  <Figures>{holdFigures(day.timeNote)}</Figures>
                </Fact>
              )}
              {day.focus && <Fact glyph="target">{holdFigures(day.focus)}</Fact>}
            </>
          )
        }
        details={
          restProtocol ? (
            <div className="activity-card-plan">
              <div className="activity-card-passage">
                <p className="type-meta font-semibold">
                  {joinFacts([restProtocol.name, `${restProtocol.drills.length} drills`])}
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
                      <p className="font-bold [overflow-wrap:break-word]">{drill.name}</p>
                      <p className="type-meta-small text-ink-2 tabular-nums">{drill.dose}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : undefined
        }
        actions={
          !sessionOpen ? (
            <div className="flex flex-col gap-2">
              <div className="activity-card-actions-row">
                <div className="min-w-0 flex-1">
                  <CompleteRestButton dayIndex={day.dayIndex} label="Mark rest day done" />
                </div>
                {more}
              </div>
              {startInstead && (
                <StartPlannedButton
                  gymId={defaultGym?.id ?? null}
                  programDayId={startInstead.id}
                  dayIndex={startInstead.dayIndex}
                  variant="tonal"
                  label={startDayLabel(
                    startInstead.name,
                    startInstead.cycleIndex,
                    plan.suggestion.slot.cycleIndex,
                  )}
                  className="w-full"
                />
              )}
            </div>
          ) : null
        }
      />
    </li>
  );

  // A day that only runs is its run: its one card takes the day's name and focus ("Tempo run",
  // "Threshold"), as a lifting day's card does. Two sessions on such a day keep their sports'
  // names, so neither is called the day.
  const runDay =
    day && !day.includesLifting && day.includesRun && owed.length === 1
      ? { id: owed[0]!.id, name: day.name, focus: day.focus }
      : null;
  const enduranceCards = owed.map((occurrence) => (
    <li key={occurrence.id}>
      <EnduranceCard
        occurrence={occurrence}
        day={runDay?.id === occurrence.id ? runDay : undefined}
        coachSummary={occurrence.sport === "running" ? coachRun : null}
        units={distanceUnits[occurrence.sport]}
      />
    </li>
  ));

  const cards = [elsewhereCard, workoutCard, restCard, ...enduranceCards].filter(Boolean);

  // ---------- the rows: what is done ----------
  const titles = new Map(
    dated.map((occurrence) => [occurrence.id, occurrence.prescription?.title ?? null]),
  );
  const doneRows: ReactNode[] = [
    ...logged.map((activity) => {
      const title =
        activity.sport === "strength"
          ? sessionName(activity.dayName, activity.title)
          : ((activity.occurrenceId ? titles.get(activity.occurrenceId) : null) ??
            activity.title ??
            enduranceName(activity.sport));
      return (
        <NavRow
          key={activity.id}
          // Opened from Today, it keeps Today selected and goes back to it (NAV-03).
          href={
            (activity.sport === "strength" && activity.sessionId
              ? `/workouts/${activity.sessionId}${originQuery("today")}`
              : `/training/activities/${activity.id}${originQuery("today")}`) as Route
          }
          lead={<Art kind="mark" sport={MARK[activity.sport]} size={20} state="done" />}
          label={holdHyphens(title)}
          value={doneValue(activity, title, distanceUnits[activity.sport] ?? DEFAULT_SPORT_UNITS)}
        />
      );
    }),
    ...skippedToday.map((occurrence) => (
      <NavRow
        key={occurrence.id}
        href={`/training/programme/occurrences/${occurrence.id}` as Route}
        lead={<Art kind="mark" sport={MARK[occurrence.sport]} size={20} state="skipped" />}
        label={holdHyphens(occurrence.prescription?.title ?? enduranceName(occurrence.sport))}
        value="Skipped"
      />
    )),
    // A rest day leaves nothing logged; its tick is its row.
    ...((restDay && sessionStatus === "completed") ||
    (finishedToday && !finishedToday.includesLifting && !finishedToday.includesRun)
      ? [
          <NavRow
            key="rest"
            lead={<Art kind="mark" sport="mobility" size={20} state="done" />}
            label={holdHyphens((finishedToday ?? day)?.name ?? "Rest day")}
            value="Done"
          />,
        ]
      : []),
  ];

  // ---------- the page ----------
  const empty = cards.length === 0 && doneRows.length === 0 && !needsGym;
  // Nothing planned and nothing done: logging is the page itself. Otherwise it waits up top.
  const logButton = (primary: boolean) => (
    <LinkButton
      href="/today/log"
      size={primary ? "lg" : "sm"}
      variant={primary ? "primary" : "tonal"}
      className={primary ? "w-full" : undefined}
    >
      <Glyph name="plus" className="glyph-18" />
      {primary ? "Log a session" : "Log"}
    </LinkButton>
  );
  return (
    <>
      {/* Left open overnight, the installed app would go on showing yesterday as today. */}
      <h1 className="sr-only">Today</h1>
      <div className="today page-width page-wide">
        <header className="today-head">
          <p className="type-heading tabular-nums">{formatIsoWeekdayDay(today)}</p>
          {!empty && logButton(false)}
        </header>
        {discarded && <DiscardedNote />}
        {/* A gap of more than a session or two: offered once, under the date, never in a card. */}
        {plan && plan.suggestion && plan.missed.length >= PICK_UP_AFTER && !sessionOpen && (
          <PickUpFromToday missed={plan.missed} resumeDayName={plan.pickUpDay?.name ?? null} />
        )}
        {cards.length > 0 && <ul className="today-cards">{cards}</ul>}
        {needsGym && (
          <section className="today-empty mt-3">
            <FitTitle sizes={{ base: 36, short: 32, narrow: 30 }}>
              Add a gym to start training
            </FitTitle>
            <LinkButton href="/gyms/new" size="lg" className="mt-4 w-full">
              Add your first gym
            </LinkButton>
          </section>
        )}
        {doneRows.length > 0 && (
          <section aria-labelledby="today-done" className="mt-4">
            <Caption id="today-done">Done</Caption>
            <ul className="ruled-list">{doneRows}</ul>
          </section>
        )}
        {empty && (
          <section className="today-empty mt-3">
            <FitTitle sizes={{ base: 36, short: 32, narrow: 30 }}>
              {plan && !plan.suggestion ? `${plan.program.name} is complete` : "Nothing planned"}
            </FitTitle>
            <div className="mt-4">{logButton(true)}</div>
          </section>
        )}
      </div>
    </>
  );
}
