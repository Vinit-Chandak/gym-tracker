import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { InfoTip } from "@/components/ui/info-tip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { planLine, type StoredPlanExercise } from "@/domain/session-plan";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { LOAD_UNIT_LABELS, rangeLabel } from "@/lib/labels";
import { supersetHues, supersetStyle } from "@/lib/superset-colors";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getWarmupProtocol } from "@/server/queries/reference";
import { getRequestProfile } from "@/server/queries/request-profile";
import { todayCoachState, type TodayCoachState } from "@/server/repositories/coach-plans";
import { listGyms } from "@/server/repositories/gyms";
import {
  getTodayPlan,
  type PlannedExercisePreview,
  type RunTarget,
  type ScheduleDay,
} from "@/server/repositories/schedule";

import { CoachPending, CoachRequestButton, type CoachGym } from "./coach-actions";
import { GymSwitcher } from "./gym-switcher";
import {
  CompleteRestButton,
  DiscardSessionButton,
  SkipSlotButton,
  StartAdHocButton,
  StartPlannedButton,
} from "./plan-actions";

export const metadata: Metadata = { title: "Today" };

function prescription(e: PlannedExercisePreview): string {
  const volume =
    e.prescriptionType === "duration"
      ? `${e.sets} × ${rangeLabel(e.durationMinSeconds, e.durationMaxSeconds, " s")}`
      : `${e.sets} × ${rangeLabel(e.repMin, e.repMax)}`;
  return `${volume}${e.perSide ? " per side" : ""} @ ${rangeLabel(e.rirMin, e.rirMax)} RIR`;
}

/** A card's first line: what it is, and the day's standing beside the first card only. */
function CardTitle({
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
        <h2 className="flex items-center gap-1 text-lg font-medium [overflow-wrap:anywhere]">
          {title}
          {note && <InfoTip label={`About ${title}`}>{note}</InfoTip>}
        </h2>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {badge}
    </div>
  );
}

/** The day's exercises, folded: the names and prescriptions are there when wanted. */
function PlannedExercises({ exercises }: { exercises: PlannedExercisePreview[] }) {
  const hues = supersetHues(exercises);
  return (
    <Disclosure summary="Exercises" meta={String(exercises.length)}>
      <ul className="ruled-list">
        {exercises.map((exercise) => {
          const hue = exercise.supersetGroup ? hues.get(exercise.supersetGroup) : undefined;
          return (
            <li
              key={exercise.programExerciseId}
              // Supersets share a colour, not a caption: the rule says which rows go together.
              className={cn(
                "flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2",
                hue && "superset-row",
              )}
              style={hue ? supersetStyle(hue) : undefined}
            >
              <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{exercise.name}</span>
              <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                {prescription(exercise)}
              </span>
            </li>
          );
        })}
      </ul>
    </Disclosure>
  );
}

