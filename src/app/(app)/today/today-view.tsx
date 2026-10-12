import type { Route } from "next";
import type { ReactNode } from "react";

import { Art } from "@/components/art/art";
import { enduranceName } from "@/components/activities/endurance-line";
import { EnduranceCard, isAnswered, isOutstanding } from "@/components/activities/today-activities";
import { DiscardSessionButton } from "@/components/discard-session-button";
import { FinishLeftOpenButton } from "@/components/finish-left-open-button";
import { ActivityCard } from "@/components/ui/activity-card";
import { LinkButton } from "@/components/ui/button";
import { CardLink } from "@/components/ui/card-link";
import { CoachNote } from "@/components/ui/coach-note";
import { FigureText } from "@/components/ui/figure-text";
import { FitTitle } from "@/components/ui/fit-title";
import { Figures } from "@/components/ui/figures";
import { Glyph } from "@/components/ui/glyphs";
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
import { FACT_SEPARATOR, holdFigures, joinFacts } from "@/lib/facts";
import { formatIsoWeekdayDay, formatTime, formatTimeOrDateTime } from "@/lib/format";
import { sessionName } from "@/lib/labels";
import type { LoggedActivity } from "@/server/repositories/activity-analytics";
import type { TodayCoachState } from "@/server/repositories/coach-plans";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { OpenSessionSummary, SessionSummary } from "@/server/repositories/sessions";
import type { TodayPlan } from "@/server/repositories/schedule";

import { startDayLabel } from "./choose/start-option";
import { CoachPending, CoachWaiting, type CoachGym } from "./coach-actions";
import { DiscardedNote } from "./discarded-note";
import { GymChoice, type SwitcherGym } from "./gym-switcher";
import {
  CompleteRestButton,
  MoreOptions,
  PickUpFromToday,
  StartAdHocButton,
  StartPlannedButton,
} from "./plan-actions";
import {
  cycleCells,
  cycleLabel,
  loggedBesides,
  planRows,
  printLabel,
  todayParts,
  type PlanRowModel,
} from "./today-model";
import { CycleMark, Fact, PlanRows, ProgrammeComplete, TodayPrint } from "./today-parts";

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
  /** What the athlete put on the calendar for today, which is dated today by definition. */
  standaloneOccurrences?: readonly ScheduledOccurrence[];
  /** The programme's endurance for the day finished today, which stays on today with it. */
  finishedOccurrences?: readonly ScheduledOccurrence[];
  /** How the athlete reads each sport's distances, which the endurance cards say targets in. */
  distanceUnits?: Partial<Record<ActivitySport, SportUnits>>;
  /** Everything finished today, scheduled or not: what no other card shows gets one of its own. */
  logged?: readonly LoggedActivity[];
  /** An empty session was just discarded, which Today says once. */
  discarded?: boolean;
  /** The sports the athlete trains; lifting unless told otherwise. */
  sports?: readonly ActivitySport[];
  /** The athlete chose to log their own workouts rather than follow a programme. */
  tracking?: boolean;
};

/** Each endurance sport's way to log one, as Training's new activity page asks for it. */
const LOG_SPORT: { sport: ActivitySport; label: string; query: string }[] = [
  { sport: "running", label: "Log a run", query: "running" },
  { sport: "cycling", label: "Log a ride", query: "cycling" },
  { sport: "swimming", label: "Log a swim", query: "swimming" },
];

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
      <span className="min-w-0 [overflow-wrap:break-word]">{children}</span>
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
    <section className="today-empty mt-3">
      <FitTitle sizes={{ base: 36, short: 32, narrow: 30 }}>{title}</FitTitle>
      {children}
    </section>
  );
}

const LOGGED_MARK = { running: "run", cycling: "ride", swimming: "swim" } as const;

/**
 * Something finished today that no other card stands for (`loggedBesides`): a ride nobody
 * scheduled, an unplanned workout. A card inked done like the others that stay on the day, with
 * what it came to, when it began, and the way to what was logged.
 */
