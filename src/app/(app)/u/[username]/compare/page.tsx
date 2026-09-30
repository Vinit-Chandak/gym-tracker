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
import { sportOfLegacy } from "@/domain/activity";
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
import { SPORT_TONE } from "@/lib/sport-tone";
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

import { HiddenTraining } from "../hidden-training";

export const metadata: Metadata = { title: "Compare" };

/** One side of a stats row: the period's number, or "—" where the period cannot give one. */
function side(totals: PeriodTotals, metric: ActivityMetric, unit: BodyLoadUnit): CompareSide {
  const value = activityValue(totals, metric);
  return { value, text: value === null ? "—" : formatActivityMetric(metric, value, unit) };
}

/**
 * Head to head, overall (plan §3.10, §3.16): the two of you, then for lifting the shape of
 * each split, the period's numbers side by side with the difference under each, and the
 * comparable movements you both did, each leading to its own comparison; endurance sports
 * show their own numbers, since a split and exercises in common do not apply. Everything is in
 * the viewer's unit.
 */
export default async function ComparePage(props: PageProps<"/u/[username]/compare">) {
  const user = await requireUser();
  const handle = requireUsername((await props.params).username);
  const params = await props.searchParams;
  const sport = parseSport(params.sport);
  const period = parsePeriod(params.period);
  const selection = `sport=${sport}&period=${period}`;
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
      if (sport !== "workout") return { ...head, totals: pair, lifting: null };
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
  if (found === "self") redirect(`/u/${handle}?${selection}`);
  const { me, them } = found;
  const names: [string, string] = [
    me.displayName || me.username,
    them.displayName || them.username,
  ];

  const back = `/u/${them.username}?${selection}` as const;
  if (!("totals" in found)) {
    return (
      <>
        <PageHeader title="Compare" meta={`With ${names[1]}`} backHref={back} />
        <PageContent>
          <CompareHeader a={me} b={them} />
          <HiddenTraining line={hiddenTrainingLine(found)} />
        </PageContent>
      </>
    );
  }

  // The count the sport is measured in leads, as it does on each person's own page.
  const lead = ACTIVITY_METRICS[sport][0]!;
  const leadSides = [side(found.totals[0], lead, unit), side(found.totals[1], lead, unit)];

  return (
    <>
      <PageHeader title="Compare" meta={`With ${names[1]}`} backHref={back} />
      <PageContent>
        <SportPeriodControls sport={sport} period={period} />

        <CompareHeader
          a={me}
          b={them}
          tone={SPORT_TONE[sportOfLegacy(sport)]}
          score={{
            label: `${ACTIVITY_METRIC_LABELS[lead]}, last ${PERIOD_LABELS[period]}`,
            a: leadSides[0]!.text,
            b: leadSides[1]!.text,
          }}
        />

        {found.lifting?.trained && (
          <Section
            title="Muscle split"
            info="Each person's share of their own working sets, so the shapes compare even when one of you trains more."
          >
            <Card>
              <RadarChart
                title="Share of working sets"
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
            </Card>
          </Section>
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
                      prefetch="intent"
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
                  ? "1 machine exercise in common is not compared."
                  : `${found.lifting.common.notComparable} machine exercises in common are not compared.`}
                <InfoTip label="About machine exercises" className="-my-2">
                  Loads differ per machine: a machine&apos;s stack numbers are its own, so the app
                  never compares them across people. They still count toward sets, volume and the
                  muscle split.
                </InfoTip>
              </p>
            )}
          </Section>
        )}
      </PageContent>
    </>
  );
}
