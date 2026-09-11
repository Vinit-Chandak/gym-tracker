import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { runPlanLine } from "@/domain/session-plan";
import { toDateTimeLocal } from "@/lib/time";
import { saveRunAction } from "@/server/actions/runs";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { plannedRunForToday } from "@/server/repositories/coach-plans";
import { listRuns, plannedRunsForCycle } from "@/server/repositories/runs";
import { getSchedule } from "@/server/repositories/schedule";

import { RunForm } from "../run-form";

export const metadata: Metadata = { title: "Log a run" };

export default async function NewRunPage(props: PageProps<"/runs/new">) {
  // Today links straight at the run its offered day asks for, so the form opens on that plan
  // rather than on whichever planned run of the cycle happens to be unlogged.
  const { planned: plannedParam } = await props.searchParams;
  const requestedPlanId = typeof plannedParam === "string" ? plannedParam : null;
  const user = await requireUser();
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
  const coachRun = data.coach?.run ?? null;
  const duration = coachRun?.durationMinutes ?? null;

  return (
    <>
      <PageHeader title="Log a run" backHref="/runs" />
      <PageContent>
        <RunForm
          action={saveRunAction.bind(null, null)}
          coach={
            data.coach
              ? {
                  summary: data.coach.summary,
                  line: runPlanLine(data.coach.run),
                  note: data.coach.run.note,
                  paceNote: data.coach.run.paceNote,
                  stopRule: data.coach.run.stopRule,
                }
              : null
          }
          initial={{
            startedAt: toDateTimeLocal(new Date(), data.timeZone),
            treadmill: coachRun?.mode === "treadmill",
            distanceKm: coachRun?.distanceKm === null ? "" : String(coachRun?.distanceKm ?? ""),
            durationMinutes: duration === null ? "" : String(duration),
            durationSeconds: "",
            rpe: coachRun?.rpe === null ? "" : String(coachRun?.rpe ?? ""),
            shinLeftPre: "",
            shinRightPre: "",
            shinLeftDuring: "",
            shinRightDuring: "",
            shinLeftPost: "",
            shinRightPost: "",
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
