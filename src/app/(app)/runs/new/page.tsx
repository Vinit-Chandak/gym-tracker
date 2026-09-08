import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { toDateTimeLocal } from "@/lib/time";
import { saveRunAction } from "@/server/actions/runs";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { listRuns, plannedRunsForCurrentCycle } from "@/server/repositories/runs";

import { RunForm } from "../run-form";

export const metadata: Metadata = { title: "Log a run" };

export default async function NewRunPage() {
  const user = await requireUser();
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = await ensureProfile(tx, user);
    const logged = await listRuns(tx, user.id, 200);
    return {
      timeZone: profile.timeZone,
      cycle: await plannedRunsForCurrentCycle(tx, user.id, logged),
    };
  });
  const planned = data.cycle?.planned ?? [];
  const nextPlanned = planned.find((run) => run.loggedRunId === null);

  return (
    <>
      <PageHeader title="Log a run" backHref="/runs" />
      <PageContent>
        <Card>
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
            cycleIndex={data.cycle?.cycleIndex ?? null}
            runId={null}
            submitLabel="Save run"
          />
        </Card>
      </PageContent>
    </>
  );
}
