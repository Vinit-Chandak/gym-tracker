import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CompareHeader } from "@/components/compare-header";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { CompareBar } from "@/components/ui/compare-bars";
import { InfoTip } from "@/components/ui/info-tip";
import { LinkRow, List } from "@/components/ui/link-row";
import { PeriodSelect } from "@/components/ui/period-select";
import { RadarChart } from "@/components/ui/radar-chart";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { muscleSplit, SPLIT_GROUPS } from "@/domain/muscle-split";
import { PERIOD_LABELS } from "@/domain/period";
import { formatMinutes, formatSharedLoad } from "@/lib/format";
import { BODY_REGION_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { hiddenTrainingLine, loadHeadToHead } from "@/server/queries/head-to-head";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  readExercisesInCommon,
  readMuscleSets,
  readPeriodTotals,
  type PeriodTotals,
} from "@/server/repositories/shared-stats";
import { requireUsername } from "@/server/validation/params";
import { parsePeriod, periodRange } from "@/server/validation/period";

export const metadata: Metadata = { title: "Compare" };

const NONE: PeriodTotals = {
  sessions: 0,
  workingSets: 0,
  volumeKg: 0,
  durationSeconds: 0,
  activeDays: 0,
  records: 0,
};

/**
 * Head to head, overall (plan §3.10): the two of you, the shape of each split, one bar pair
 * per lifting number for the period, and the comparable movements you both did, each leading
 * to its own comparison. Everything is in the viewer's unit. Running joins in its own phase.
 */
export default async function ComparePage(props: PageProps<"/u/[username]/compare">) {
  const user = await requireUser();
  const handle = requireUsername((await props.params).username);
  const period = parsePeriod((await props.searchParams).period);
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
      const [totals, mine, theirs, common] = await Promise.all([
        readPeriodTotals(tx, ids, "workout", range),
        readMuscleSets(tx, head.me.id, range),
        readMuscleSets(tx, head.them.id, range),
        readExercisesInCommon(tx, head.me.id, head.them.id, range),
      ]);
      return {
        ...head,
        totals: [totals.get(head.me.id) ?? NONE, totals.get(head.them.id) ?? NONE] as const,
        splits: [muscleSplit(mine), muscleSplit(theirs)] as const,
        trained: Object.keys(mine).length > 0 || Object.keys(theirs).length > 0,
        common,
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
            <PeriodSelect value={period} />

            {found.trained && (
              <Card>
                <RadarChart
                  title="Muscle split"
                  axes={SPLIT_GROUPS}
                  series={[
                    {
                      name: names[0],
                      color: "var(--color-series-1)",
                      values: SPLIT_GROUPS.map((group) => found.splits[0][group]),
                    },
                    {
                      name: names[1],
                      color: "var(--color-series-2)",
                      values: SPLIT_GROUPS.map((group) => found.splits[1][group]),
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
              info={`The last ${PERIOD_LABELS[period]}, from the viewer's side: the percentage is how far ahead or behind you are of ${names[1]}.`}
            >
              <Card className="space-y-4">
                <CompareBar
                  label="Workouts"
                  names={names}
                  a={{ value: found.totals[0].sessions, text: String(found.totals[0].sessions) }}
                  b={{ value: found.totals[1].sessions, text: String(found.totals[1].sessions) }}
                />
                <CompareBar
                  label="Workout time"
                  names={names}
                  a={{
                    value: found.totals[0].durationSeconds,
                    text: formatMinutes(found.totals[0].durationSeconds / 60),
                  }}
                  b={{
                    value: found.totals[1].durationSeconds,
                    text: formatMinutes(found.totals[1].durationSeconds / 60),
                  }}
                />
                <CompareBar
                  label="Total volume"
                  names={names}
                  a={{
                    value: found.totals[0].volumeKg,
                    text: formatSharedLoad(found.totals[0].volumeKg, unit),
                  }}
                  b={{
                    value: found.totals[1].volumeKg,
                    text: formatSharedLoad(found.totals[1].volumeKg, unit),
                  }}
                />
                <CompareBar
                  label="Working sets"
                  names={names}
                  a={{
                    value: found.totals[0].workingSets,
                    text: String(found.totals[0].workingSets),
                  }}
                  b={{
                    value: found.totals[1].workingSets,
                    text: String(found.totals[1].workingSets),
                  }}
                />
                <CompareBar
                  label="Active days"
                  names={names}
                  a={{
                    value: found.totals[0].activeDays,
                    text: String(found.totals[0].activeDays),
                  }}
                  b={{
                    value: found.totals[1].activeDays,
                    text: String(found.totals[1].activeDays),
                  }}
                />
                <CompareBar
                  label="Records set"
                  names={names}
                  a={{ value: found.totals[0].records, text: String(found.totals[0].records) }}
                  b={{ value: found.totals[1].records, text: String(found.totals[1].records) }}
                />
              </Card>
            </Section>

            <Section
              title="Exercises in common"
              info="Movements from the shared library whose load means the same everywhere, that you both logged in the period. Each opens the head to head for that movement."
            >
              {found.common.comparable.length > 0 ? (
                <List>
                  {found.common.comparable.map((exercise) => (
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
              {found.common.notComparable > 0 && (
                <p className="flex items-center gap-1 px-1 text-sm text-ink-muted">
                  {found.common.notComparable === 1
                    ? "1 machine exercise in common is not compared: loads differ per machine."
                    : `${found.common.notComparable} machine exercises in common are not compared: loads differ per machine.`}
                  <InfoTip label="About machine exercises">
                    A machine&apos;s stack numbers are its own, so the app never compares them
                    across people. They still count toward sets, volume and the muscle split.
                  </InfoTip>
                </p>
              )}
            </Section>
          </>
        )}
      </PageContent>
    </>
  );
}
