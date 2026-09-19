import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { runPlanLine } from "@/domain/session-plan";
import { toDateTimeLocal } from "@/lib/time";
import { LegacyUnavailable } from "@/components/activities/legacy-unavailable";
import { multisportRollout } from "@/lib/multisport-rollout";
import { saveRunAction } from "@/server/actions/runs";
import { occurrenceForLegacyPlannedRun } from "@/server/legacy-routes";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { plannedRunForToday } from "@/server/repositories/coach-plans";
import { listRuns, plannedRunsForCycle } from "@/server/repositories/runs";
import { getSchedule } from "@/server/repositories/schedule";

import { RunForm } from "../run-form";

export const metadata: Metadata = { title: "Log a run" };

export default async function NewRunPage(props: PageProps<"/runs/new">) {
  const shared = multisportRollout().sharedNavigation;
  // Today links straight at the run its offered day asks for, so the form opens on that plan
  // rather than on whichever planned run of the cycle happens to be unlogged.
  const { planned: plannedParam } = await props.searchParams;
  const requestedPlanId = typeof plannedParam === "string" ? plannedParam : null;
  const user = await requireUser();
  if (shared) {
    // `?planned=` names one exact plan. It resolves through the durable map or it does not
    // resolve at all: falling back to another plan would log the wrong session (AT-NAV-07).
    if (requestedPlanId) {
      const occurrenceId = await withUser(
        getDb(),
        user.id,
        (tx) => occurrenceForLegacyPlannedRun(tx, user.id, requestedPlanId),
        { readOnly: true },
      );
      if (!occurrenceId) return <LegacyUnavailable />;
      redirect(`/training/new?occurrence=${occurrenceId}`);
    }
    redirect("/training/new?sport=running");
  }
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
    const [logged, schedule] = await Promise.all([
      listRuns(tx, user.id, 200),
      getSchedule(tx, user.id),
    ]);
    const [cycle, coach] = await Promise.all([
      schedule ? plannedRunsForCycle(tx, schedule, logged) : Promise.resolve(null),
      profile.aiCoachEnabled ? plannedRunForToday(tx, user.id, schedule) : Promise.resolve(null),
    ]);
    return {
      timeZone: profile.timeZone,
      coach,
      cycle,
    };
  });
  const planned = data.cycle?.planned ?? [];
  const nextPlanned =
    planned.find((run) => run.id === requestedPlanId) ??
    planned.find((run) => run.loggedRunId === null);
  // The coach's run fills the form in, so logging it is a check rather than a transcription.
  // Opening a different occurrence must not overwrite it with today's coach targets.
  const selectedCoach =
    data.coach && (!requestedPlanId || data.coach.run.programRunId === requestedPlanId)
      ? data.coach
      : null;
  const coachRun = selectedCoach?.run ?? null;
  const duration = coachRun?.durationMinutes ?? null;

  return (
    <>
      <PageHeader title="Log a run" backHref="/runs" />
      <PageContent>
        <RunForm
          action={saveRunAction.bind(null, null)}
          coach={
            selectedCoach
              ? {
                  summary: selectedCoach.summary,
                  warnings: selectedCoach.warnings,
                  line: runPlanLine(selectedCoach.run),
                  note: selectedCoach.run.note,
                  paceNote: selectedCoach.run.paceNote,
                  stopRule: selectedCoach.run.stopRule,
                }
              : null
          }
          initial={{
            startedAt: toDateTimeLocal(new Date(), data.timeZone),
            treadmill: coachRun?.mode === "treadmill",
            distanceKm: coachRun?.distanceKm === null ? "" : String(coachRun?.distanceKm ?? ""),
            durationMinutes: duration === null ? "" : String(duration),
            durationSeconds: "",
            rpe: "",
            programRunId: coachRun?.programRunId ?? nextPlanned?.id ?? "",
            notes: "",
          }}
          planned={planned}
          runId={null}
          submitLabel="Save run"
        />
      </PageContent>
    </>
  );
}
