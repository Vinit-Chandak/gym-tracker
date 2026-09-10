import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { CoachPlanList, coachPlanSummary, CoachRunDetails } from "@/components/coach-plan";
import { PlannedExerciseList, planSummary } from "@/components/planned-exercises";
import { hasRunGuidance, RunPlanDetails, runSummary } from "@/components/run-plan";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { InfoTip } from "@/components/ui/info-tip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { runPlanLine } from "@/domain/session-plan";
import type { WarmupDrill } from "@/domain/types";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import type { TodayCoachState } from "@/server/repositories/coach-plans";
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
};

/**
 * One line under the day's action about the coach, only when there is something to say:
 * that it is planning now, or that its plan was made for another gym.
 */
function CoachStatus({
  coach,
  gymName,
  gyms,
}: {
  coach: TodayCoachState;
  /** The gym the athlete is about to train at. */
  gymName: string | null;
  gyms: readonly SwitcherGym[];
}) {
  if (coach.pending) {
    const planningFor = gyms.find((gym) => gym.id === coach.pending?.gymId)?.name ?? gymName;
    return (
      <CoachPending
        startedAt={coach.pending.requestedAt.toISOString()}
        gymName={planningFor ?? "your gym"}
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
  if (coach.failure) {
    return (
      <p className="text-sm text-warning">
        The coach could not plan this one. {coach.failure.error ?? "It gave no reason."} The
        programme&apos;s own targets apply.
      </p>
    );
  }
  return null;
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
}: TodayViewProps) {
  const defaultGym = gyms.find((gym) => gym.isDefault) ?? null;
  const day = plan?.suggestedDay ?? null;
  const restDay = day !== null && !day.includesLifting;
  // The coach's plan stands in for the programme's only when it was made for this gym and
  // nothing newer is on its way.
  const coachPlan = coach?.plan && coach.matchesGym && !coach.pending ? coach.plan : null;
  // A run is planned for the day, not for a gym, so it stands whichever gym the plan named.
  const coachRun = coach?.plan && !coach.pending ? (coach.plan.run ?? null) : null;
  const coachGyms: CoachGym[] = gyms
    .filter((gym) => gym.kind === "gym")
    .map((gym) => ({ id: gym.id, name: gym.name, isDefault: gym.isDefault }));
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

  return (
    <>
      <PageHeader title="Today" context={formatIsoDate(today)} />
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
          <GymSwitcher gyms={gyms} />
        )}

        {inProgress ? (
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
        ) : !plan ? (
          <Card>
            <h2 className="text-lg font-medium">No programme</h2>
            <LinkButton href="/settings/programme" size="lg" className="w-full">
              Choose a programme
            </LinkButton>
            <StartAdHocButton gymId={defaultGym?.id ?? null} />
          </Card>
        ) : !plan.suggestion || !day ? (
          <Card>
            <CardHead
              eyebrow="Programme complete"
              title={plan.program.name}
              subtitle={`${plan.progress.total} sessions`}
            />
            <LinkButton href="/settings/programme" size="lg" className="w-full">
              Plan the next block
            </LinkButton>
            <StartAdHocButton gymId={defaultGym?.id ?? null} />
          </Card>
        ) : (
          <>
            {/*
              One card per thing to do. A day with a run and a lifting session is two cards,
              each with its own action above its own folded plan, so a closed card is the
              decision and nothing else: name, standing, button.
            */}
            {day.includesLifting && (
              <Card>
                {/* With a coach plan the card's line is the coach's sentence; what the day is
                    and costs moves behind the tip, so nothing the programme says is lost. */}
                <CardHead
                  eyebrow={position}
                  title={day.name}
                  subtitle={coachPlan ? coachPlan.summary : daySubtitle(day)}
                  note={
                    coachPlan
                      ? [daySubtitle(day), dayNote(day)].filter(Boolean).join(" · ") || null
                      : dayNote(day)
                  }
                  badge={
                    coachPlan ? (
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        <Badge tone="accent">Coach</Badge>
                        {standing}
                      </span>
                    ) : (
                      standing
                    )
                  }
                />
                <StartPlannedButton
                  gymId={defaultGym?.id ?? null}
                  programDayId={day.id}
                  dayIndex={day.dayIndex}
                  label="Start workout"
                  ariaLabel={`Start ${day.name}`}
                />
                {defaultGym === null && (
                  <p className="text-sm text-ink-muted">Choose a gym above to start.</p>
                )}
                {coach && (
                  <CoachStatus coach={coach} gymName={defaultGym?.name ?? null} gyms={gyms} />
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

            {(plan.runTarget || coachRun) && (
              <Card>
                <CardHead
                  eyebrow={day.includesLifting ? undefined : position}
                  title="Easy run"
                  subtitle={
                    coachRun
                      ? runPlanLine(coachRun)
                      : plan.runTarget
                        ? runSummary(plan.runTarget)
                        : null
                  }
                  badge={
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {coachRun && <Badge tone="accent">Coach</Badge>}
                      {day.includesLifting ? null : standing}
                    </span>
                  }
                />
                {/* On a day that only runs, the coach's sentence is about the run. */}
                {coachRun && !day.includesLifting && coachPlan && (
                  <p className="text-sm">{coachPlan.summary}</p>
                )}
                <LinkButton
                  href="/runs/new"
                  variant={day.includesLifting ? "secondary" : "primary"}
                  size="lg"
                  className="w-full"
                >
                  Log run
                </LinkButton>
                {!day.includesLifting && coach && (
                  <CoachStatus coach={coach} gymName={defaultGym?.name ?? null} gyms={gyms} />
                )}
                {coachRun ? (
                  <Disclosure summary="How to run it" variant="footer">
                    <CoachRunDetails run={coachRun} programme={plan.runTarget} />
                  </Disclosure>
                ) : (
                  plan.runTarget &&
                  hasRunGuidance(plan.runTarget) && (
                    <Disclosure summary="How to run it" variant="footer">
                      <RunPlanDetails run={plan.runTarget} />
                    </Disclosure>
                  )
                )}
              </Card>
            )}

            {!day.includesLifting && (
              <Card>
                <CardHead
                  eyebrow={plan.runTarget ? undefined : position}
                  title={day.name}
                  subtitle={daySubtitle(day)}
                  note={dayNote(day)}
                  badge={plan.runTarget ? undefined : standing}
                />
                <CompleteRestButton
                  dayIndex={day.dayIndex}
                  label={day.includesRun ? "Mark done" : "Mark rest day done"}
                />
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

            {/* Everything that is not the day's own decision, one tap behind one control. */}
            <MoreOptions
              gymId={defaultGym?.id ?? null}
              skip={restDay ? null : { dayIndex: day.dayIndex, dayName: day.name }}
              coach={
                coach
                  ? {
                      gyms: coachGyms,
                      requestsLeft: coach.requestsLeft,
                      pending: coach.pending !== null,
                      hasPlan: coach.plan !== null,
                    }
                  : null
              }
            />
          </>
        )}

        {/* The programme in a sentence, and the way into all of it. */}
        {plan && (
          <Link
            href="/settings/programme"
            className="block box space-y-2 panel-padding transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                  Programme
                </p>
                <p className="mt-1 font-medium [overflow-wrap:anywhere]">{plan.program.name}</p>
              </div>
              <ChevronRight className="mt-0.5 size-5 shrink-0 text-ink-subtle" aria-hidden />
            </div>
            <ProgressBar
              value={plan.progress.completed}
              max={plan.progress.total}
              label={`${plan.progress.completed} of ${plan.progress.total} sessions done`}
            />
            <p className="text-xs text-ink-muted tabular-nums">
              {plan.progress.completed} of {plan.progress.total} sessions ·{" "}
              {plan.progress.remaining} to go
              {plan.progress.skipped > 0 && ` · ${plan.progress.skipped} skipped`}
            </p>
          </Link>
        )}
      </PageContent>
    </>
  );
}
