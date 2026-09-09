import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { rangeLabel } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getWarmupProtocol } from "@/server/queries/reference";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { getTodayPlan, type PlannedExercisePreview } from "@/server/repositories/schedule";

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
    return { profile, gyms, plan, restProtocol };
  });
  const { profile, gyms, plan, restProtocol } = data;
  const activeGyms = gyms
    .filter((gym) => gym.isActive)
    .map((gym) => ({ id: gym.id, name: gym.name, kind: gym.kind, isDefault: gym.isDefault }));
  const defaultGym = activeGyms.find((gym) => gym.isDefault) ?? null;
  const day = plan?.suggestedDay ?? null;
  const restDay = day !== null && !day.includesLifting;

  return (
    <>
      <PageHeader title="Today" />
      <PageContent>
        {/* Where you are training. Once a session starts the gym is fixed, and its own
            screens carry it, so this row is about the next session, not the current one. */}
        {activeGyms.length === 0 ? (
          <Card>
            <h2 className="text-lg font-medium">Add a gym to start training</h2>
            <p className="text-sm text-ink-muted">
              Sessions belong to a place, so machine history is never mixed between gyms. Add where
              you train and Today comes to life.
            </p>
            <LinkButton href="/gyms/new" size="lg" className="w-full">
              Add your first gym
            </LinkButton>
          </Card>
        ) : (
          <GymSwitcher gyms={activeGyms} />
        )}

        {inProgress ? (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-lg font-medium [overflow-wrap:anywhere]">
                {inProgress.dayName ?? "Ad hoc session"}
              </h2>
              <Badge tone="accent">In progress</Badge>
            </div>
            <p className="text-sm text-ink-muted">
              {inProgress.gymName} · started{" "}
              {formatDateTime(inProgress.startedAt, profile.timeZone)} · {inProgress.setCount}{" "}
              {inProgress.setCount === 1 ? "set" : "sets"} logged
            </p>
            <LinkButton href={`/workouts/${inProgress.id}`} size="lg" className="w-full">
              Resume session
            </LinkButton>
            {/* A session that has recorded something is finished, never discarded. */}
            {inProgress.setCount === 0 && <DiscardSessionButton sessionId={inProgress.id} />}
          </Card>
        ) : !plan ? (
          <Card>
            <h2 className="text-lg font-medium">No active programme</h2>
            <p className="text-sm text-ink-muted">
              Pick a programme and Today will tell you what to train next. You can also just start a
              session and choose exercises as you go.
            </p>
            <LinkButton href="/settings/programme" size="lg" className="w-full">
              Choose a programme
            </LinkButton>
            <StartAdHocButton gymId={defaultGym?.id ?? null} />
          </Card>
        ) : !plan.suggestion || !day ? (
          <Card>
            <h2 className="text-lg font-medium">Programme complete</h2>
            <p className="text-sm text-ink-muted">
              All {plan.progress.total} sessions of {plan.program.name} are done. The next block can
              be planned as a new programme version.
            </p>
            <LinkButton href="/settings/programme" size="lg" className="w-full">
              Plan the next block
            </LinkButton>
            <StartAdHocButton gymId={defaultGym?.id ?? null} />
          </Card>
        ) : (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-medium [overflow-wrap:anywhere]">{day.name}</h2>
                {day.focus && <p className="text-sm text-ink-muted">{day.focus}</p>}
              </div>
              {plan.behind > 0 ? (
                <Badge tone="warning">{plan.behind} behind</Badge>
              ) : (
                <Badge tone="success">On track</Badge>
              )}
            </div>

            {(day.timeNote || day.effortNote || day.notes) && (
              <p className="text-sm text-ink-muted">
                {[day.timeNote, day.effortNote, day.notes].filter(Boolean).join(" · ")}
              </p>
            )}

            {plan.runTarget && (
              <div className="border-l-2 border-accent py-1 pl-3 text-sm">
                <p className="font-medium">
                  Easy run:{" "}
                  {rangeLabel(
                    plan.runTarget.durationMinMinutes,
                    plan.runTarget.durationMaxMinutes,
                    " min",
                  )}
                  {plan.runTarget.rpeMin !== null
                    ? ` · RPE ${rangeLabel(plan.runTarget.rpeMin, plan.runTarget.rpeMax)}`
                    : ""}
                </p>
                <p className="text-ink-muted">
                  {[
                    plan.runTarget.paceNote,
                    plan.runTarget.progressionNote,
                    plan.runTarget.shinRule,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-ink-subtle">Logged from the Runs tab, not here.</p>
                  <LinkButton href="/runs/new" variant="secondary" size="sm">
                    Log the run
                  </LinkButton>
                </div>
              </div>
            )}

            {/* A rest day's instructions are the content, so they are not behind a
                disclosure: there is nothing else on the screen to compete with them. */}
            {restProtocol && (
              <div className="space-y-1">
                <p className="text-sm font-medium">{restProtocol.name}</p>
                <ul className="space-y-1 text-sm text-ink-muted">
                  {restProtocol.drills.map((drill) => (
                    <li key={drill.order}>
                      {drill.name} · {drill.dose}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {day.includesLifting ? (
              <StartPlannedButton
                gymId={defaultGym?.id ?? null}
                programDayId={day.id}
                dayIndex={day.dayIndex}
                label={`Start ${day.name}`}
              />
            ) : (
              <>
                <CompleteRestButton dayIndex={day.dayIndex} />
                {/* Resting is the suggestion, not a rule: the next lifting day stays one
                    tap away rather than only through "Another day". */}
                {plan.nextTrainingDay && (
                  <StartPlannedButton
                    gymId={defaultGym?.id ?? null}
                    programDayId={plan.nextTrainingDay.id}
                    dayIndex={plan.nextTrainingDay.dayIndex}
                    variant="secondary"
                    label={`Start next: ${plan.nextTrainingDay.name}`}
                  />
                )}
              </>
            )}
            {defaultGym === null && (
              <p className="text-sm text-ink-muted">
                Choose a default gym above to start a session.
              </p>
            )}
          </Card>
        )}

        {/* The full planned list, in document flow rather than behind the start button. */}
        {!inProgress && plan && day && plan.suggestedExercises.length > 0 && (
          <Section
            title="Planned exercises"
            action={
              <span className="text-xs text-ink-muted">{plan.suggestedExercises.length}</span>
            }
          >
            <ul className="border-y border-line ruled-list">
              {plan.suggestedExercises.map((exercise) => (
                <li
                  key={exercise.programExerciseId}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5"
                >
                  <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
                    {exercise.name}
                    {exercise.supersetGroup && <span className="text-ink-subtle"> · superset</span>}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                    {prescription(exercise)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Alternate ways in, after the day's own decision rather than beside it. */}
        {!inProgress && plan && day && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
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