function LoggedCard({
  logged,
  timeZone,
  units,
}: {
  logged: LoggedActivity;
  timeZone: string;
  units?: SportUnits;
}) {
  const strength = logged.sport === "strength";
  const seconds = logged.durationMs === null ? null : logged.durationMs / 1000;
  // A run, ride or swim says how far, else how long; a workout, where and how long.
  const distance =
    !strength && logged.distanceMetres !== null
      ? sportDistanceParts(logged.distanceMetres, logged.sport, units ?? DEFAULT_SPORT_UNITS)
      : null;
  const time = strength
    ? seconds === null
      ? null
      : `${Math.round(seconds / 60)}\u00a0min`
    : seconds === null
      ? null
      : formatDuration(seconds);
  // As History and the calendar's day name it: a workout by its day or routine, a run, ride
  // or swim by its own title, else by its sport.
  const name = strength
    ? sessionName(logged.dayName, logged.title)
    : (logged.title ?? enduranceName(logged.sport));
  return (
    <ActivityCard
      mark={
        <Art
          kind="mark"
          sport={logged.sport === "strength" ? "strength" : LOGGED_MARK[logged.sport]}
          size={22}
          state="done"
        />
      }
      title={name}
      aside={
        distance ? (
          <span className="whitespace-nowrap">
            <span className="type-figure">
              <FigureText>{distance.figure}</FigureText>
            </span>{" "}
            <span className="type-meta-small font-semibold text-ink-2">{distance.unit}</span>
          </span>
        ) : !strength && time ? (
          <span className="type-figure">
            <FigureText>{time}</FigureText>
          </span>
        ) : null
      }
      muted
      facts={
        <>
          {strength && logged.gymName && (
            <Fact glyph="pin" label="Gym">
              {logged.gymName}
            </Fact>
          )}
          {(strength || distance) && time && (
            <Fact glyph="rest">
              <Figures>{time}</Figures>
            </Fact>
          )}
          <Fact glyph="calendar">
            <Figures>{formatTime(logged.startedAt, timeZone)}</Figures>
          </Fact>
        </>
      }
      status={<State glyph="check">{strength ? "Workout logged." : "Logged"}</State>}
      actions={
        <CardLink
          href={
            strength && logged.sessionId
              ? `/workouts/${logged.sessionId}`
              : `/training/activities/${logged.id}`
          }
        >
          See what you logged
        </CardLink>
      }
    />
  );
}

