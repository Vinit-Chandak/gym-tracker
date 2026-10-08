import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { CompareHeader } from "@/components/compare-header";
import { FriendsBoardCard } from "@/components/friends-board-card";
import { GraphRangeProvider } from "@/components/graph/graph-range-context";
import { HeadToHeadGraph } from "@/components/graph/head-to-head-graph";
import { workoutHref } from "@/components/graph/labels";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { CompareTable, type CompareSide } from "@/components/ui/compare-table";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { bodyWeightRatio, strongerVerdict } from "@/domain/compare";
import { rangeOf, readWindowOf } from "@/domain/graph-range";
import { topWithYou } from "@/domain/leaderboard";
import { todayInTimeZone } from "@/domain/program-calendar";
import { earliestOf } from "@/domain/progress-graphs";
import {
  METRIC_UNIT,
  metricLabel,
  metricsForExercise,
  primaryMetric,
  type SharedMetric,
} from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";
import { formatIsoDay, formatSharedMetric, formatTopWeightWork } from "@/lib/format";
import { BODY_REGION_LABELS } from "@/lib/labels";
import { fromKilograms } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { rememberedRange } from "@/server/queries/graph-range";
import { hiddenTrainingLine, loadHeadToHead } from "@/server/queries/head-to-head";
import { loadCircle, rankExercise } from "@/server/queries/leaderboard";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  getComparableExercise,
  readBodyWeights,
  readExerciseBests,
  readExerciseTrends,
  type ExerciseBest,
  type SharedReading,
  type TrendPoint,
} from "@/server/repositories/shared-stats";
import { dateWindow } from "@/server/validation/date-range";
import { requireUsername, requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Compare exercise" };

/** The metrics that gain "× body weight" when both people share theirs (decision 5). */
const RATIO_METRICS: ReadonlySet<SharedMetric> = new Set(["e1rm", "top_weight"]);

function side(
  metric: SharedMetric,
  bests: readonly ExerciseBest[] | undefined,
  reading: SharedReading | undefined,
  ratio: boolean,
  unit: BodyLoadUnit,
): CompareSide {
  const best = bests?.find((b) => b.metric === metric);
  // No best is not a best of nothing: an estimated 1RM needs a set of ten reps or fewer.
  if (!best) return { value: null, text: "—" };
  const sub = [formatIsoDay(best.occurredOn)];
  if (best.work) sub.unshift(formatTopWeightWork(best.work));
  const bodyWeight = ratio && RATIO_METRICS.has(metric) ? (reading?.weightKg ?? null) : null;
  const times = bodyWeight === null ? null : bodyWeightRatio(best.value, bodyWeight);
  if (times !== null) sub.push(`${times}× BW`);
  return { value: best.value, text: formatSharedMetric(metric, best.value, unit), sub };
}

/**
 * One movement head to head (plan §3.11): the Stronger badge under whoever leads on the
 * primary metric over all time, the bests side by side for each metric the movement is
 * measured by with the day each was set (and, for the top weight, how it was worked),
 * "× body weight" under the loads when you both share it, and the primary metric per session
 * as two lines on the shared graph, over the span every graph shares (ADR 0042). Only a
 * comparable movement (§3.9) has this page at all.
 */
export default async function CompareExercisePage(
  props: PageProps<"/u/[username]/compare/[exerciseId]">,
) {
  const params = await props.params;
  const handle = requireUsername(params.username);
  const exerciseId = requireUuid(params.exerciseId);
  const user = await requireUser();
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  // The span every graph shares, remembered from wherever it was last chosen.
  const preset = await rememberedRange();
  const today = todayInTimeZone(viewer.timeZone);
  const trendDays = readWindowOf({ preset }, today);
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [exercise, head] = await Promise.all([
        getComparableExercise(tx, exerciseId),
        loadHeadToHead(tx, { id: user.id, username: viewer.username }, handle),
      ]);
      if (!exercise || head === null) return null;
      if (head === "self") return "self";
      if (!head.visible) return { ...head, exercise };
      const ids = [head.me.id, head.them.id];
      const metric = primaryMetric(exercise);
      // The friend is in the circle whenever their training is visible (you follow them), so
      // one read of the circle's bests serves the bar pairs and the board beneath.
      const circle = await loadCircle(tx, { id: user.id, username: viewer.username }, head.me);
      const [bests, readings, trends] = await Promise.all([
        readExerciseBests(
          tx,
          circle.map((person) => person.id),
          exerciseId,
        ),
        readBodyWeights(tx, ids),
        // Every measure the movement has, so the trend offers what an exercise's graph does.
        readExerciseTrends(
          tx,
          ids,
          exerciseId,
          metricsForExercise(exercise),
          dateWindow(trendDays.from, trendDays.to, viewer.timeZone),
        ),
      ]);
      const board = topWithYou(rankExercise(circle, bests, new Map(), metric), head.me.id, 5);
      return { ...head, exercise, metric, bests, readings, trends, board };
    },
    { readOnly: true },
  );
  if (found === null) notFound();
  if (found === "self") redirect(`/u/${handle}`);
  const { me, them, exercise } = found;
  const names: [string, string] = [
    me.displayName || me.username,
    them.displayName || them.username,
  ];
  const region = BODY_REGION_LABELS[exercise.region];

  if (!("bests" in found)) {
    return (
      <>
        <PageHeader title={exercise.name} meta={region} backHref={`/u/${them.username}/compare`} />
        <PageContent>
          <CompareHeader a={me} b={them} />
          <p className="px-1 text-sm text-ink-muted">{hiddenTrainingLine(found)}</p>
        </PageContent>
      </>
    );
  }

  const { metric, bests, readings, trends, board } = found;
  const mine = bests.get(me.id);
  const theirs = bests.get(them.id);
  // Both readings are here only when both opted in: the policy on the table decides.
  const ratio = readings.has(me.id) && readings.has(them.id);
  const stronger = strongerVerdict(
    mine?.find((b) => b.metric === metric)?.value ?? null,
    theirs?.find((b) => b.metric === metric)?.value ?? null,
  );
  // Loads are stored in kilograms and drawn in the reader's unit, as every number here. Your
  // own point opens your workout; theirs, the session they shared.
  const line = (
    measure: SharedMetric,
    points: readonly TrendPoint[],
    href: (point: TrendPoint) => Route | null,
  ) =>
    points.map((point) => ({
      date: point.date,
      value: METRIC_UNIT[measure] === "kg" ? fromKilograms(point.value, unit) : point.value,
      href: href(point),
    }));
  const measures = metricsForExercise(exercise).map((measure) => {
    const trend = trends.get(measure);
    return {
      metric: measure,
      lines: [
        line(measure, trend?.get(me.id) ?? [], (point) =>
          workoutHref(point.workoutSessionId, "shared"),
        ),
        line(measure, trend?.get(them.id) ?? [], (point) =>
          point.sharedId ? (`/u/${them.username}/activities/${point.sharedId}` as Route) : null,
        ),
      ] as const,
    };
  });

  return (
    <>
      <PageHeader title={exercise.name} meta={region} backHref={`/u/${them.username}/compare`} />
      <PageContent>
        <CompareHeader a={me} b={them} stronger={stronger} />

        <Section
          title="Best"
          info={`All-time bests, with the day each was set; under a top weight, how it was worked (working sets at that load × the most reps one of them reached). Stronger goes to whoever leads on ${metricLabel(metric, exercise).toLowerCase()}; a tie shows nobody.${metric === "e1rm" ? " An estimated 1RM needs a set of 1–10 reps, so a side whose sets were all longer reads 0." : ""}${ratio ? " Loads also read as multiples of each person's latest body weight (× BW), since you both share it." : ""}`}
        >
          <Card>
            <CompareTable
              names={names}
              rows={metricsForExercise(exercise).map((m) => ({
                key: m,
                label: metricLabel(m, exercise),
                a: side(m, mine, readings.get(me.id), ratio, unit),
                b: side(m, theirs, readings.get(them.id), ratio, unit),
              }))}
            />
          </Card>
        </Section>

        <Section title="Trend">
          <GraphRangeProvider preset={preset}>
            <HeadToHeadGraph
              data={{
                range: rangeOf(
                  { preset },
                  today,
                  earliestOf(
                    measures.flatMap((measure) => measure.lines.flat().map((point) => point.date)),
                  ),
                ),
                today,
                exercise,
                unit,
                // As the bests above name the two columns.
                names: ["You", names[1]],
                measures,
              }}
            />
          </GraphRangeProvider>
        </Section>

        <FriendsBoardCard
          exercise={exercise}
          metric={metric}
          rows={board}
          you={me.id}
          unit={unit}
        />
      </PageContent>
    </>
  );
}
