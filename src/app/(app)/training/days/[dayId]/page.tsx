import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StartPlannedButton } from "@/app/(app)/today/plan-actions";
import { Fact, MetaLine, PlanRows } from "@/app/(app)/today/today-parts";
import { planRows } from "@/app/(app)/today/today-model";
import { liftingStartOption } from "@/app/(app)/today/choose/start-option";
import { Art } from "@/components/art/art";
import { FreshAfterSets } from "@/components/fresh-after-sets";
import { hasRunGuidance, RunPlanDetails, runSummary } from "@/components/run-plan";
import { BackLink } from "@/components/shell/back-link";
import { LoadingPage } from "@/components/shell/loading-page";
import { Figures } from "@/components/ui/figures";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { setLengthFor } from "@/lib/distance-units";
import { holdFigures } from "@/lib/facts";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getWarmupProtocol } from "@/server/queries/reference";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { resolvePlannedDay } from "@/server/repositories/availability";
import { listGyms } from "@/server/repositories/gyms";
import { getProgramOverview, getSchedule } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { requireUuid } from "@/server/validation/params";

import {
  atGymLines,
  dayPageMaxModule,
  dayPrintLabel,
  programmeDayParts,
  runLeads,
} from "../../programme-day";

export const metadata: Metadata = { title: "Programme day" };

/**
 * A day of the programme, read before it is trained (board Programme day): its print, its name
 * and focus, how long and how hard, then its rows in the order the day asks for them, the run
 * where the day puts it, the warm-up, each exercise with its prescription. Start workout starts
 * this day at the default gym, as Train another day does; a day already done is done again as
 * its next cycle's. While a workout is open nothing starts another: the session strip is the way
 * back to it. A rest day says what it is, as Today does.
 */
