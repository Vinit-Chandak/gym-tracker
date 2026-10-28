import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CompareHeader } from "@/components/compare-header";
import { GraphRangeProvider } from "@/components/graph/graph-range-context";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { CompareTable, type CompareSide } from "@/components/ui/compare-table";
import { InfoTip } from "@/components/ui/info-tip";
import { NavRow } from "@/components/ui/nav-row";
import { RadarChart } from "@/components/ui/radar-chart";
import { Section } from "@/components/ui/section";
import { SportSpanControls } from "@/components/ui/sport-span-controls";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  ACTIVITY_METRIC_LABELS,
  ACTIVITY_METRICS,
  activityValue,
  lowerIsBetter,
  type ActivityMetric,
} from "@/domain/leaderboard";
import { RANGE_PRESET_WORDS, readWindowOf } from "@/domain/graph-range";
import { legacySportOf } from "@/domain/activity";
import { muscleSplit, SPLIT_GROUPS } from "@/domain/muscle-split";
import { todayInTimeZone } from "@/domain/program-calendar";
import { sportsOnOffer } from "@/domain/sport-scope";
import type { BodyLoadUnit } from "@/domain/types";
import { formatActivityMetric } from "@/lib/format";
import type { LengthUnit } from "@/lib/distance-units";
import { holdHyphens } from "@/lib/facts";
import { BODY_REGION_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { rememberedRange } from "@/server/queries/graph-range";
import { hiddenTrainingLine, loadHeadToHead } from "@/server/queries/head-to-head";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  EMPTY_TOTALS,
  readDistanceUnits,
  readExercisesInCommon,
  readGroupSets,
  readPeriodTotals,
  readSharedSports,
  type PeriodTotals,
} from "@/server/repositories/shared-stats";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";
import { requireUsername } from "@/server/validation/params";
import { socialWindow } from "@/server/validation/period";
import { askedSport } from "@/server/validation/sport";

export const metadata: Metadata = { title: "Compare" };

/** One side of a stats row: the span's number, or "—" where the span cannot give one. */
function side(
  totals: PeriodTotals,
  metric: ActivityMetric,
  unit: BodyLoadUnit,
  distanceUnit: LengthUnit | undefined,
): CompareSide {
  const value = activityValue(totals, metric);
  return {
    value,
    text: value === null ? "—" : formatActivityMetric(metric, value, unit, distanceUnit),
  };
}

/**
 * Head to head, overall (plan §3.10, §3.16): the two of you, then for lifting the shape of
 * each split, the span's numbers side by side with the difference under each, and the
 * comparable movements you both did, each leading to its own comparison; endurance sports
 * show their own numbers, since a split and exercises in common do not apply. Everything is in
 * the viewer's unit, distances in the one they use for the sport.
 */
