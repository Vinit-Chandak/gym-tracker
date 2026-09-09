import type { Metadata } from "next";
import Link from "@/components/ui/app-link";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { warmupProtocols } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { rangeLabel } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { getTodayPlan, type PlannedExercisePreview } from "@/server/repositories/schedule";
import { getInProgressSession } from "@/server/repositories/sessions";
import { eq } from "drizzle-orm";

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
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
    const [gyms, inProgress, plan] = await Promise.all([
      listGyms(tx, user.id),
      getInProgressSession(tx, user.id),
      getTodayPlan(tx, user.id, profile.timeZone),
    ]);
    const restProtocol =
      plan?.suggestedDay && !plan.suggestedDay.includesLifting && plan.suggestedDay.warmupProtocolId
        ? ((
            await tx
              .select({ name: warmupProtocols.name, drills: warmupProtocols.drills })
              .from(warmupProtocols)
              .where(eq(warmupProtocols.id, plan.suggestedDay.warmupProtocolId))
              .limit(1)
          )[0] ?? null)
        : null;
    return { profile, gyms, inProgress, plan, restProtocol };
  });
  const { profile, gyms, inProgress, plan, restProtocol } = data;
  const activeGyms = gyms
    .filter((gym) => gym.isActive)
    .map((gym) => ({ id: gym.id, name: gym.name, kind: gym.kind, isDefault: gym.isDefault }));
  const defaultGym = activeGyms.find((gym) => gym.isDefault) ?? null;

  return (
    <>
      <PageHeader title="Today" />
      <PageContent className="max-w-3xl">
        {activeGyms.length === 0 ? (
          <Card>
            <h2 className="text-lg font-semibold">Add a gym to start training</h2>
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

        {inProgress && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{inProgress.dayName ?? "Ad hoc session"}</h2>
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
            {inProgress.setCount === 0 && <DiscardSessionButton sessionId={inProgress.id} />}
          </Card>
        )}

        {!inProgress && !plan && (
          <Card>
            <h2 className="text-lg font-semibold">No active programme</h2>
            <p className="text-sm text-ink-muted">
              Pick a programme and Today will tell you what to train next. You can also just start a
              session and choose exercises as you go.
            </p>
            <LinkButton href="/settings/programme" size="lg" className="w-full">
              Choose a programme
            </LinkButton>
            <StartAdHocButton gymId={defaultGym?.id ?? null} />
          </Card>
        )}

        {!inProgress && plan && !plan.suggestion && (
          <Card>
            <h2 className="text-lg font-semibold">Programme complete</h2>
            <p className="text-sm text-ink-muted">
              All {plan.progress.total} sessions of {plan.program.name} are done. The next block can
              be planned as a new programme version.
            </p>
            <StartAdHocButton gymId={defaultGym?.id ?? null} />
          </Card>
        )}

        {!inProgress && plan && plan.suggestion && plan.suggestedDay && (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">
                  Cycle {plan.suggestion.slot.cycleIndex} of {plan.program.weeks} · day{" "}
                  {plan.suggestedDay.dayIndex}
                </p>
                <h2 className="text-xl font-semibold">{plan.suggestedDay.name}</h2>
                {plan.suggestedDay.focus && (
                  <p className="text-sm text-ink-muted">{plan.suggestedDay.focus}</p>
                )}
              </div>
              {plan.behind > 0 ? (
                <Badge tone="warning">{plan.behind} behind</Badge>
              ) : (
                <Badge tone="success">On track</Badge>
              )}
            </div>

            {(plan.suggestedDay.timeNote || plan.suggestedDay.effortNote) && (
              <p className="text-sm text-ink-muted">
                {[plan.suggestedDay.timeNote, plan.suggestedDay.effortNote, plan.suggestedDay.notes]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            {plan.runTarget && (
              <div className="border-l-2 border-accent/50 py-1 pl-3 text-sm">
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

            {plan.suggestedExercises.length > 0 && (
              <ul className="divide-y divide-line">
                {plan.suggestedExercises.map((exercise) => (
                  <li
                    key={exercise.programExerciseId}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5"
                  >
                    <span className="min-w-0 text-sm">
                      {exercise.name}
                      {exercise.supersetGroup && (
                        <span className="text-ink-subtle"> · superset</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                      {prescription(exercise)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

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

            {plan.suggestedDay.includesLifting ? (
              <StartPlannedButton
                gymId={defaultGym?.id ?? null}
                programDayId={plan.suggestedDay.id}
                dayIndex={plan.suggestedDay.dayIndex}
                label={`Start ${plan.suggestedDay.name}`}
              />
            ) : plan.nextTrainingDay ? (
              <StartPlannedButton
                gymId={defaultGym?.id ?? null}
                programDayId={plan.nextTrainingDay.id}
                dayIndex={plan.nextTrainingDay.dayIndex}
                label={`Start next: ${plan.nextTrainingDay.name}`}
              />
            ) : null}
            {!plan.suggestedDay.includesLifting && (
              <CompleteRestButton dayIndex={plan.suggestedDay.dayIndex} />
            )}
            {defaultGym === null && (
              <p className="text-sm text-ink-muted">
                Choose a default gym above to start a session.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <LinkButton href="/today/choose" variant="secondary" className="w-full">
                Another day
              </LinkButton>
              <StartAdHocButton gymId={defaultGym?.id ?? null} />
            </div>
            {plan.suggestedDay.includesLifting && (
              <SkipSlotButton
                dayIndex={plan.suggestedDay.dayIndex}
                dayName={plan.suggestedDay.name}
              />
            )}

            <p className="text-center text-xs text-ink-subtle">
              {plan.progress.completed} done · {plan.progress.skipped} skipped ·{" "}
              {plan.progress.remaining} to go
              {plan.projectedEnd ? ` · projected end ${formatIsoDate(plan.projectedEnd)}` : ""}
            </p>
          </Card>
        )}

        <Link
          href="/history"
          className="mx-auto flex min-h-11 items-center justify-center px-4 text-sm text-ink-subtle underline-offset-2 hover:underline"
        >
          Past sessions
        </Link>
      </PageContent>
    </>
  );
}
