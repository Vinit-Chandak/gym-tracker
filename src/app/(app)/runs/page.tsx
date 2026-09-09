import { Footprints } from "lucide-react";
import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkRow, List } from "@/components/ui/link-row";
import { SectionHeading } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatDuration, formatPace } from "@/domain/pace";
import { RUN_VOLUME_SPIKE_RATIO, SHIN_ESCALATION_RUNS } from "@/domain/running";
import { formatDay, formatIsoDate } from "@/lib/format";
import { rangeLabel, RUN_MODE_LABELS, WEEKDAY_SHORT } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { getRunsOverview } from "@/server/repositories/runs";

export const metadata: Metadata = { title: "Runs" };

function volumeLine(week: { runs: number; minutes: number; km: number }): string {
  if (week.runs === 0) return "No runs";
  return `${week.minutes} min · ${week.km} km · ${week.runs} ${week.runs === 1 ? "run" : "runs"}`;
}

export default async function RunsPage() {
  const user = await requireUser();
  const { overview, timeZone } = await withUser(getDb(), user.id, async (tx) => {
    const profile = await ensureProfile(tx, user);
    return {
      overview: await getRunsOverview(tx, user.id, profile.timeZone),
      timeZone: profile.timeZone,
    };
  });
  const [thisWeek, lastWeek] = overview.weeks;
  const notes = overview.cycle?.planned[0];

  return (
    <>
      <PageHeader title="Runs" />
      <PageContent>
        <LinkButton href="/runs/new" size="lg" className="w-full">
          Log a run
        </LinkButton>

        {thisWeek && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">This week</h2>
              <span className="text-xs text-ink-subtle">
                from {formatIsoDate(thisWeek.weekStart)}
              </span>
            </div>
            <p className="text-lg font-semibold tabular-nums">{volumeLine(thisWeek)}</p>
            <p className="text-xs text-ink-muted">Monday–Sunday in your time zone</p>
            {lastWeek && (
              <p className="text-sm text-ink-muted tabular-nums">
                Last week: {volumeLine(lastWeek)}
              </p>
            )}
            {overview.spike && (
              <p className="text-sm text-warning">
                Already {Math.round((overview.spike.ratio - 1) * 100)}% above last week&apos;s{" "}
                {overview.spike.lastWeekMinutes} min (the flag starts at{" "}
                {Math.round((RUN_VOLUME_SPIKE_RATIO - 1) * 100)}%). Advice: keep the remaining runs
                easy and short; build time, not pace.
              </p>
            )}
          </Card>
        )}

        {overview.shin.length > 0 && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Shin check</h2>
              <Badge tone="warning">Advice</Badge>
            </div>
            <ul className="space-y-1 text-sm">
              {overview.shin.map((flag) => (
                <li key={flag.side}>
                  <span className="font-medium">
                    {flag.side === "left" ? "Left" : "Right"} shin{" "}
                    {flag.pattern === "rising"
                      ? `rose during or after each of the last ${flag.runs} runs`
                      : `has felt worse after each of the last ${flag.runs} runs`}
                    .
                  </span>{" "}
                  <span className="text-ink-muted">
                    Stop adding run time, keep runs easy or swap for walking or cycling, and
                    consider getting it assessed if it is pinpoint or hurts while walking.
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-subtle">
              Based on the shin scores of the last {SHIN_ESCALATION_RUNS} runs.
            </p>
          </Card>
        )}

        {overview.cycle && (
          <Card>
            <h2 className="font-semibold">Programme · week {overview.cycle.cycleIndex}</h2>
            {overview.cycle.planned.length === 0 ? (
              <p className="text-sm text-ink-muted">No runs planned this week.</p>
            ) : (
              <ul className="divide-y divide-line">
                {overview.cycle.planned.map((run) => (
                  <li key={run.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm">
                      <span className="font-medium">{WEEKDAY_SHORT[run.dayOfWeek]}</span> ·{" "}
                      {rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min")}
                      {run.rpeMin !== null ? ` · RPE ${rangeLabel(run.rpeMin, run.rpeMax)}` : ""}
                    </span>
                    {run.loggedRunId ? <Badge tone="success">Done</Badge> : <Badge>Pending</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {notes && (
              <p className="text-xs text-ink-subtle">
                {[notes.paceNote, notes.progressionNote, notes.shinRule, notes.comment]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </Card>
        )}

        <SectionHeading title="Recent runs" />
        {overview.recent.length === 0 ? (
          <EmptyState
            icon={Footprints}
            title="No runs yet"
            description="Log a run after you finish it: distance, time, effort and how the shins felt."
          />
        ) : (
          <List>
            {overview.recent.map((run) => (
              <li key={run.id}>
                <LinkRow
                  href={`/runs/${run.id}`}
                  title={`${formatDay(run.startedAt, timeZone)} · ${Math.round(run.distanceMeters / 100) / 10} km`}
                  subtitle={`${formatDuration(run.durationSeconds)} · ${formatPace(run.averagePaceSecondsPerKm)} /km${run.rpe !== null ? ` · RPE ${run.rpe}` : ""}`}
                  meta={RUN_MODE_LABELS[run.mode]}
                  badge={
                    run.planned ? (
                      <Badge tone="accent">
                        Wk {run.planned.weekIndex} {WEEKDAY_SHORT[run.planned.dayOfWeek]}
                      </Badge>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </List>
        )}
      </PageContent>
    </>
  );
}
