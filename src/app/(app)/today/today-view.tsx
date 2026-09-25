import type { ReactNode } from "react";

import {
  CompletedOccurrences,
  isAnswered,
  isOutstanding,
  OccurrenceCard,
} from "@/components/activities/today-activities";
import { CoachPlanList, coachPlanSummary } from "@/components/coach-plan";
import { FoodCard } from "@/components/food/food-card";
import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Wordmark } from "@/components/shell/wordmark";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { InfoTip } from "@/components/ui/info-tip";
import { Section } from "@/components/ui/section";
import type { FoodTotals, MacroTargets } from "@/domain/nutrition";
import { writtenSummaryForSport } from "@/domain/sport-scope";
import type { SlotStatus } from "@/domain/schedule";
import type { WarmupDrill } from "@/domain/types";
import { formatDateTime, formatIsoWeekdayDay, formatTime } from "@/lib/format";
import type { TodayCoachState } from "@/server/repositories/coach-plans";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { SessionSummary } from "@/server/repositories/sessions";
import type { ScheduleDay, TodayPlan } from "@/server/repositories/schedule";

import { CoachPending, type CoachGym } from "./coach-actions";
import { GymSwitcher, type SwitcherGym } from "./gym-switcher";
import {
  CompleteRestButton,
  DiscardSessionButton,
  MoreOptions,
  StartAdHocButton,
  StartPlannedButton,
} from "./plan-actions";

/**
 * A card's opening block: where in the programme this is, what it is called, and the
 * standing beside it. The eyebrow carries the position so the name can be the largest
 * thing on the card, and every line below it is spaced the same way on every card.
 */
function CardHead({
  eyebrow,
  title,
  subtitle,
  note,
  badge,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string | null;
  /** Anything worth knowing that is not worth a line of its own. */
  note?: string | null;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{eyebrow}</p>
        )}
        {/* The tip's tap target is taller than the line it sits on, so it gives the
            height back: a card with a note is spaced exactly like one without. */}
        <h2 className="mt-1 flex items-center gap-1 text-lg font-medium [overflow-wrap:anywhere]">
          <span className="min-w-0">{title}</span>
          {note && (
            <InfoTip label={`About ${title}`} className="-my-1.5">
              {note}
            </InfoTip>
          )}
        </h2>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {badge}
    </div>
  );
}

function DrillList({ drills }: { drills: readonly WarmupDrill[] }) {
  return (
    <ul className="space-y-2.5">
      {drills.map((drill) => (
        <li key={drill.order} className="min-w-0">
          <p className="text-sm [overflow-wrap:anywhere]">{drill.name}</p>
          <p className="mt-0.5 text-xs text-ink-muted tabular-nums">{drill.dose}</p>
        </li>
      ))}
    </ul>
  );
}