/** "17:23", or with its day when the session was left open from another one. */
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
  finishedOccurrences = [],
  distanceUnits = {},
  logged = [],
  discarded = false,
  sports = ["strength"],
  tracking = false,
}: TodayViewProps) {
  // A gym is a lifter's to add: someone who only runs, rides or swims is never asked for one
  // (audit B1), and logs their own sport from here instead.
  const lifts = sports.includes("strength");
  const logSports = LOG_SPORT.filter((entry) => sports.includes(entry.sport));
  const defaultGym =
    gyms.find((gym) => (coach?.selectedGymId ? gym.id === coach.selectedGymId : gym.isDefault)) ??
    null;
  const day = plan?.suggestedDay ?? null;
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
  // The open session belongs to the day when it was started from it; anything else — an ad hoc
  // session, or another day started early — is its own thing and gets its own card.
  const openHere = inProgress !== null && day !== null && inProgress.programDayId === day.id;
  const openElsewhere = inProgress !== null && !openHere;
  // One unfinished workout at a time: while one is open, nothing on Today offers to start,
  // skip or re-plan another, and its gym is the session's, fixed (Must survive).
  const sessionOpen = inProgress !== null;
  // Left open, with nothing logged in it for six hours, it offers to finish as of its last set;
  // left open empty, the Discard it already offers is the way out.
  const finishLeftOpen =
    inProgress &&
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
  // lifter, and only when there is lifting to plan. A day of endurance alone or of rest, and a
  // programme already finished, go on without one.
  const needsGym =
    lifts &&
    gyms.length === 0 &&
    (!plan || (plan.suggestion !== null && day?.includesLifting === true));

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
  // The programme's own endurance for the day on offer, less what a revision withdrew: that asks
  // for nothing, has no card, and so is not drawn in the print or counted as the day's either.
  const programmeOnOffer = programmeOccurrences.filter(
    (occurrence) => occurrence.resolution.kind !== "cancelled" && onOffer(occurrence),
  );

  const rows: PlanRowModel[] =
    day?.includesLifting && plan ? planRows(plan.suggestedExercises, coachPlan, unit, length) : [];
  const coachSaid = coachPlan ? writtenSummaryForSport(coachPlan, "workout") : null;
  const coachRun = coachPlan ? writtenSummaryForSport(coachPlan, "run") : null;

  // ---------- the day's print, a band over the cards ----------
  const parts =
    day && plan
      ? todayParts({
          day,
          programme: programmeOnOffer,
          rows,
          standalone: finishedToday ? [] : standaloneOccurrences,
          restDrills: restDay ? restProtocol?.drills.length : undefined,
          lifted: day.includesLifting && sessionStatus === "completed",
          // The day's workout draws its columns as its own print does: open, set by set as they
          // are logged; finished (its run still owed), as the record.
          session: openHere && inProgress ? inProgress.print : plan.sessionPrint,
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
            ? {
                dayIndex: day.dayIndex,
                dayName: day.name,
                // Skipping is the workout's alone: a run still owed stays on Today after it.
                runOwed: programmeOnOffer.some(
                  (occurrence) =>
                    occurrence.sport !== "strength" && occurrence.resolution.kind === "incomplete",
                ),
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

  /** A session open that is not the day on offer: an ad hoc one, or another day started early. */
  const elsewhereCard = openElsewhere && inProgress && (
    <li>
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
            {day.timeNote && (
              <Fact glyph="rest">
                <Figures>{holdFigures(day.timeNote)}</Figures>
              </Fact>
            )}
            {day.focus && <Fact glyph="target">{holdFigures(day.focus)}</Fact>}
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
          ) : openHere ? (
            finishLeftOpen
          ) : null
        }
      />
    </li>
  );

  // A rest day: rest, the mobility, and one tick. Resting is the suggestion, not a rule: the
  // next lifting day stays one tap away. A day that only runs has no workout to start, so it is
  // not offered here; it comes up with its run's own card once the rest day is done.
  const startInstead = plan?.nextTrainingDay?.includesLifting ? plan.nextTrainingDay : null;
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
              {day.timeNote && (
                <Fact glyph="rest">
                  <Figures>{holdFigures(day.timeNote)}</Figures>
                </Fact>
              )}
              {day.focus && <Fact glyph="target">{holdFigures(day.focus)}</Fact>}
            </>
          )
        }
        status={sessionStatus === "completed" ? <State glyph="check">Rest day done.</State> : null}
        details={
          restProtocol ? (
            <div className="activity-card-plan">
              <div className="activity-card-passage">
                <p className="type-meta font-semibold">
                  {joinFacts([restProtocol.name, `${restProtocol.drills.length}\u00a0drills`])}
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
          (sessionStatus === "pending" || startInstead) && !sessionOpen ? (
            <div className="flex flex-col gap-2">
              {sessionStatus === "pending" && (
                <div className="activity-card-actions-row">
                  <div className="min-w-0 flex-1">
                    <CompleteRestButton dayIndex={day.dayIndex} label="Mark rest day done" />
                  </div>
                  {more}
                </div>
              )}
              {startInstead && (
                <StartPlannedButton
                  gymId={defaultGym?.id ?? null}
                  programDayId={startInstead.id}
                  dayIndex={startInstead.dayIndex}
                  variant="tonal"
                  // In the words Choose a day and the day's own page use for the same tap.
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
  // "Threshold"), as a lifting day's card does, where it said only "Run" (year audit, October
  // 2026). Two sessions on such a day keep their sports' names, so neither is called the day.
  const runDays = new Map<string, { name: string; focus: string | null }>();
  const nameRunDay = (
    of: TodayPlan["suggestedDay"] | null,
    occurrences: readonly ScheduledOccurrence[],
  ) => {
    if (!of || of.includesLifting || !of.includesRun) return;
    const own = occurrences.filter(
      (occurrence) => occurrence.sport !== "strength" && occurrence.resolution.kind !== "cancelled",
    );
    if (own.length === 1) runDays.set(own[0]!.id, { name: of.name, focus: of.focus });
  };
  nameRunDay(day, programmeOnOffer);
  nameRunDay(finishedToday, finishedOccurrences);

  /** `partOf` names the programme day the cards belong to where it is not the day on offer. */
  const enduranceCards = (occurrences: readonly ScheduledOccurrence[], partOf?: string) =>
    occurrences.map((occurrence) => (
      <li key={occurrence.id}>
        <EnduranceCard
          occurrence={occurrence}
          day={runDays.get(occurrence.id)}
          // A card named for its day needs no "Part of" it.
          partOf={
            runDays.has(occurrence.id)
              ? null
              : (partOf ?? (isProgramme(occurrence) && finishedToday && day ? day.name : null))
          }
          coachSummary={isProgramme(occurrence) && occurrence.sport === "running" ? coachRun : null}
          units={distanceUnits[occurrence.sport]}
        />
      </li>
    ));
  /** Still owed first; then what is already logged, inked done. */
  const dueCards = (occurrences: readonly ScheduledOccurrence[], partOf?: string) => [
    ...enduranceCards(occurrences.filter(isOutstanding), partOf),
    ...enduranceCards(
      occurrences.filter((occurrence) => isAnswered(occurrence) && !isOutstanding(occurrence)),
      partOf,
    ),
  ];

  // Whatever else was finished today stays on the day too, after the rest: a ride nobody
  // scheduled, an unplanned workout. A day's workout whose card says it is done is that card.
  const loggedCards = loggedBesides(logged, {
    occurrences: [...programmeOccurrences, ...standaloneOccurrences, ...finishedOccurrences],
    doneDayIds: [
      ...(finishedToday ? [finishedToday.id] : []),
      ...(day && !openHere && sessionStatus === "completed" ? [day.id] : []),
    ],
  }).map((activity) => (
    <li key={activity.id}>
      <LoggedCard logged={activity} timeZone={timeZone} units={distanceUnits[activity.sport]} />
    </li>
  ));

  // Without a programme day to stand under, what is due today still has its cards: an athlete
  // who trains no lifting, has no programme or has finished one still schedules runs, rides
  // and swims, and Today is where they are logged.
  const showsDueToday = (occurrences: readonly ScheduledOccurrence[]) =>
    loggedCards.length > 0 ||
    occurrences.some((occurrence) => isOutstanding(occurrence) || isAnswered(occurrence));
  const dueToday = (occurrences: readonly ScheduledOccurrence[]) =>
    showsDueToday(occurrences) && (
      <section aria-labelledby="today-due">
        <Caption id="today-due">Today</Caption>
        <ul className="today-cards">
          {dueCards(occurrences)}
          {loggedCards}
        </ul>
      </section>
    );

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
        {/* Once today's day is done, what else was logged is under Today, not Up next. */}
        {!finishedToday && loggedCards}
      </ul>
      {!day.includesLifting && !restDay && programmeOnOffer.length === 0 && (
        <p className="mt-3 type-meta text-ink-2">No workout planned for this day.</p>
      )}
      {/* More still offers another day or an unplanned workout when only the run is owed.
          Pending workout and rest cards already carry it beside their primary action. */}
      {((!day.includesLifting && !restDay) || sessionStatus !== "pending") && more && (
        <div className="mt-3 flex justify-end">{more}</div>
      )}
    </>
  );

  return (
    <>
      {/* Left open overnight, the installed app would go on showing yesterday as today. */}
      <h1 className="sr-only">Today</h1>
      <div className="today page-width page-wide">
        <header className="today-head">
          <p className="type-heading tabular-nums">{formatIsoWeekdayDay(today)}</p>
          {plan && plan.suggestion && day && (
            <CycleMark
              cells={cycleCells(plan)}
              label={cycleLabel(plan)}
              // Said once: under the date with its way out when there is one, else here.
              behind={plan.missed.length >= PICK_UP_AFTER && !sessionOpen ? 0 : plan.behind}
            />
          )}
        </header>
        {discarded && <DiscardedNote />}
        {/* A gap of more than a session or two: offered once, under the date, never in a card. */}
        {plan && plan.suggestion && plan.missed.length >= PICK_UP_AFTER && !sessionOpen && (
          <PickUpFromToday missed={plan.missed} resumeDayName={plan.pickUpDay?.name ?? null} />
        )}

        {/* The day's print stands over the day it draws: at the top, or under Up next once
            today's day is done and the next one is on offer. */}
        {!finishedToday && print}

        {elsewhereCard && <ul className="today-cards">{elsewhereCard}</ul>}

        {needsGym ? (
          <>
            {dueToday([...programmeOnOffer, ...standaloneOccurrences])}
            <Empty title="Add a gym to start training">
              <p className="mt-2 type-body text-ink-2">
                Its equipment decides which exercises your plan can use, and how far a load steps
                up.
              </p>
              <LinkButton href="/gyms/new" size="lg" className="mt-4 w-full">
                Add your first gym
              </LinkButton>
            </Empty>
          </>
        ) : !plan && !lifts ? (
          <>
            {dueToday(standaloneOccurrences)}
            <Empty
              title={showsDueToday(standaloneOccurrences) ? "Anything else?" : "Nothing planned"}
            >
              <p className="mt-2 type-body text-ink-2">Log what you do as you do it.</p>
              <div className="mt-4 flex flex-col gap-2">
                {logSports.map((entry, i) => (
                  <LinkButton
                    key={entry.sport}
                    href={`/training/new?sport=${entry.query}` as Route}
                    size="lg"
                    variant={i === 0 ? "primary" : "secondary"}
                    className="w-full"
                  >
                    {entry.label}
                  </LinkButton>
                ))}
              </div>
            </Empty>
          </>
        ) : !plan && tracking ? (
          // The athlete chose to log their own workouts (audit B7): starting one leads, and a
          // programme is there for whenever they want one.
          <>
            {dueToday(standaloneOccurrences)}
            <Empty title="Ready when you are">
              <p className="mt-2 type-body text-ink-2">
                Start a workout and log it as you go. Suggestions learn from every set you save.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {!sessionOpen && (
                  <StartAdHocButton gymId={defaultGym?.id ?? gyms[0]?.id ?? null} primary />
                )}
                <LinkButton href="/profile/programme" variant="ghost" className="w-full">
                  Choose a programme
                </LinkButton>
              </div>
            </Empty>
          </>
        ) : !plan ? (
          <>
            {dueToday(standaloneOccurrences)}
            <Empty title="No programme">
              <p className="mt-2 type-body text-ink-2">
                A programme sets each day&apos;s workout. Without one, start an unplanned session.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <LinkButton href="/profile/programme" size="lg" className="w-full">
                  Choose a programme
                </LinkButton>
                {!sessionOpen && <StartAdHocButton gymId={defaultGym?.id ?? null} />}
              </div>
            </Empty>
          </>
        ) : !plan.suggestion || !day ? (
          <>
            {dueToday(standaloneOccurrences)}
            <Empty title={plan.program.name}>
              <ProgrammeComplete
                days={plan.progress.total}
                finishedOn={plan.finishedOn}
                today={today}
                className="mt-1"
              />
              <div className="mt-4 flex flex-col gap-2">
                <LinkButton href="/profile/programme" size="lg" className="w-full">
                  Plan the next block
                </LinkButton>
                {!sessionOpen && <StartAdHocButton gymId={defaultGym?.id ?? null} />}
              </div>
            </Empty>
          </>
        ) : (
          <>
            {finishedToday && (
              <section aria-labelledby="today-finished">
                <Caption id="today-finished">Today</Caption>
                <ul className="today-cards">
                  {/* A day that only runs is its run, whose own card says it is done. */}
                  {(finishedToday.includesLifting ||
                    !finishedToday.includesRun ||
                    !finishedOccurrences.some(
                      (occurrence) => isOutstanding(occurrence) || isAnswered(occurrence),
                    )) && (
                    <li>
                      <ActivityCard
                        mark={
                          <Art
                            kind="mark"
                            sport={
                              finishedToday.includesLifting
                                ? "strength"
                                : finishedToday.includesRun
                                  ? "run"
                                  : "mobility"
                            }
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
                  )}
                  {/* What the day logged stays on the day it was logged. */}
                  {dueCards(finishedOccurrences, finishedToday.name)}
                  {dueCards(standaloneOccurrences)}
                  {loggedCards}
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
