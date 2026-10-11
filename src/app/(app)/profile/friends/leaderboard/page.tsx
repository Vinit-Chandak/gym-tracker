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
import { legacySportOf } from "@/domain/activity";
import {
  ACTIVITY_METRIC_LABELS,
  boardMetricsForExercise,
  isPerKgMetric,
  lowerIsBetter,
  perKgBase,
  type ActivityMetric,
  type BoardMetric,
  type BoardMode,
} from "@/domain/leaderboard";
import { PERIOD_LABELS } from "@/domain/period";
import { metricLabel, type MetricExercise } from "@/domain/shared-stats";
import { sportsOnOffer, type TrainingSport } from "@/domain/sport-scope";
import type { BodyLoadUnit } from "@/domain/types";
import { formatActivityMetric, formatSharedMetric } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { loadCircle, perKgAvailable, rankCircle, rankExercise } from "@/server/queries/leaderboard";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  readBodyWeights,
  readCircleExercises,
  readDistanceUnits,
  readExerciseBests,
  readLeaderboard,
} from "@/server/repositories/shared-stats";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";
import {
  parseActivityMetric,
  parseBoardMetric,
  parseBoardMode,
  parseExerciseParam,
} from "@/server/validation/leaderboard";
import { parsePeriod, periodRange } from "@/server/validation/period";
import { askedSport } from "@/server/validation/sport";

import { LeaderboardControls, type ExerciseChoice } from "./leaderboard-controls";

export const metadata: Metadata = { title: "Leaderboard" };

/** What one of each sport is called where the board says who has none. */
const ACTIVITY_NAMES: Record<TrainingSport, string> = {
  workout: "workout",
  run: "run",
  cycle: "ride",
  swim: "swim",
};

/** What a sport's board ranks: the mode, and the number Activity ranks by. */
function boardOf(
  sport: TrainingSport,
  params: { mode?: string | string[]; metric?: string | string[] },
): { mode: BoardMode; activityMetric: ActivityMetric } {
  return {
    // Endurance sports have no Exercise mode: whatever the URL says, it is one board.
    mode: sport === "workout" ? parseBoardMode(params.mode) : "activity",
    activityMetric: parseActivityMetric(params.metric, sport),
  };
}

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
 * The leaderboard (plan §3.12, §3.16): you and the people you follow, ranked. Activity ranks
 * a period's totals — six lifting numbers, or five running ones — and, for lifting only,
 * Exercise ranks all-time bests of one comparable movement on the metrics it is measured by,
 * with "÷ body weight" variants of the loads once two of you share yours. Equal values share
 * a rank; whoever has nothing for the metric trails as "—", and a period in which nobody has
 * anything says so in a line instead; a friend who turned sharing off is simply not there.
 */
export default async function LeaderboardPage(props: PageProps<"/profile/friends/leaderboard">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const asked = askedSport(params.sport);
  const period = parsePeriod(params.period);
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  const range = periodRange(period, viewer.timeZone);
  const board = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [circle, enabled] = await Promise.all([
        loadCircle(tx, user.id),
        enabledSportsFor(tx, user.id),
      ]);
      // Your board, in your sports: a sport you turned off has no tab here, as it has no
      // shortcut (a link to it still opens it).
      const sports = sportsOnOffer(enabled.map(legacySportOf), asked);
      const sport = asked ?? sports[0]!;
      const { mode, activityMetric } = boardOf(sport, params);
      // A board of one ranks nobody: the way out is to follow someone who shares.
      if (circle.length < 2) return { sport, sports, kind: "alone" as const };
      const ids = circle.map((person) => person.id);
      if (mode === "activity") {
        const [values, units] = await Promise.all([
          readLeaderboard(tx, ids, sport, activityMetric, range),
          sport === "workout" ? null : readDistanceUnits(tx, user.id),
        ]);
        const rows = rankCircle(
          circle,
          new Map([...values].map(([id, value]) => [id, { value }])),
          lowerIsBetter(activityMetric),
        );
        // Distances read in the viewer's own unit for the sport, as their own do.
        const distanceUnit = sport !== "workout" && units ? units[sport] : undefined;
        return { sport, sports, kind: "activity" as const, rows, distanceUnit };
      }
      const [exercises, readings] = await Promise.all([
        readCircleExercises(tx, ids),
        readBodyWeights(tx, ids),
      ]);
      const wanted = parseExerciseParam(params.exercise);
      const exercise = exercises.find((e) => e.id === wanted) ?? exercises[0];
      if (!exercise) return { sport, sports, kind: "empty" as const };
      const metrics = boardMetricsForExercise(exercise, perKgAvailable(readings));
      const metric = parseBoardMetric(params.metric, metrics);
      const bests = await readExerciseBests(tx, ids, exercise.id);
      return {
        sport,
        sports,
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
  const { sport, sports } = board;
  const { mode, activityMetric } = boardOf(sport, params);

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
              sport={sport}
              sports={sports}
              mode={mode}
              activityMetric={activityMetric}
              period={period}
              exercise={exerciseChoice}
            />

            {board.kind === "activity" ? (
              <Section
                title={ACTIVITY_METRIC_LABELS[activityMetric]}
                info={`The last ${PERIOD_LABELS[period]}, ending today. Equal values share a rank; someone with no ${ACTIVITY_NAMES[sport]} in the period reads "—".${sport === "run" ? " Best pace is the fastest average pace over a run of at least 1 km, and a faster pace ranks higher." : ""}`}
              >
                {board.rows.some((row) => row.value !== null) ? (
                  <RankList
                    rows={board.rows}
                    you={user.id}
                    format={(value) =>
                      formatActivityMetric(activityMetric, value, unit, board.distanceUnit)
                    }
                  />
                ) : (
                  // Nobody to rank: a column of "—" for everyone says less than a sentence.
                  <Card>
                    <p className="text-sm text-ink-muted">
                      {activityMetric === "best_pace"
                        ? `No run of 1 km or more from you or the people you follow in the last ${PERIOD_LABELS[period]}.`
                        : `No ${ACTIVITY_NAMES[sport]}s from you or the people you follow in the last ${PERIOD_LABELS[period]}.`}
                    </p>
                  </Card>
                )}
              </Section>
            ) : board.kind === "exercise" ? (
              <Section
                title={board.exercise.name}
                info={`All-time bests, with the day each was set. ${
                  perKgBase(board.metric) === "top_weight" || board.metric === "top_weight"
                    ? "Under a top weight, the most reps a set at it reached and how many working sets were at it. "
                    : ""
                }${
                  perKgBase(board.metric) === "e1rm" || board.metric === "e1rm"
                    ? 'An estimated 1RM needs a set of 1–10 reps; someone whose sets were all longer reads "—". '
                    : ""
                }${
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
