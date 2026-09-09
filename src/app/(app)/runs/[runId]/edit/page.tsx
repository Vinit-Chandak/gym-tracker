import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { toDateTimeLocal } from "@/lib/time";
import { saveRunAction } from "@/server/actions/runs";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getRun, listRuns, plannedRunsForCurrentCycle } from "@/server/repositories/runs";
import { requireUuid } from "@/server/validation/params";

import { RunForm } from "../../run-form";

export const metadata: Metadata = { title: "Edit run" };

const str = (value: number | null): string => (value === null ? "" : String(value));

export default async function EditRunPage(props: PageProps<"/runs/[runId]/edit">) {
  const { runId } = await props.params;
  requireUuid(runId);
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const run = await getRun(tx, user.id, runId);
    if (!run) return null;
    const profile = requestProfile;
    const logged = await listRuns(tx, user.id, 200);
    return {
      run,
      timeZone: profile.timeZone,
      cycle: await plannedRunsForCurrentCycle(tx, user.id, logged),
    };
  });
  if (!data) notFound();
  const { run, timeZone, cycle } = data;
  const planned = cycle?.planned ?? [];
  // Keep the run's own planned link selectable even when it belongs to another cycle.
  if (run.planned && !planned.some((p) => p.id === run.planned?.id)) {
    planned.unshift({
      ...run.planned,
      paceNote: null,
      progressionNote: null,
      shinRule: null,
      comment: null,
      loggedRunId: run.id,
    });
  }

  return (
    <>
      <PageHeader title="Edit run" backHref={`/runs/${run.id}`} />
      <PageContent>
        <Card>
          <RunForm
            action={saveRunAction.bind(null, run.id)}
            initial={{
              startedAt: toDateTimeLocal(run.startedAt, timeZone),
              treadmill: run.mode === "treadmill",
              distanceKm: String(Math.round(run.distanceMeters / 10) / 100),
              durationMinutes: String(Math.floor(run.durationSeconds / 60)),
              durationSeconds: String(run.durationSeconds % 60),
              rpe: str(run.rpe),
              shinLeftPre: str(run.shinLeftPre),
              shinRightPre: str(run.shinRightPre),
              shinLeftDuring: str(run.shinLeftDuring),
              shinRightDuring: str(run.shinRightDuring),
              shinLeftPost: str(run.shinLeftPost),
              shinRightPost: str(run.shinRightPost),
              programRunId: run.programRunId ?? "",
              notes: run.notes ?? "",
            }}
            planned={planned}
            cycleIndex={cycle?.cycleIndex ?? null}
            runId={run.id}
            submitLabel="Save changes"
          />
        </Card>
      </PageContent>
    </>
  );
}