/** The coach's lines for the day: what to do, on what, and the numbers, one row each. */
function CoachPlanLines({
  exercises,
  planned,
  unit,
}: {
  exercises: StoredPlanExercise[];
  planned: PlannedExercisePreview[];
  unit: string;
}) {
  return (
    <ul className="ruled-list">
      {exercises.map((entry, index) => {
        const slot = entry.slotId
          ? planned.find((e) => e.programExerciseId === entry.slotId)
          : undefined;
        const substituted =
          entry.action === "substitute" && slot && slot.name !== entry.exerciseName;
        const dropped = entry.action === "drop";
        return (
          <li key={`${entry.slotId ?? "added"}-${index}`} className="space-y-0.5 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span
                className={cn(
                  "min-w-0 text-sm [overflow-wrap:anywhere]",
                  dropped && "text-ink-subtle line-through",
                )}
              >
                {dropped ? (slot?.name ?? entry.exerciseName) : entry.exerciseName}
                {substituted && <span className="text-ink-muted"> · for {slot.name}</span>}
                {!dropped && entry.equipmentInstanceName && (
                  <span className="text-ink-muted"> · {entry.equipmentInstanceName}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                {dropped ? "Skip today" : (planLine(entry, unit) ?? "By the rule")}
              </span>
            </div>
            {entry.note && <p className="text-xs text-ink-muted">{entry.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What the coach has to say about the day: the plan when there is one for this gym, a
 * note when it was made for another, and the way to ask for one either way.
 */
function CoachSection({
  coach,
  gyms,
  gymName,
  planned,
  unit,
}: {
  coach: TodayCoachState;
  gyms: CoachGym[];
  /** The gym the athlete is about to train at. */
  gymName: string | null;
  planned: PlannedExercisePreview[];
  unit: string;
}) {
  if (coach.pending) {
    const gym = gyms.find((g) => g.id === coach.pending?.gymId)?.name ?? gymName ?? "your gym";
    return <CoachPending startedAt={coach.pending.requestedAt.toISOString()} gymName={gym} />;
  }
  if (coach.plan && coach.matchesGym) {
    return (
      <>
        <p className="text-sm">
          <Badge tone="accent">Coach</Badge>{" "}
          <span className="align-middle">{coach.plan.summary}</span>
        </p>
        <Disclosure summary="Plan" meta={String(coach.plan.exercises.length)} defaultOpen>
          <CoachPlanLines exercises={coach.plan.exercises} planned={planned} unit={unit} />
        </Disclosure>
        {coach.plan.warmup.length > 0 && (
          <Disclosure summary="Warm-up" meta={String(coach.plan.warmup.length)}>
            <ol className="space-y-1 text-sm">
              {coach.plan.warmup.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ol>
          </Disclosure>
        )}
        <CoachRequestButton
          gyms={gyms}
          label="Re-plan"
          variant="ghost"
          requestsLeft={coach.requestsLeft}
        />
      </>
    );
  }
  if (coach.plan) {
    return (
      <>
        <p className="text-sm text-ink-muted">
          The coach planned this for {coach.plan.gymName}
          {gymName ? `, not ${gymName}` : ""}. Without a re-plan the rule sets the targets.
        </p>
        <CoachRequestButton
          gyms={gyms}
          label={gymName ? `Re-plan for ${gymName}` : "Re-plan"}
          requestsLeft={coach.requestsLeft}
        />
      </>
    );
  }
  return (
    <CoachRequestButton
      gyms={gyms}
      label="Ask the coach for a plan"
      requestsLeft={coach.requestsLeft}
    />
  );
}

function runSummary(run: RunTarget): string {
  const duration = rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min");
  return run.rpeMin !== null ? `${duration} · RPE ${rangeLabel(run.rpeMin, run.rpeMax)}` : duration;
}

/** What the programme says about the day, gathered for one tip rather than one line each. */
function dayNote(day: ScheduleDay): string | null {
  const parts = [day.timeNote, day.effortNote, day.notes].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function TodayPage() {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  // The active session comes from the shared per-request read the resume strip also uses,
  // so Today and the shell agree on one session without asking the database twice.
  const inProgress = await getActiveSession(user.id);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
    const [gyms, plan] = await Promise.all([
      listGyms(tx, user.id),
      getTodayPlan(tx, user.id, profile.timeZone),
    ]);
    const restProtocol =
      plan?.suggestedDay && !plan.suggestedDay.includesLifting && plan.suggestedDay.warmupProtocolId
        ? await getWarmupProtocol(tx, plan.suggestedDay.warmupProtocolId)
        : null;
    // The coach plans the next lifting slot: today's, or the one after a rest day.
    const coachRef = plan?.suggestion
      ? plan.suggestedDay?.includesLifting
        ? plan.suggestion.slot
        : plan.nextTrainingDay
          ? { cycleIndex: plan.nextTrainingDay.cycleIndex, dayIndex: plan.nextTrainingDay.dayIndex }
          : null
      : null;
    const coach =
      plan && coachRef && profile.aiCoachEnabled
        ? await todayCoachState(tx, user.id, {
            enabled: true,
            timeZone: profile.timeZone,
            programId: plan.program.id,
            ref: coachRef,
            gymId: gyms.find((g) => g.isActive && g.isDefault)?.id ?? null,
          })
        : null;
    return { profile, gyms, plan, restProtocol, coach };
  });
  const { profile, gyms, plan, restProtocol, coach } = data;
  const activeGyms = gyms
    .filter((gym) => gym.isActive)
    .map((gym) => ({ id: gym.id, name: gym.name, kind: gym.kind, isDefault: gym.isDefault }));
  const defaultGym = activeGyms.find((gym) => gym.isDefault) ?? null;
  const day = plan?.suggestedDay ?? null;
  const restDay = day !== null && !day.includesLifting;
  const coachGyms: CoachGym[] = activeGyms
    .filter((gym) => gym.kind === "gym")
    .map((gym) => ({ id: gym.id, name: gym.name, isDefault: gym.isDefault }));
  const unit = LOAD_UNIT_LABELS[profile.preferredUnit];
  const coachSection =
    coach && plan ? (
      <CoachSection
        coach={coach}
        gyms={coachGyms}
        gymName={defaultGym?.name ?? null}
        planned={plan.suggestedExercises}
        unit={unit}
      />
    ) : null;
  // The coach's plan lists the day's exercises itself; the programme list stays for the rest.
  const showsProgrammeList = !(coach?.plan && coach.matchesGym && !coach.pending);

  const standing =
    plan && plan.behind > 0 ? (
      <Badge tone="warning">{plan.behind} behind</Badge>
    ) : (
      <Badge tone="success">On track</Badge>
    );

  return (
    <>
      <PageHeader title="Today" />
      <PageContent>
        {/* Where you are training. Once a session starts the gym is fixed, and its own
            screens carry it, so this row is about the next session, not the current one. */}
        {activeGyms.length === 0 ? (
          <Card>
            <h2 className="text-lg font-medium">Add a gym to start training</h2>
            <LinkButton href="/gyms/new" size="lg" className="w-full">
              Add your first gym
            </LinkButton>
          </Card>
        ) : (
          <GymSwitcher gyms={activeGyms} />
        )}

        {inProgress ? (
          <Card>
            <CardTitle
              title={inProgress.dayName ?? "Ad hoc session"}
              subtitle={`${inProgress.gymName} · ${formatDateTime(inProgress.startedAt, profile.timeZone)} · ${inProgress.setCount} ${inProgress.setCount === 1 ? "set" : "sets"}`}
              badge={<Badge tone="accent">In progress</Badge>}
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
            <CardTitle
              title="Programme complete"
              subtitle={`${plan.program.name} · ${plan.progress.total} sessions`}
            />
            <LinkButton href="/settings/programme" size="lg" className="w-full">
              Plan the next block
            </LinkButton>
            <StartAdHocButton gymId={defaultGym?.id ?? null} />
          </Card>
        ) : (
          <>
            {/*
              One card per thing to do. A day that has a run and a lifting session is two
              cards, each with its own plan folded inside and its own action, so starting the
              workout never looks like it starts the run.
            */}
            {day.includesLifting && (
              <Card>
                <CardTitle
                  title={day.name}
                  subtitle={day.focus}
                  note={dayNote(day)}
                  badge={standing}
                />
                {coachSection}
                {showsProgrammeList && plan.suggestedExercises.length > 0 && (
                  <PlannedExercises exercises={plan.suggestedExercises} />
                )}
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
              </Card>
            )}

            {plan.runTarget && (
              <Card>
                <CardTitle
                  title="Easy run"
                  subtitle={runSummary(plan.runTarget)}
                  badge={day.includesLifting ? undefined : standing}
                />
                {(plan.runTarget.paceNote ||
                  plan.runTarget.progressionNote ||
                  plan.runTarget.shinRule) && (
                  <Disclosure summary="Plan">
                    <dl className="space-y-1 text-sm">
                      {(
                        [
                          ["Pace", plan.runTarget.paceNote],
                          ["Progression", plan.runTarget.progressionNote],
                          ["Shins", plan.runTarget.shinRule],
                        ] as const
                      )
                        .filter(([, value]) => value)
                        .map(([label, value]) => (
                          <div key={label} className="flex justify-between gap-3">
                            <dt className="shrink-0 text-ink-muted">{label}</dt>
                            <dd className="text-right">{value}</dd>
                          </div>
                        ))}
                    </dl>
                  </Disclosure>
                )}
                <LinkButton
                  href="/runs/new"
                  variant={day.includesLifting ? "secondary" : "primary"}
                  size="lg"
                  className="w-full"
                >
                  Log run
                </LinkButton>
              </Card>
            )}

            {!day.includesLifting && (
              <Card>
                <CardTitle
                  title={day.name}
                  subtitle={day.focus}
                  note={dayNote(day)}
                  badge={plan.runTarget ? undefined : standing}
                />
                {restProtocol && (
                  <Disclosure summary={restProtocol.name} meta={String(restProtocol.drills.length)}>
                    <ul className="text-sm ruled-list">
                      {restProtocol.drills.map((drill) => (
                        <li key={drill.order} className="flex justify-between gap-3 py-1.5">
                          <span className="min-w-0">{drill.name}</span>
                          <span className="shrink-0 text-ink-muted">{drill.dose}</span>
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}
                <CompleteRestButton
                  dayIndex={day.dayIndex}
                  label={day.includesRun ? "Mark done" : "Mark rest day done"}
                />
                {/* Resting is the suggestion, not a rule: the next lifting day stays one
                    tap away rather than only through "Another day". */}
                {plan.nextTrainingDay && (
                  <>
                    {coachSection}
                    <StartPlannedButton
                      gymId={defaultGym?.id ?? null}
                      programDayId={plan.nextTrainingDay.id}
                      dayIndex={plan.nextTrainingDay.dayIndex}
                      variant="secondary"
                      label={`Start ${plan.nextTrainingDay.name} instead`}
                    />
                  </>
                )}
              </Card>
            )}
          </>
        )}

        {/* Alternate ways in, after the day's own decision rather than beside it. */}
        {!inProgress && plan && day && (
          <div className="space-y-2">
            <div className="action-row">
              <LinkButton href="/today/choose" variant="secondary" className="w-full">
                Another day
              </LinkButton>
              <StartAdHocButton gymId={defaultGym?.id ?? null} />
            </div>
            {/* A rest day is completed, not skipped; only a lifting day can be skipped. */}
            {!restDay && <SkipSlotButton dayIndex={day.dayIndex} dayName={day.name} />}
          </div>
        )}

        {plan && (
          <Disclosure
            summary="Programme"
            meta={`${plan.progress.remaining} to go`}
            className="border-b-0"
          >
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Programme</dt>
                <dd className="text-right">{plan.program.name}</dd>
              </div>
              {plan.suggestion && day && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Position</dt>
                  <dd className="text-right tabular-nums">
                    Cycle {plan.suggestion.slot.cycleIndex} of {plan.program.weeks} · day{" "}
                    {day.dayIndex}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Sessions</dt>
                <dd className="text-right tabular-nums">
                  {plan.progress.completed} done · {plan.progress.skipped} skipped ·{" "}
                  {plan.progress.remaining} to go
                </dd>
              </div>
              {plan.projectedEnd && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Projected end</dt>
                  <dd className="text-right tabular-nums">{formatIsoDate(plan.projectedEnd)}</dd>
                </div>
              )}
            </dl>
          </Disclosure>
        )}
      </PageContent>
    </>
  );
}