export default async function ComparePage(props: PageProps<"/u/[username]/compare">) {
  const user = await requireUser();
  const handle = requireUsername((await props.params).username);
  const params = await props.searchParams;
  const asked = askedSport(params.sport);
  const viewer = await getRequestProfile(user.id, user.email);
  const unit = viewer.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  // The span every graph shares (ADR 0044), from the viewer's calendar and on to now.
  const preset = await rememberedRange();
  const read = readWindowOf({ preset }, todayInTimeZone(viewer.timeZone));
  const range = socialWindow(read.from, read.to, viewer.timeZone);
  const found = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const head = await loadHeadToHead(tx, user.id, handle);
      if (head === null || head === "self" || !head.visible) return head;
      const ids = [head.me.id, head.them.id];
      // A sport either of you does: shared by either, or on in your own sports. Neither of you
      // swims, so there is no Swimming tab to read two zeros under.
      const [shared, enabled] = await Promise.all([
        readSharedSports(tx, ids),
        enabledSportsFor(tx, head.me.id),
      ]);
      const sports = sportsOnOffer([...shared, ...enabled.map(legacySportOf)], asked);
      const sport = asked ?? sports[0]!;
      const totals = await readPeriodTotals(tx, ids, sport, range);
      const pair = [
        totals.get(head.me.id) ?? EMPTY_TOTALS,
        totals.get(head.them.id) ?? EMPTY_TOTALS,
      ] as const;
      if (sport !== "workout") {
        const units = await readDistanceUnits(tx, user.id);
        return { ...head, sport, sports, totals: pair, lifting: null, distanceUnit: units[sport] };
      }
      const [mine, theirs, common] = await Promise.all([
        readGroupSets(tx, head.me.id, range),
        readGroupSets(tx, head.them.id, range),
        readExercisesInCommon(tx, head.me.id, head.them.id, range),
      ]);
      return {
        ...head,
        sport,
        sports,
        totals: pair,
        distanceUnit: undefined,
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
  if (found === "self") redirect(`/u/${handle}${asked ? `?sport=${asked}` : ""}`);
  const { me, them } = found;
  // Back to the person, by name, in the sport being compared, or the one asked for while it is
  // hidden.
  const sport = "sport" in found ? found.sport : asked;
  const back = `/u/${them.username}${sport ? `?sport=${sport}` : ""}` as const;
  const names: [string, string] = [
    me.displayName || me.username,
    them.displayName || them.username,
  ];

  return (
    <>
      <PageHeader title="Compare" backHref={back} backLabel={names[1]} />
      <PageContent>
        <CompareHeader a={me} b={them} />
        {!("totals" in found) ? (
          <p className="text-sm text-ink-muted">{hiddenTrainingLine(found)}</p>
        ) : (
          <>
            <GraphRangeProvider preset={preset}>
              <SportSpanControls sport={found.sport} sports={found.sports} />
            </GraphRangeProvider>

            {found.lifting?.trained && (
              // Named by its section, as the compare page's others are, so how the shapes are
              // drawn can be its ⓘ; the chart keeps its caption for a screen reader.
              <Section
                title="Muscle split"
                info="Each person's share of their own working sets, so the shapes compare however much each trains. Each set counts once, for its main group."
              >
                <Card>
                  <RadarChart
                    title="Muscle split"
                    className="[&_figcaption]:sr-only"
                    axes={SPLIT_GROUPS}
                    series={[
                      {
                        // "You", as the table beneath heads your column: two people can share
                        // a display name, and the legend has to say which shape is yours.
                        name: "You",
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
              info={`Over ${RANGE_PRESET_WORDS[preset]}: the percentage is how far ahead or behind you are.${found.sport === "run" ? " Best pace is over a run of 1 km or more." : ""}`}
            >
              <Card>
                <CompareTable
                  names={names}
                  rows={ACTIVITY_METRICS[found.sport].map((metric) => ({
                    key: metric,
                    label: ACTIVITY_METRIC_LABELS[metric],
                    lowerIsBetter: lowerIsBetter(metric),
                    a: side(found.totals[0], metric, unit, found.distanceUnit),
                    b: side(found.totals[1], metric, unit, found.distanceUnit),
                  }))}
                />
              </Card>
            </Section>

            {found.lifting && (
              <Section
                title="Exercises in common"
                info="Movements from the shared library whose load means the same everywhere, that you both logged in the span."
              >
                {found.lifting.common.comparable.length > 0 ? (
                  // A list to choose from, in a card, each name at the card's edge with the row's
                  // width up to the chevron (DESIGN.md, Rows and signs).
                  <ul className="ov-panel ov-panel-list">
                    {found.lifting.common.comparable.map((exercise) => (
                      <NavRow
                        key={exercise.id}
                        prefetch="intent"
                        href={`/u/${them.username}/compare/${exercise.id}`}
                        label={holdHyphens(exercise.name)}
                        sub={BODY_REGION_LABELS[exercise.region]}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-muted">
                    {preset === "all"
                      ? "No comparable exercises in common yet."
                      : `No comparable exercises in common in ${RANGE_PRESET_WORDS[preset]}.`}
                  </p>
                )}
                {/* At the names' edge, as the label over them is. */}
                {found.lifting.common.notComparable > 0 && (
                  <p className="flex items-center gap-1 text-sm text-ink-muted">
                    {found.lifting.common.notComparable === 1
                      ? "1 machine exercise in common is not compared."
                      : `${found.lifting.common.notComparable} machine exercises in common are not compared.`}
                    <InfoTip label="About machine exercises">
                      A machine&apos;s numbers are its own, so they are never compared across
                      people. They still count toward sets, volume and the muscle split.
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
