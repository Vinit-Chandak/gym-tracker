import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { runSummary } from "@/components/run-plan";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatDuration, formatPace } from "@/domain/pace";
import { formatDateTime, formatRunKm } from "@/lib/format";
import { RUN_MODE_LABELS, WEEKDAY_SHORT } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getRun } from "@/server/repositories/runs";
import { requireUuid } from "@/server/validation/params";

import { DeleteRunButton } from "./delete-button";

export const metadata: Metadata = { title: "Run" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="text-base font-medium tabular-nums">{value}</dd>
    </div>
  );
}

const score = (value: number | null) => (value === null ? "—" : String(value));

export default async function RunPage(props: PageProps<"/runs/[runId]">) {
  const { runId } = await props.params;
  requireUuid(runId);
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
    const run = await getRun(tx, user.id, runId);
    return run ? { run, timeZone: profile.timeZone } : null;
  });
  if (!data) notFound();
  const { run, timeZone } = data;
  const hasShin = [
    run.shinLeftPre,
    run.shinRightPre,
    run.shinLeftDuring,
    run.shinRightDuring,
    run.shinLeftPost,
    run.shinRightPost,
  ].some((value) => value !== null);

  return (
    <>
      <PageHeader title="Run" meta={formatDateTime(run.startedAt, timeZone)} backHref="/runs" />
      <PageContent>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">Summary</h2>
            <Badge tone={run.mode === "treadmill" ? "accent" : "neutral"}>
              {RUN_MODE_LABELS[run.mode]}
            </Badge>
          </div>
          <dl className="grid grid-cols-4">
            <Stat label="km" value={formatRunKm(run.distanceMeters)} />
            <Stat label="Time" value={formatDuration(run.durationSeconds)} />
            <Stat label="/km" value={formatPace(run.averagePaceSecondsPerKm)} />
            <Stat label="RPE" value={run.rpe === null ? "—" : String(run.rpe)} />
          </dl>
          {run.planned ? (
            <p className="text-sm text-ink-muted">
              Planned run: week {run.planned.weekIndex}, {WEEKDAY_SHORT[run.planned.dayOfWeek]} ·
              target {runSummary(run.planned)}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Unplanned run.</p>
          )}
          {hasShin && (
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-line">
                  <th className="text-left font-medium">Shins</th>
                  <th className="font-medium">Before</th>
                  <th className="font-medium">During</th>
                  <th className="font-medium">After</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line">
                  <td className="py-1">Left</td>
                  <td className="text-center">{score(run.shinLeftPre)}</td>
                  <td className="text-center">{score(run.shinLeftDuring)}</td>
                  <td className="text-center">{score(run.shinLeftPost)}</td>
                </tr>
                <tr>
                  <td className="py-1">Right</td>
                  <td className="text-center">{score(run.shinRightPre)}</td>
                  <td className="text-center">{score(run.shinRightDuring)}</td>
                  <td className="text-center">{score(run.shinRightPost)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {run.notes && <p className="text-sm whitespace-pre-line">{run.notes}</p>}
        </Card>
        <LinkButton href={`/runs/${run.id}/edit`} variant="secondary" className="w-full">
          Edit run
        </LinkButton>
        <DeleteRunButton runId={run.id} />
      </PageContent>
    </>
  );
}
