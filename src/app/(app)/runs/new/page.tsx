import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { toDateTimeLocal } from "@/lib/time";
import { saveRunAction } from "@/server/actions/runs";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listRuns, plannedRunsForCycle } from "@/server/repositories/runs";
import { getSchedule } from "@/server/repositories/schedule";

import { RunForm } from "../run-form";

export const metadata: Metadata = { title: "Log a run" };

export default async function NewRunPage() {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
    const [logged, schedule] = await Promise.all([
      listRuns(tx, user.id, 200),
      getSchedule(tx, user.id),
    ]);
    return {
      timeZone: profile.timeZone,
      cycle: schedule ? await plannedRunsForCycle(tx, schedule, logged) : null,
    };
  });
  const planned = data.cycle?.planned ?? [];
  const nextPlanned = planned.find((run) => run.loggedRunId === null);

  return (
    <>
      <PageHeader title="Log a run" backHref="/runs" />
      <PageContent>
        <RunForm
          action={saveRunAction.bind(null, null)}
          initial={{
            startedAt: toDateTimeLocal(new Date(), data.timeZone),
            treadmill: false,
            distanceKm: "",
            durationMinutes: "",
            durationSeconds: "",
            rpe: "",
            shinLeftPre: "",
            shinRightPre: "",
            shinLeftDuring: "",
            shinRightDuring: "",
            shinLeftPost: "",
            shinRightPost: "",
            programRunId: nextPlanned?.id ?? "",
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
