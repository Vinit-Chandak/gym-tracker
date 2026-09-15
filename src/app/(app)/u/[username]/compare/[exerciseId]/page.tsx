import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CompareHeader } from "@/components/compare-header";
import { FriendsBoardCard } from "@/components/friends-board-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Chart } from "@/components/ui/chart";
import { CompareBar, type BarSide } from "@/components/ui/compare-bars";
import { PeriodSelect } from "@/components/ui/period-select";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { alignSeries, bodyWeightRatio, strongerVerdict } from "@/domain/compare";
import { topWithYou } from "@/domain/leaderboard";
import { PERIOD_LABELS } from "@/domain/period";
import {
  METRIC_UNIT,
  metricLabel,
  metricsForExercise,
  primaryMetric,
  type SharedMetric,
} from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";
import { formatIsoDay, formatSharedMetric } from "@/lib/format";
import { BODY_REGION_LABELS } from "@/lib/labels";
import { fromKilograms } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { hiddenTrainingLine, loadHeadToHead } from "@/server/queries/head-to-head";
import { loadCircle, rankExercise } from "@/server/queries/leaderboard";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  getComparableExercise,
  readBodyWeights,
  readExerciseBests,
  readExerciseTrend,
  type ExerciseBest,
  type SharedReading,
} from "@/server/repositories/shared-stats";
import { requireUsername, requireUuid } from "@/server/validation/params";
import { parsePeriod, periodRange } from "@/server/validation/period";

export const metadata: Metadata = { title: "Compare exercise" };

/** The metrics that gain "× body weight" when both people share theirs (decision 5). */
const RATIO_METRICS: ReadonlySet<SharedMetric> = new Set(["e1rm", "top_weight"]);

function side(
  metric: SharedMetric,
  bests: readonly ExerciseBest[] | undefined,
  reading: SharedReading | undefined,
  ratio: boolean,
  unit: BodyLoadUnit,
): BarSide {
  const best = bests?.find((b) => b.metric === metric);
  if (!best) return { value: null, text: "0" };
  const sub = [formatIsoDay(best.occurredOn)];
  const bodyWeight = ratio && RATIO_METRICS.has(metric) ? (reading?.weightKg ?? null) : null;
  const times = bodyWeight === null ? null : bodyWeightRatio(best.value, bodyWeight);
  if (times !== null) sub.push(`${times}× body weight`);
  return { value: best.value, text: formatSharedMetric(metric, best.value, unit), sub };
}

/**
 * One movement head to head (plan §3.11): the Stronger badge under whoever leads on the
 * primary metric over all time, a bar pair per metric the movement is measured by with the
 * day each best was set, "× body weight" under the loads when you both share it, and the
 * primary metric per session over the chosen period as two lines on one chart. Only a
 * comparable movement (§3.9) has this page at all.
 */
export default async function CompareExercisePage(
  props: PageProps<"/u/[username]/compare/[exerciseId]">,
) {
  const params = await props.params;
  const handle = requireUsername(params.username);
  const exerciseId = requireUuid(params.exerciseId);
  const user = await requireUser();
  const period = parsePeriod((await props.searchParams).period);
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  const range = periodRange(period, viewer.timeZone);
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
      const circle = await loadCircle(tx, { id: user.id, username: viewer.username });
      const [bests, readings, trend] = await Promise.all([
        readExerciseBests(
          tx,
          circle.map((person) => person.id),
          exerciseId,
        ),
        readBodyWeights(tx, ids),
        readExerciseTrend(tx, ids, exerciseId, metric, range),
      ]);
      const board = topWithYou(rankExercise(circle, bests, new Map(), metric), head.me.id, 5);
      return { ...head, exercise, metric, bests, readings, trend, board };
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

  const { metric, bests, readings, trend, board } = found;
  const mine = bests.get(me.id);
  const theirs = bests.get(them.id);
  // Both readings are here only when both opted in: the policy on the table decides.
  const ratio = readings.has(me.id) && readings.has(them.id);
  const stronger = strongerVerdict(
    mine?.find((b) => b.metric === metric)?.value ?? null,
    theirs?.find((b) => b.metric === metric)?.value ?? null,
  );
  const aligned = alignSeries(trend.get(me.id) ?? [], trend.get(them.id) ?? []);
  // Loads are stored in kilograms and drawn in the reader's unit, as every number here.
  const inUnit = (value: number | null) =>
    value === null ? null : METRIC_UNIT[metric] === "kg" ? fromKilograms(value, unit) : value;
  const chartUnit =
    METRIC_UNIT[metric] === "kg"
      ? unit
      : METRIC_UNIT[metric] === "seconds"
        ? "s"
        : METRIC_UNIT[metric] === "metres"
          ? "m"
          : "reps";

  return (
    <>
      <PageHeader title={exercise.name} meta={region} backHref={`/u/${them.username}/compare`} />
      <PageContent>
        <CompareHeader a={me} b={them} stronger={stronger} />

        <Section
          title="Best"
          info={`All-time bests, with the day each was set. Stronger goes to whoever leads on ${metricLabel(metric, exercise).toLowerCase()}; a tie shows nobody.${ratio ? " Loads also read as multiples of each person's latest body weight, since you both share it." : ""}`}
        >
          <Card className="space-y-4">
            {metricsForExercise(exercise).map((m) => (
              <CompareBar
                key={m}
                label={metricLabel(m, exercise)}
                names={names}
                a={side(m, mine, readings.get(me.id), ratio, unit)}
                b={side(m, theirs, readings.get(them.id), ratio, unit)}
              />
            ))}
          </Card>
        </Section>

        <Section title="Trend">
          <PeriodSelect value={period} />
          <Card>
            <Chart
              title={metricLabel(metric, exercise)}
              unit={chartUnit}
              bridgeGaps
              note={`${metricLabel(metric, exercise)} per session over the last ${PERIOD_LABELS[period]}. A line runs across the other person's training days rather than breaking there.`}
              series={[
                {
                  name: names[0],
                  color: "var(--color-series-1)",
                  points: aligned.a.map((p) => ({ ...p, value: inUnit(p.value) })),
                },
                {
                  name: names[1],
                  color: "var(--color-series-2)",
                  points: aligned.b.map((p) => ({ ...p, value: inUnit(p.value) })),
                },
              ]}
            />
          </Card>
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
