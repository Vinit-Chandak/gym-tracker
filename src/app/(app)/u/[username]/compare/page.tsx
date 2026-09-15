import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CompareHeader } from "@/components/compare-header";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { CompareTable, type CompareSide } from "@/components/ui/compare-table";
import { InfoTip } from "@/components/ui/info-tip";
import { LinkRow, List } from "@/components/ui/link-row";
import { RadarChart } from "@/components/ui/radar-chart";
import { Section } from "@/components/ui/section";
import { SportPeriodControls } from "@/components/ui/sport-period-controls";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  ACTIVITY_METRIC_LABELS,
  ACTIVITY_METRICS,
  activityValue,
  lowerIsBetter,
  type ActivityMetric,
} from "@/domain/leaderboard";
import { muscleSplit, SPLIT_GROUPS } from "@/domain/muscle-split";
import { PERIOD_LABELS } from "@/domain/period";
import type { BodyLoadUnit } from "@/domain/types";
import { formatActivityMetric } from "@/lib/format";
import { BODY_REGION_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { hiddenTrainingLine, loadHeadToHead } from "@/server/queries/head-to-head";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  EMPTY_TOTALS,
  readExercisesInCommon,
  readMuscleSets,
  readPeriodTotals,
  type PeriodTotals,
} from "@/server/repositories/shared-stats";
import { requireUsername } from "@/server/validation/params";
import { parsePeriod, periodRange } from "@/server/validation/period";
import { parseSport } from "@/server/validation/sport";

export const metadata: Metadata = { title: "Compare" };

/** One side of a stats row: the period's number, or "—" where the period cannot give one. */
function side(totals: PeriodTotals, metric: ActivityMetric, unit: BodyLoadUnit): CompareSide {
  const value = activityValue(totals, metric);
  return { value, text: value === null ? "—" : formatActivityMetric(metric, value, unit) };
}

/**
 * Head to head, overall (plan §3.10, §3.16): the two of you, then for lifting the shape of
 * each split, the period's numbers side by side with the difference under each, and the
 * comparable movements you both did, each leading to its own comparison; for running the
 * five run numbers, since a split and exercises in common do not apply. Everything is in
 * the viewer's unit.
 */
export default async function ComparePage(props: PageProps<"/u/[username]/compare">) {
  const user = await requireUser();
  const handle = requireUsername((await props.params).username);
  const params = await props.searchParams;
  const sport = parseSport(params.sport);
  const period = parsePeriod(params.period);
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  const range = periodRange(period, viewer.timeZone);
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const head = await loadHeadToHead(tx, { id: user.id, username: viewer.username }, handle);
      if (head === null || head === "self" || !head.visible) return head;
      const ids = [head.me.id, head.them.id];
      const totals = await readPeriodTotals(tx, ids, sport, range);
      const pair = [
        totals.get(head.me.id) ?? EMPTY_TOTALS,
        totals.get(head.them.id) ?? EMPTY_TOTALS,
      ] as const;
      if (sport === "run") return { ...head, totals: pair, lifting: null };
      const [mine, theirs, common] = await Promise.all([
        readMuscleSets(tx, head.me.id, range),
        readMuscleSets(tx, head.them.id, range),
        readExercisesInCommon(tx, head.me.id, head.them.id, range),
      ]);
      return {
        ...head,
        totals: pair,
        lifting: {
          splits: [muscleSplit(mine), muscleSplit(theirs)] as const,
          trained: Object.keys(mine).length > 0 || Object.keys(theirs).length > 0,
          common,
        },
      };
    },
    { readOnly: true },
  );
  if (found === null) notFound();
  if (found === "self") redirect(`/u/${handle}`);
  const { me, them } = found;
  const names: [string, string] = [
    me.displayName || me.username,
    them.displayName || them.username,
  ];

  return (
    <>
      <PageHeader title="Compare" backHref={`/u/${them.username}`} />
      <PageContent>
        <CompareHeader a={me} b={them} />
        {!("totals" in found) ? (
          <p className="px-1 text-sm text-ink-muted">{hiddenTrainingLine(found)}</p>
        ) : (
          <>
            <SportPeriodControls sport={sport} period={period} />

            {found.lifting?.trained && (
              <Card>
                <RadarChart
                  title="Muscle split"
                  axes={SPLIT_GROUPS}
                  series={[
                    {
                      name: names[0],
                      color: "var(--color-series-1)",
                      values: SPLIT_GROUPS.map((group) => found.lifting!.splits[0][group]),
                    },
                    {
                      name: names[1],
                      color: "var(--color-series-2)",
                      values: SPLIT_GROUPS.map((group) => found.lifting!.splits[1][group]),
                    },
                  ]}
                />
                <p className="text-xs text-ink-muted">
                  Each person&apos;s share of their own working sets, so the shapes compare even
                  when one of you trains more.
                </p>
              </Card>
            )}

            <Section
              title="Stats"
              info={`The last ${PERIOD_LABELS[period]}, from the viewer's side: the percentage is how far ahead or behind you are of ${names[1]}.${sport === "run" ? " Best pace is the fastest average pace over a run of at least 1 km; a faster pace leads." : ""}`}
            >
              <Card>
                <CompareTable
                  names={names}
                  rows={ACTIVITY_METRICS[sport].map((metric) => ({
                    key: metric,
                    label: ACTIVITY_METRIC_LABELS[metric],
                    lowerIsBetter: lowerIsBetter(metric),
                    a: side(found.totals[0], metric, unit),
                    b: side(found.totals[1], metric, unit),
                  }))}
                />
              </Card>
            </Section>

            {found.lifting && (
              <Section
                title="Exercises in common"
                info="Movements from the shared library whose load means the same everywhere, that you both logged in the period. Each opens the head to head for that movement."
              >
                {found.lifting.common.comparable.length > 0 ? (
                  <List>
                    {found.lifting.common.comparable.map((exercise) => (
                      <li key={exercise.id}>
                        <LinkRow
                          href={`/u/${them.username}/compare/${exercise.id}`}
                          title={exercise.name}
                          subtitle={BODY_REGION_LABELS[exercise.region]}
                        />
                      </li>
                    ))}
                  </List>
                ) : (
                  <Card>
                    <p className="text-sm text-ink-muted">
                      No comparable exercises in common in the last {PERIOD_LABELS[period]}.
                    </p>
                  </Card>
                )}
                {found.lifting.common.notComparable > 0 && (
                  <p className="flex items-center gap-1 px-1 text-sm text-ink-muted">
                    {found.lifting.common.notComparable === 1
                      ? "1 machine exercise in common is not compared: loads differ per machine."
                      : `${found.lifting.common.notComparable} machine exercises in common are not compared: loads differ per machine.`}
                    <InfoTip label="About machine exercises">
                      A machine&apos;s stack numbers are its own, so the app never compares them
                      across people. They still count toward sets, volume and the muscle split.
                    </InfoTip>
                  </p>
                )}
              </Section>
            )}
          </>
        )}
      </PageContent>
    </>
  );
}
