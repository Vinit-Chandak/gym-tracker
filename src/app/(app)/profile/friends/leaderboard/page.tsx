import type { Metadata } from "next";

import { PeopleSearch } from "@/components/people-search";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Trophy } from "@/components/ui/icons";
import { RankList } from "@/components/ui/rank-list";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  ACTIVITY_METRIC_LABELS,
  boardMetricsForExercise,
  isPerKgMetric,
  perKgBase,
  type BoardMetric,
} from "@/domain/leaderboard";
import { PERIOD_LABELS } from "@/domain/period";
import { metricLabel, type MetricExercise } from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";
import { formatActivityMetric, formatSharedMetric } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { loadCircle, perKgAvailable, rankCircle, rankExercise } from "@/server/queries/leaderboard";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  readBodyWeights,
  readCircleExercises,
  readExerciseBests,
  readLeaderboard,
} from "@/server/repositories/shared-stats";
import {
  parseActivityMetric,
  parseBoardMetric,
  parseBoardMode,
  parseExerciseParam,
} from "@/server/validation/leaderboard";
import { parsePeriod, periodRange } from "@/server/validation/period";

import { LeaderboardControls, type ExerciseChoice } from "./leaderboard-controls";

export const metadata: Metadata = { title: "Leaderboard" };

/** "Est. 1RM" for the movement, or "Est. 1RM ÷ body weight" for its per-kg variant. */
function boardMetricLabel(metric: BoardMetric, exercise: MetricExercise): string {
  return isPerKgMetric(metric)
    ? `${metricLabel(perKgBase(metric)!, exercise)} ÷ body weight`
    : metricLabel(metric, exercise);
}

/** A load reads in the viewer's unit; a per-kg value is a multiple of body weight. */
function formatBoardMetric(metric: BoardMetric, value: number, unit: BodyLoadUnit): string {
  return isPerKgMetric(metric)
    ? `${value.toLocaleString("en-GB", { minimumFractionDigits: 2 })}×`
    : formatSharedMetric(metric, value, unit);
}

/**
 * The leaderboard (plan §3.12): you and the people you follow, ranked. Activity ranks a
 * period's totals on one of six lifting numbers; Exercise ranks all-time bests of one
 * comparable movement on the metrics it is measured by, with "÷ body weight" variants of the
 * loads once two of you share yours. Equal values share a rank; whoever has nothing for the
 * metric trails as "—"; a friend who turned sharing off is simply not there. Lifting only,
 * as Compare is, until the sport switch lands.
 */
export default async function LeaderboardPage(props: PageProps<"/profile/friends/leaderboard">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const mode = parseBoardMode(params.mode);
  const activityMetric = parseActivityMetric(params.metric);
  const period = parsePeriod(params.period);
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  const range = periodRange(period, viewer.timeZone);
  const board = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const circle = await loadCircle(tx, { id: user.id, username: viewer.username });
      // A board of one ranks nobody: the way out is to follow someone.
      if (circle.length < 2) return { kind: "alone" as const };
      const ids = circle.map((person) => person.id);
      if (mode === "activity") {
        const values = await readLeaderboard(tx, ids, "workout", activityMetric, range);
        const rows = rankCircle(circle, new Map([...values].map(([id, value]) => [id, { value }])));
        return { kind: "activity" as const, rows };
      }
      const [exercises, readings] = await Promise.all([
        readCircleExercises(tx, ids),
        readBodyWeights(tx, ids),
      ]);
      const wanted = parseExerciseParam(params.exercise);
      const exercise = exercises.find((e) => e.id === wanted) ?? exercises[0];
      if (!exercise) return { kind: "empty" as const };
      const metrics = boardMetricsForExercise(exercise, perKgAvailable(readings));
      const metric = parseBoardMetric(params.metric, metrics);
      const bests = await readExerciseBests(tx, ids, exercise.id);
      return {
        kind: "exercise" as const,
        exercises,
        exercise,
        metrics,
        metric,
        rows: rankExercise(circle, bests, readings, metric),
      };
    },
    { readOnly: true },
  );

  const exerciseChoice: ExerciseChoice =
    board.kind === "exercise"
      ? {
          options: board.exercises,
          selected: board.exercise.id,
          metric: board.metric,
          metrics: board.metrics.map((value) => ({
            value,
            label: boardMetricLabel(value, board.exercise),
          })),
        }
      : { options: [], selected: null, metric: null, metrics: [] };

  return (
    <>
      <PageHeader title="Leaderboard" backHref="/profile/friends" />
      <PageContent>
        {board.kind === "alone" ? (
          <>
            <Card>
              <EmptyState
                icon={Trophy}
                title="Follow someone to rank against them"
                description="The leaderboard ranks you and the people you follow who share their training."
              />
            </Card>
            <Card>
              <PeopleSearch autoFocus />
            </Card>
          </>
        ) : (
          <>
            <LeaderboardControls
              mode={mode}
              activityMetric={activityMetric}
              period={period}
              exercise={exerciseChoice}
            />

            {board.kind === "activity" ? (
              <Section
                title={ACTIVITY_METRIC_LABELS[activityMetric]}
                info={`The last ${PERIOD_LABELS[period]}, ending today. Equal values share a rank; someone with no workout in the period reads "—".`}
              >
                <RankList
                  rows={board.rows}
                  you={user.id}
                  format={(value) => formatActivityMetric(activityMetric, value, unit)}
                />
              </Section>
            ) : board.kind === "exercise" ? (
              <Section
                title={board.exercise.name}
                info={`All-time bests, with the day each was set. ${
                  isPerKgMetric(board.metric)
                    ? "A load over each person's latest body weight; only people who share theirs are listed."
                    : "Movements from the shared library whose load means the same everywhere; a machine's numbers are its own and are never ranked."
                }`}
              >
                <RankList
                  rows={board.rows}
                  you={user.id}
                  format={(value) => formatBoardMetric(board.metric, value, unit)}
                />
              </Section>
            ) : (
              <Card>
                <p className="text-sm text-ink-muted">
                  Nobody in your circle has logged a comparable exercise yet. Machine exercises are
                  never ranked: a machine&apos;s numbers are its own.
                </p>
              </Card>
            )}
          </>
        )}
      </PageContent>
    </>
  );
}
