import type { ReactNode } from "react";

import {
  CompletedOccurrences,
  isAnswered,
  isOutstanding,
  OccurrenceCard,
} from "@/components/activities/today-activities";
import { CoachPlanList, coachPlanSummary } from "@/components/coach-plan";
import { CycleStrip } from "@/components/cycle-strip";
import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Wordmark } from "@/components/shell/wordmark";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ClipboardList, Pencil } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/info-tip";
import { Section } from "@/components/ui/section";
import { writtenSummaryForSport } from "@/domain/sport-scope";
import type { SlotStatus } from "@/domain/schedule";
import type { WarmupDrill } from "@/domain/types";
import { formatDateTime, formatIsoWeekdayDay, formatTime } from "@/lib/format";
import type { TodayCoachState } from "@/server/repositories/coach-plans";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { SessionSummary } from "@/server/repositories/sessions";
import type { ScheduleDay, TodayPlan } from "@/server/repositories/schedule";

import { CoachPending, CoachWaiting, type CoachGym } from "./coach-actions";
import { GymSwitcher, type SwitcherGym } from "./gym-switcher";
import {
  CompleteRestButton,
  DiscardSessionButton,
  MoreOptions,
  StartAdHocButton,
  StartPlannedButton,
} from "./plan-actions";

/**
 * The opening of a block: what it is called, set large, the one line that qualifies it, and
 * the standing beside it. The position in the programme is not here; the cycle strip above
 * the page carries it, so the name can be the largest thing on the sheet.
 */