export default async function ProgrammeDayPage(props: PageProps<"/training/days/[dayId]">) {
  const { dayId } = await props.params;
  requireUuid(dayId);
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  // The day being trained inks its sets as they are logged: a copy older than the latest set is
  // drawn again.
  const seen = await seenSetChanges();
  const [inProgress, data] = await Promise.all([
    // The per-request read the session strip also makes.
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => {
        const [overview, schedule, gyms, runUnits] = await Promise.all([
          getProgramOverview(tx, user.id, profile.timeZone, { prints: true }),
          getSchedule(tx, user.id),
          listGyms(tx, user.id),
          readSportUnits(tx, user.id),
        ]);
        const plan = overview?.days.find((day) => day.day.id === dayId) ?? null;
        const gym = gyms.find((each) => each.isActive && each.isDefault) ?? null;
        const [warmup, resolved] = await Promise.all([
          plan?.day.warmupProtocolId ? getWarmupProtocol(tx, plan.day.warmupProtocolId) : null,
          // What Start would do with each exercise at the default gym, as starting it resolves
          // them: read-only, and only for a day that lifts.
          plan?.day.includesLifting && gym
            ? resolvePlannedDay(tx, user.id, gym.id, plan.day.id, {
                id: gym.id,
                kind: gym.kind,
                name: gym.name,
              })
            : null,
        ]);
        return {
          overview,
          plan,
          warmup,
          runUnits,
          start:
            plan && overview && schedule
              ? liftingStartOption(schedule.state, overview.currentCycle, plan.day.dayIndex)
              : null,
          defaultGymId: gym?.id ?? null,
          atGym: gym && resolved ? atGymLines(resolved, gym.name) : new Map<string, string>(),
        };
      },
      { readOnly: true },
    ),
  ]);
  // A day of a programme since replaced, or of someone else's, is not one of this cycle's.
  if (!data.overview || !data.plan) notFound();
  const { plan, warmup, start } = data;
  const { day } = plan;
  const drills = warmup?.drills.length ?? 0;
  // The programme's own rows carry no load, so no unit is written into them. Each says what it
  // becomes at the default gym where that is not itself.
  const rows = planRows(plan.exercises, null, "", setLengthFor(profile)).map((row) => ({
    ...row,
    at: data.atGym.get(row.key) ?? null,
  }));
  const open = inProgress !== null && inProgress.programDayId === day.id;
  // The day is drawn as its workout draws it: the one being trained, its sets and its warm-up
  // inked as they are done, else the one that did it this cycle.
  const parts = programmeDayParts(plan, {
    drills,
    warmup: true,
    session: open ? inProgress.print : plan.print,
  });
  const rest = !day.includesLifting && !day.includesRun;
  // A day that lifts and runs puts the run where the day is written to: "Lower + easy run" last.
  const runFirst = !day.includesLifting || runLeads(day);

  const runRow = day.includesRun && (
    <li className={runFirst ? "plan-row" : "plan-row plan-row-last"}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="plan-row-name">Run</span>
        {plan.run && (
          <span className="type-meta-small [overflow-wrap:break-word] text-ink-2 tabular-nums">
            {runSummary(plan.run, data.runUnits)}
          </span>
        )}
      </span>
    </li>
  );

  return (
    <FreshAfterSets seen={seen} loading={<LoadingPage />}>
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
              label={dayPrintLabel(plan, parts, drills, open)}
              // A rest day's crescent alone stands quiet, not as tall as the band.
              maxModule={dayPageMaxModule(parts)}
              className="size-full"
            />
          </figure>
        )}
        <FitTitle as="h1" sizes={{ base: 34, narrow: 30 }} className="mt-3">
          {day.name}
        </FitTitle>
        {day.focus && <p className="mt-0.5 type-meta text-ink-2">{day.focus}</p>}
        {(day.timeNote || day.effortNote || open) && (
          <MetaLine className="mt-0.5">
            {open && <Fact glyph="play">In progress</Fact>}
            {day.timeNote && (
              <Fact glyph="rest" label="Time">
                <Figures>{holdFigures(day.timeNote)}</Figures>
              </Fact>
            )}
            {day.effortNote && <Fact>{day.effortNote}</Fact>}
          </MetaLine>
        )}

        {/* A rest day asks for nothing but rest, and the routine when it has one (ADR 0005). */}
        {rest &&
          (plan.status === "completed" ? (
            <p className="mt-3 flex items-start gap-2 type-body">
              <Glyph name="check" className="mt-0.5 glyph-18" />
              <span>Rest day done.</span>
            </p>
          ) : (
            <p className="mt-3 type-body text-ink-2">
              {warmup ? "Nothing to train but its routine." : "Nothing to train."} Today offers to
              mark it done, and starting the next workout passes it.
            </p>
          ))}

        <ul aria-label={day.name} className="mt-2">
          {runFirst && runRow}
          {warmup && (
            <li
              className={
                rows.length === 0 && (runFirst || !day.includesRun)
                  ? "plan-row plan-row-last"
                  : "plan-row"
              }
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="plan-row-name">{warmup.name}</span>
                <span className="type-meta-small text-ink-2 tabular-nums">
                  {drills} {drills === 1 ? "drill" : "drills"}
                </span>
              </span>
            </li>
          )}
          <PlanRows rows={rows} isLast={runFirst} />
          {!runFirst && runRow}
        </ul>

        {/* How to run it, once the time and effort are said; and the day's own notes. */}
        {plan.run && hasRunGuidance(plan.run) && (
          <div className="mt-3">
            <RunPlanDetails run={plan.run} />
          </div>
        )}
        {day.notes && (
          <p className="mt-3 type-meta [overflow-wrap:break-word] whitespace-pre-wrap text-ink-2">
            {day.notes}
          </p>
        )}

        {/* One workout at a time: while one is open, this day starts nothing (Today's rule). */}
        {inProgress && !open && start && (
          <p className="mt-3 type-meta text-ink-2">
            Finish or discard your open session to start this one.
          </p>
        )}
        {!inProgress && start && (
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
    </FreshAfterSets>
  );
}
