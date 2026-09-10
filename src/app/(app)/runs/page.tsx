import { Footprints } from "lucide-react";
import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatDuration, formatPace } from "@/domain/pace";
import { RUN_VOLUME_SPIKE_RATIO, SHIN_ESCALATION_RUNS } from "@/domain/running";
import { formatDay, formatIsoDate } from "@/lib/format";
import { rangeLabel, RUN_MODE_LABELS, WEEKDAY_SHORT } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getRunsOverview } from "@/server/repositories/runs";

export const metadata: Metadata = { title: "Runs" };

function volumeLine(week: { runs: number; minutes: number; km: number }): string {
  if (week.runs === 0) return "No runs";
  return `${week.minutes} min · ${week.km} km · ${week.runs} ${week.runs === 1 ? "run" : "runs"}`;
}

export default async function RunsPage() {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const { overview, timeZone } = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
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
        {/* This week against last, then the one action. The workload warning sits with the
            numbers that produced it rather than in a banner of its own. */}
        {thisWeek && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-1 text-base font-medium">
                This week
                <InfoTip label="About the week">
                  Monday to Sunday in your time zone, from {formatIsoDate(thisWeek.weekStart)}.
                </InfoTip>
              </h2>
            </div>
            <p className="text-lg font-medium tabular-nums">{volumeLine(thisWeek)}</p>
            {lastWeek && (
              <p className="text-sm text-ink-muted tabular-nums">
                Last week: {volumeLine(lastWeek)}
              </p>
            )}
            {overview.spike && (
              <p className="flex items-start gap-1 text-sm text-warning">
                <span>
                  {Math.round((overview.spike.ratio - 1) * 100)}% above last week. Keep the
                  remaining runs easy and short.
                </span>
                <InfoTip label="About the workload warning">
                  Last week was {overview.spike.lastWeekMinutes} min; the flag starts at{" "}
                  {Math.round((RUN_VOLUME_SPIKE_RATIO - 1) * 100)}% above it. Build time, not pace.
                </InfoTip>
              </p>
            )}
          </Card>
        )}

        <LinkButton href="/runs/new" size="lg" className="w-full">
          Log a run
        </LinkButton>

        {overview.shin.length > 0 && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-1 text-base font-medium">
                Shin check
                <InfoTip label="About the shin check">
                  From the shin scores of the last {SHIN_ESCALATION_RUNS} runs.
                </InfoTip>
              </h2>
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
                    Stop adding run time; keep runs easy or swap for walking or cycling. Get it
                    assessed if it is pinpoint or hurts while walking.
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {overview.cycle && (
          <Section
            title={`Programme · week ${overview.cycle.cycleIndex}`}
            info={
              notes
                ? [notes.paceNote, notes.progressionNote, notes.shinRule, notes.comment]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
          >
            {overview.cycle.planned.length === 0 ? (
              <p className="text-sm text-ink-muted">No runs planned this week.</p>
            ) : (
              <List>
                {overview.cycle.planned.map((run) => (
                  <li
                    key={run.id}
                    className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{WEEKDAY_SHORT[run.dayOfWeek]}</span> ·{" "}
                      {rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min")}
                      {run.rpeMin !== null ? ` · RPE ${rangeLabel(run.rpeMin, run.rpeMax)}` : ""}
                    </span>
                    {run.loggedRunId ? <Badge tone="success">Done</Badge> : <Badge>Pending</Badge>}
                  </li>
                ))}
              </List>
            )}
          </Section>
        )}

        <Section title="Recent runs">
          {overview.recent.length === 0 ? (
            <EmptyState
              icon={Footprints}
              title="No runs yet"
              description="Log a run after you finish it."
              action={
                <LinkButton href="/runs/new" variant="secondary" size="sm">
                  Log a run
                </LinkButton>
              }
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
        </Section>
      </PageContent>
    </>
  );
}