function BlockHead({
  title,
  subtitle,
  note,
  badge,
}: {
  title: string;
  subtitle?: string | null;
  /** Anything worth knowing that is not worth a line of its own. */
  note?: string | null;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1 text-2xl [overflow-wrap:anywhere]">
          <span className="min-w-0">{title}</span>
          {note && (
            <InfoTip label={`About ${title}`} className="-my-1.5">
              {note}
            </InfoTip>
          )}
        </h2>
        {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
      </div>
      {badge}
    </div>
  );
}

/** A line in the coach's hand: what the coach wrote about today. */
function CoachLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 [overflow-wrap:anywhere] text-pen">
      <Pencil className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function DrillList({ drills }: { drills: readonly WarmupDrill[] }) {
  return (
    <ul className="min-w-0 ruled-list">
      {drills.map((drill) => (
        <li key={drill.order} className="flex items-baseline justify-between gap-3 py-2">
          <p className="min-w-0 [overflow-wrap:anywhere]">{drill.name}</p>
          <p className="shrink-0 font-data text-sm text-ink-muted tabular-nums">{drill.dose}</p>
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
};

/**
 * One line about the coach, only when there is something to say: that it is planning now,
 * or that its plan was made for another gym.
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

/** The one row that names the list and says what it costs. */
function PlanLabel({ summary }: { summary: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-1">
      <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">The plan</p>
      <p className="font-data text-sm text-ink-muted tabular-nums">{summary}</p>
    </div>
  );
}

/**
 * The primary action, kept within the thumb's reach: it sits below the plan in the sheet
 * and stays on screen while a long plan scrolls under it, on a strip of canvas so the rows
 * never show through.
 */
function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[var(--actions-inset)] z-[1] -mx-1 space-y-2 bg-canvas px-1 py-2">
      {children}
    </div>
  );
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
  // session, or another day started early — is its own thing and gets its own block.
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

  const coachSentence = coachPlan ? writtenSummaryForSport(coachPlan, "workout") : null;

  return (
    <>
      <PageHeader title={<Wordmark />} meta={formatIsoWeekdayDay(today)} />
      <PageContent>
        {/* Where today sits on the plan, before anything else. */}
        {plan?.suggestion && day && (
          <CycleStrip
            days={plan.cycleDays}
            cycleIndex={plan.suggestion.slot.cycleIndex}
            cycles={plan.program.weeks}
            todayIndex={day.dayIndex}
            behind={plan.behind}
          />
        )}

        {/* Where you are training. Once a session starts the gym is fixed, and its own
            screens carry it, so this row is about the next session, not the current one. */}
        {gyms.length === 0 ? (
          <section className="box space-y-3 py-4">
            <h2 className="text-lg">Add a gym to start training</h2>
            <LinkButton href="/gyms/new" size="lg" className="w-full">
              Add your first gym
            </LinkButton>
          </section>
        ) : (
          <GymSwitcher
            gyms={gyms}
            workflow={coach?.workflow}
            selectedGymId={coach?.selectedGymId}
          />
        )}

        {openElsewhere && inProgress && (
          <section className="panel space-y-3 p-4">
            <BlockHead
              title={inProgress.dayName ?? "Ad hoc session"}
              subtitle={`${inProgress.gymName} · ${formatDateTime(inProgress.startedAt, timeZone)}`}
              badge={
                <Badge tone="highlight">
                  {inProgress.setCount} {inProgress.setCount === 1 ? "set" : "sets"}
                </Badge>
              }
            />
            <LinkButton href={`/workouts/${inProgress.id}`} size="lg" className="w-full">
              Resume session
            </LinkButton>
            {/* A session that has recorded something is finished, never discarded. */}
            {inProgress.setCount === 0 && <DiscardSessionButton sessionId={inProgress.id} />}
          </section>
        )}

        {finishedToday && (
          <Section title="Today">
            <section className="box py-4">
              <BlockHead
                title={finishedToday.name}
                subtitle={
                  finishedToday.includesLifting || finishedToday.includesRun
                    ? "Done. Nothing left to do here today."
                    : "Rest day done."
                }
                badge={TASK_BADGE.completed}
              />
            </section>
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
            <section className="box space-y-4 py-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface text-ink">
                  <ClipboardList aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg">No programme</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    Choose a programme and the coach writes each day on this sheet.
                  </p>
                </div>
              </div>
              {/* With no gym yet, adding one is the highlighted step; this waits its turn. */}
              <LinkButton
                href="/profile/programme"
                size="lg"
                variant={gyms.length === 0 ? "secondary" : "primary"}
                className="w-full"
              >
                Choose a programme
              </LinkButton>
              <StartAdHocButton gymId={defaultGym?.id ?? null} />
            </section>
          ) : !plan.suggestion || !day ? (
            <section className="box space-y-4 py-4">
              <BlockHead
                title={plan.program.name}
                subtitle={`Programme complete · ${plan.progress.total} programme days`}
              />
              <LinkButton href="/profile/programme" size="lg" className="w-full">
                Plan the next block
              </LinkButton>
              <StartAdHocButton gymId={defaultGym?.id ?? null} />
            </section>
          ) : (
            <>
              {/* The workout. Nothing in this block is about the run. */}
              {day.includesLifting && (
                <article className="box space-y-4 py-4" aria-label={day.name}>
                  <BlockHead
                    title={day.name}
                    subtitle={
                      day.includesRun && !coachPlan
                        ? planSummary(plan.suggestedExercises)
                        : daySubtitle(day)
                    }
                    note={day.includesRun ? null : dayNote(day)}
                    badge={
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        {coachPlan && <Badge tone="accent">Coach</Badge>}
                        {sessionStatus === "pending" ? standing : TASK_BADGE[sessionStatus]}
                      </span>
                    }
                  />
                  {coachSentence && <CoachLine>{coachSentence}</CoachLine>}
                  {coach && (
                    <CoachStatus
                      coach={coach}
                      gymName={defaultGym?.name ?? null}
                      gyms={gyms}
                      timeZone={timeZone}
                    />
                  )}
                  {openHere && inProgress && (
                    <p className="text-sm text-ink-muted tabular-nums">
                      Started {formatDateTime(inProgress.startedAt, timeZone)} ·{" "}
                      {inProgress.gymName} · {inProgress.setCount}{" "}
                      {inProgress.setCount === 1 ? "set" : "sets"}
                    </p>
                  )}
                  {sessionStatus === "completed" && (
                    <DoneNote>Workout logged. Nothing left to do here today.</DoneNote>
                  )}
                  {sessionStatus === "skipped" && <DoneNote>Workout skipped.</DoneNote>}

                  {/* The plan itself, in full: it is what the screen is for. */}
                  {coachPlan ? (
                    <div>
                      <PlanLabel
                        summary={coachPlanSummary(coachPlan.exercises, plan.suggestedExercises)}
                      />
                      <CoachPlanList
                        entries={coachPlan.exercises}
                        planned={plan.suggestedExercises}
                        unit={unit}
                        warnings={coachPlan.warnings}
                      />
                    </div>
                  ) : (
                    plan.suggestedExercises.length > 0 && (
                      <div>
                        <PlanLabel summary={planSummary(plan.suggestedExercises)} />
                        <PlannedExerciseList exercises={plan.suggestedExercises} />
                      </div>
                    )
                  )}

                  {openHere && inProgress ? (
                    <ActionBar>
                      <LinkButton
                        href={`/workouts/${inProgress.id}`}
                        size="lg"
                        className="w-full"
                        aria-label={`Resume session: ${day.name}`}
                      >
                        Resume session
                      </LinkButton>
                      {inProgress.setCount === 0 && (
                        <DiscardSessionButton sessionId={inProgress.id} />
                      )}
                    </ActionBar>
                  ) : (
                    sessionStatus === "pending" && (
                      <ActionBar>
                        <StartPlannedButton
                          gymId={defaultGym?.id ?? null}
                          programDayId={day.id}
                          dayIndex={day.dayIndex}
                          label="Start workout"
                          dayName={day.name}
                          // A session open elsewhere keeps the highlighter; this one yields.
                          variant={openElsewhere ? "secondary" : "primary"}
                        />
                        {defaultGym === null && (
                          <p className="text-sm text-ink-muted">Choose a gym above to start.</p>
                        )}
                      </ActionBar>
                    )
                  )}
                </article>
              )}

              {!day.includesLifting && !restDay && (
                <section className="box space-y-3 py-4">
                  <h2 className="text-lg">No workout planned for this day</h2>
                  <StartAdHocButton gymId={defaultGym?.id ?? null} />
                </section>
              )}

              {/* A day that neither lifts nor runs: rest, mobility, and one tick. */}
              {restDay && (
                <article className="box space-y-4 py-4" aria-label={day.name}>
                  <BlockHead
                    title={day.name}
                    subtitle={daySubtitle(day)}
                    note={dayNote(day)}
                    badge={sessionStatus === "pending" ? standing : TASK_BADGE[sessionStatus]}
                  />
                  {restProtocol && (
                    <div>
                      <div className="flex items-baseline justify-between gap-3 pb-1">
                        <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
                          {restProtocol.name}
                        </p>
                        <p className="font-data text-sm text-ink-muted tabular-nums">
                          {restProtocol.drills.length} drills
                        </p>
                      </div>
                      <DrillList drills={restProtocol.drills} />
                    </div>
                  )}
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
                </article>
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

        {/* Everything that is not the day's own decision, one tap behind one row. */}
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
      </PageContent>
    </>
  );
}
