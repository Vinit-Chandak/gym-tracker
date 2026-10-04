import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StartPlannedButton } from "@/app/(app)/today/plan-actions";
import { Fact, MetaLine, PlanRows } from "@/app/(app)/today/today-parts";
import { planRows } from "@/app/(app)/today/today-model";
import { liftingStartOption } from "@/app/(app)/today/choose/start-option";
import { Art } from "@/components/art/art";
import { hasRunGuidance, RunPlanDetails, runSummary } from "@/components/run-plan";
import { BackLink } from "@/components/shell/back-link";
import { FitTitle } from "@/components/ui/fit-title";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getWarmupProtocol } from "@/server/queries/reference";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { getProgramOverview, getSchedule } from "@/server/repositories/schedule";
import { requireUuid } from "@/server/validation/params";

import { programmeDayParts } from "../../programme-day";

export const metadata: Metadata = { title: "Programme day" };

/**
 * A day of the programme, read before it is trained (board Programme day): its print, its name
 * and focus, how long and how hard, then its rows in the order the day asks for them, the run,
 * the warm-up, each exercise with its prescription. Start workout starts this day at the
 * default gym, as Train another day does; a day already done starts its next cycle's.
 */
export default async function ProgrammeDayPage(props: PageProps<"/training/days/[dayId]">) {
  const { dayId } = await props.params;
  requireUuid(dayId);
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [overview, schedule, gyms] = await Promise.all([
        getProgramOverview(tx, user.id, profile.timeZone),
        getSchedule(tx, user.id),
        listGyms(tx, user.id),
      ]);
      const plan = overview?.days.find((day) => day.day.id === dayId) ?? null;
      const warmup = plan?.day.warmupProtocolId
        ? await getWarmupProtocol(tx, plan.day.warmupProtocolId)
        : null;
      return {
        overview,
        plan,
        warmup,
        start:
          plan && overview && schedule
            ? liftingStartOption(schedule.state, overview.currentCycle, plan.day.dayIndex)
            : null,
        defaultGymId: gyms.find((gym) => gym.isActive && gym.isDefault)?.id ?? null,
      };
    },
    { readOnly: true },
  );
  // A day of a programme since replaced, or of someone else's, is not one of this cycle's.
  if (!data.overview || !data.plan) notFound();
  const { plan, warmup, start } = data;
  const { day } = plan;
  const drills = warmup?.drills.length ?? 0;
  // The programme's own rows carry no load, so no unit is written into them.
  const rows = planRows(plan.exercises, null, "");
  const parts = programmeDayParts(plan, { drills, warmup: true });
  const exercises = plan.exercises.length;

  return (
    <>
      <header className="page-header page-width pt-safe">
        <div className="page-header-bar">
          <BackLink fallback="/training" />
        </div>
      </header>
      <div className="page-width pb-8">
        {parts.length > 0 && (
          <figure className="programme-day-print">
            <Art
              kind="print"
              parts={parts}
              label={`${day.name}: ${[
                plan.run ? "the run" : null,
                drills > 0 ? (day.includesLifting ? "the warm-up" : "the routine") : null,
                exercises > 0 ? `${exercises} ${exercises === 1 ? "exercise" : "exercises"}` : null,
              ]
                .filter(Boolean)
                .join(", ")}${plan.status === "completed" ? ", done" : ""}`}
              className="size-full"
            />
          </figure>
        )}
        <FitTitle as="h1" sizes={{ base: 34, narrow: 30 }} className="mt-3">
          {day.name}
        </FitTitle>
        {day.focus && <p className="mt-0.5 type-meta text-ink-2">{day.focus}</p>}
        {(day.timeNote || day.effortNote) && (
          <MetaLine className="mt-0.5">
            {day.timeNote && (
              <Fact glyph="rest" label="Time">
                {day.timeNote}
              </Fact>
            )}
            {day.effortNote && <Fact>{day.effortNote}</Fact>}
          </MetaLine>
        )}

        <ul aria-label={day.name} className="mt-2">
          {plan.day.includesRun && (
            <li className="plan-row">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="plan-row-name">Run</span>
                {plan.run && (
                  <span className="type-meta-small [overflow-wrap:anywhere] text-ink-2 tabular-nums">
                    {runSummary(plan.run)}
                  </span>
                )}
              </span>
            </li>
          )}
          {warmup && (
            <li className={rows.length === 0 ? "plan-row plan-row-last" : "plan-row"}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="plan-row-name">{warmup.name}</span>
                <span className="type-meta-small text-ink-2 tabular-nums">
                  {drills} {drills === 1 ? "drill" : "drills"}
                </span>
              </span>
            </li>
          )}
          <PlanRows rows={rows} />
        </ul>

        {/* How to run it, once the time and effort are said; and the day's own notes. */}
        {plan.run && hasRunGuidance(plan.run) && (
          <div className="mt-3">
            <RunPlanDetails run={plan.run} />
          </div>
        )}
        {day.notes && (
          <p className="mt-3 type-meta [overflow-wrap:anywhere] whitespace-pre-wrap text-ink-2">
            {day.notes}
          </p>
        )}

        {start && (
          <PinnedActions stack>
            <StartPlannedButton
              gymId={data.defaultGymId}
              programDayId={day.id}
              dayIndex={day.dayIndex}
              fromCycleIndex={start.cycleIndex}
              label={start.label === "Start" ? "Start workout" : start.label}
              glyph="play"
            />
          </PinnedActions>
        )}
      </div>
    </>
  );
}