/** What the day is and roughly what it costs, on one line under its name. */
function daySubtitle(day: ScheduleDay): string | null {
  const parts = [day.focus, day.timeNote].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The rest of what the programme says about the day, gathered behind one tip. */
function dayNote(day: ScheduleDay): string | null {
  const parts = [day.effortNote, day.notes].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

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
  /** Today's food against its targets; null unless food tracking is switched on (ADR 0032). */
  food?: { eaten: FoodTotals; target: MacroTargets | null } | null;
};

/**
 * One line under the day's action about the coach, only when there is something to say:
 * that it is planning now, or that its plan was made for another gym.
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
  if (coach.plan && !coach.matchesGym) {
    return (
      <p className="text-sm text-ink-muted">
        The coach planned this for {coach.plan.gymName}
        {gymName ? `, not ${gymName}` : ""}. Re-plan from More options, or start by the rule.
      </p>
    );
  }
  // Only when there is no plan to follow: a failure under a plan that is on screen said the
  // opposite of what the screen showed. What went wrong is the coach owner's to read, on the
  // AI coach page, not a line of the athlete's day.
  if (coach.failure && !coach.plan) {
    return (
      <p className="text-sm text-ink-muted">
        The coach could not prepare this session, so your programme&apos;s own targets apply.
      </p>
    );
  }
  return null;
}

/** How a finished half of the day says so: quietly, in the place its button was. */
function DoneNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

const TASK_BADGE: Record<SlotStatus, ReactNode> = {
  completed: <Badge tone="success">Done</Badge>,
  skipped: <Badge tone="warning">Skipped</Badge>,
};

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
  food = null,
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
  const position =
    plan?.suggestion && day
      ? `Cycle ${plan.suggestion.slot.cycleIndex} of ${plan.program.weeks} · Day ${day.dayIndex}`
      : undefined;

  const standing =
    plan && plan.behind > 0 ? (
      <Badge tone="warning">{plan.behind} behind</Badge>
    ) : (
      <Badge tone="success">On track</Badge>
    );

  // One programme, with each sport's prescription and actions in its own tab.
  const sessionStatus = plan?.sessionStatus ?? "pending";
  const restDay = day !== null && !day.includesLifting && !day.includesRun;
  // The open session belongs to the day when it was started from it; anything else — an ad hoc
  // session, or another day started early — is its own thing and gets its own card.
  const openHere = inProgress !== null && day !== null && inProgress.programDayId === day.id;
  const openElsewhere = inProgress !== null && !openHere;

  // Everything due today in one list, whatever scheduled it: the day's workout, the
  // programme's own endurance for that same day, and whatever the athlete put on the
  // calendar. What is still owed is on the page; what is already answered is one tap
  // behind it, so the top of Today is only ever what is left to do.
  const scheduled = [...programmeOccurrences, ...standaloneOccurrences];
  const outstanding = scheduled.filter(isOutstanding);
  const completed = scheduled.filter(isAnswered);
  const programmeIds = new Set(programmeOccurrences.map((occurrence) => occurrence.id));

  // Once today's programme day is done, the sequence offers the next one at once. It is still
  // the next one, not today's: Today keeps what was finished and whatever else is dated today,
  // and the day on offer, with its own endurance, moves under a heading of its own. A session
  // already open for it is being trained today, so then it stays today's.
  const finishedToday = plan?.suggestion && day && !openHere ? plan.finishedToday : null;
  const isProgramme = (occurrence: ScheduledOccurrence) => programmeIds.has(occurrence.id);
  // What the day on offer's section lists: everything, unless today has a section of its own.
  const onOffer = (occurrence: ScheduledOccurrence) => !finishedToday || isProgramme(occurrence);

  return (
    <>
      <PageHeader title={<Wordmark />} meta={formatIsoWeekdayDay(today)} />
      <PageContent>
        {/* Where you are training. Once a session starts the gym is fixed, and its own
            screens carry it, so this row is about the next session, not the current one. */}
        {gyms.length === 0 ? (
          <Card>
            <h2 className="text-lg font-medium">Add a gym to start training</h2>
            <LinkButton href="/gyms/new" size="lg" className="w-full">
              Add your first gym
            </LinkButton>
          </Card>
        ) : (
          <GymSwitcher
            gyms={gyms}
            workflow={coach?.workflow}
            selectedGymId={coach?.selectedGymId}
          />
        )}

        {openElsewhere && inProgress && (
          <Card>
            <CardHead
              eyebrow="In progress"
              title={inProgress.dayName ?? "Ad hoc session"}
              subtitle={`${inProgress.gymName} · ${formatDateTime(inProgress.startedAt, timeZone)}`}
              badge={
                <Badge tone="accent">
                  {inProgress.setCount} {inProgress.setCount === 1 ? "set" : "sets"}
                </Badge>
              }
            />
            <LinkButton href={`/workouts/${inProgress.id}`} size="lg" className="w-full">
              Resume session
            </LinkButton>
            {/* A session that has recorded something is finished, never discarded. */}
            {inProgress.setCount === 0 && <DiscardSessionButton sessionId={inProgress.id} />}
          </Card>
        )}

        {finishedToday && (
          <Section title="Today">
            <Card>
              <CardHead
                title={finishedToday.name}
                subtitle={
                  finishedToday.includesLifting || finishedToday.includesRun
                    ? "Done. Nothing left to do here today."
                    : "Rest day done."
                }
                badge={TASK_BADGE.completed}
              />
            </Card>
            {outstanding
              .filter((occurrence) => !isProgramme(occurrence))
              .map((occurrence) => (
                <OccurrenceCard key={occurrence.id} occurrence={occurrence} />
              ))}
            <CompletedOccurrences
              occurrences={completed.filter((occurrence) => !isProgramme(occurrence))}
            />
          </Section>
        )}

        {/* What today asks for, at the top, whatever put it there. */}
        <Section title={finishedToday ? "Up next" : "Today"}>
          {!plan ? (
            <Card>
              <h2 className="text-lg font-medium">No programme</h2>
              <LinkButton href="/profile/programme" size="lg" className="w-full">
                Choose a programme
              </LinkButton>
              <StartAdHocButton gymId={defaultGym?.id ?? null} />
            </Card>
          ) : !plan.suggestion || !day ? (
            <Card>
              <CardHead
                eyebrow="Programme complete"
                title={plan.program.name}
                subtitle={`${plan.progress.total} programme days`}
              />
              <LinkButton href="/profile/programme" size="lg" className="w-full">
                Plan the next block
              </LinkButton>
              <StartAdHocButton gymId={defaultGym?.id ?? null} />
            </Card>
          ) : (
            <>
              {/* The workout. Nothing on this card is about the run. */}
              {day.includesLifting && (
                <Card>
                  {/* With a coach plan the card's line is the coach's sentence; what the day is
                    and costs moves behind the tip, so nothing the programme says is lost. */}
                  <CardHead
                    eyebrow={position}
                    title={day.name}
                    subtitle={
                      coachPlan
                        ? (writtenSummaryForSport(coachPlan, "workout") ?? daySubtitle(day))
                        : day.includesRun
                          ? planSummary(plan.suggestedExercises)
                          : daySubtitle(day)
                    }
                    note={
                      day.includesRun
                        ? null
                        : coachPlan
                          ? [daySubtitle(day), dayNote(day)].filter(Boolean).join(" · ") || null
                          : dayNote(day)
                    }
                    badge={
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        {coachPlan && <Badge tone="accent">Coach</Badge>}
                        {sessionStatus === "pending" ? standing : TASK_BADGE[sessionStatus]}
                      </span>
                    }
                  />
                  {openHere && inProgress ? (
                    <>
                      <LinkButton
                        href={`/workouts/${inProgress.id}`}
                        size="lg"
                        className="w-full"
                        aria-label={`Resume session: ${day.name}`}
                      >
                        Resume session
                      </LinkButton>
                      <p className="text-sm text-ink-muted tabular-nums">
                        Started {formatDateTime(inProgress.startedAt, timeZone)} ·{" "}
                        {inProgress.gymName} · {inProgress.setCount}{" "}
                        {inProgress.setCount === 1 ? "set" : "sets"}
                      </p>
                      {inProgress.setCount === 0 && (
                        <DiscardSessionButton sessionId={inProgress.id} />
                      )}
                    </>
                  ) : sessionStatus === "completed" ? (
                    <DoneNote>Workout logged. Nothing left to do here today.</DoneNote>
                  ) : sessionStatus === "skipped" ? (
                    <DoneNote>Workout skipped.</DoneNote>
                  ) : (
                    <>
                      <StartPlannedButton
                        gymId={defaultGym?.id ?? null}
                        programDayId={day.id}
                        dayIndex={day.dayIndex}
                        label="Start workout"
                        dayName={day.name}
                      />
                      {defaultGym === null && (
                        <p className="text-sm text-ink-muted">Choose a gym above to start.</p>
                      )}
                    </>
                  )}
                  {coach && (
                    <CoachStatus
                      coach={coach}
                      gymName={defaultGym?.name ?? null}
                      gyms={gyms}
                      timeZone={timeZone}
                    />
                  )}
                  {coachPlan ? (
                    <Disclosure
                      summary="The plan"
                      meta={coachPlanSummary(coachPlan.exercises, plan.suggestedExercises)}
                      variant="footer"
                    >
                      <CoachPlanList
                        entries={coachPlan.exercises}
                        planned={plan.suggestedExercises}
                        unit={unit}
                        warnings={coachPlan.warnings}
                      />
                    </Disclosure>
                  ) : (
                    plan.suggestedExercises.length > 0 && (
                      <Disclosure
                        summary="The plan"
                        meta={planSummary(plan.suggestedExercises)}
                        variant="footer"
                      >
                        <PlannedExerciseList exercises={plan.suggestedExercises} />
                      </Disclosure>
                    )
                  )}
                </Card>
              )}

              {!day.includesLifting && !restDay && (
                <Card>
                  <h2 className="text-lg font-medium">No workout planned for this day</h2>
                  <StartAdHocButton gymId={defaultGym?.id ?? null} />
                </Card>
              )}

              {/* A day that neither lifts nor runs: rest, mobility, and one tick. */}
              {restDay && (
                <Card>
                  <CardHead
                    eyebrow={position}
                    title={day.name}
                    subtitle={daySubtitle(day)}
                    note={dayNote(day)}
                    badge={sessionStatus === "pending" ? standing : TASK_BADGE[sessionStatus]}
                  />
                  {sessionStatus === "pending" && (
                    <CompleteRestButton dayIndex={day.dayIndex} label="Mark rest day done" />
                  )}
                  {/* Resting is the suggestion, not a rule: the next lifting day stays one
                    tap away rather than only through "Train another day". */}
                  {plan.nextTrainingDay && (
                    <StartPlannedButton
                      gymId={defaultGym?.id ?? null}
                      programDayId={plan.nextTrainingDay.id}
                      dayIndex={plan.nextTrainingDay.dayIndex}
                      variant="secondary"
                      label={`Start ${plan.nextTrainingDay.name} instead`}
                    />
                  )}
                  {restProtocol && (
                    <Disclosure
                      summary={restProtocol.name}
                      meta={`${restProtocol.drills.length} drills`}
                      variant="footer"
                    >
                      <DrillList drills={restProtocol.drills} />
                    </Disclosure>
                  )}
                </Card>
              )}
            </>
          )}

          {/* The rest of what is due: the programme's own endurance for the day being
            offered, then whatever the athlete scheduled for today. A programme session
            says which day it belongs to, so a run never arrives unexplained. */}
          {outstanding.filter(onOffer).map((occurrence) => (
            <OccurrenceCard
              key={occurrence.id}
              occurrence={occurrence}
              meta={programmeIds.has(occurrence.id) && day ? `Part of ${day.name}` : null}
            />
          ))}
          <CompletedOccurrences occurrences={completed.filter(onOffer)} />
        </Section>

        {/* Everything that is not the day's own decision, one tap behind one control. */}
        {plan && plan.suggestion && day && (
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
        )}

        {/* Food is not the day's training, so it comes after everything that is. */}
        {food && <FoodCard eaten={food.eaten} target={food.target} />}
      </PageContent>
    </>
  );
}
