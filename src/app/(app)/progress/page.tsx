import type { Metadata } from "next";
import { FreshAfterSets } from "@/components/fresh-after-sets";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { trainingAnalytics } from "@/domain/analytics";
import { readActivityTotals } from "@/server/repositories/activity-analytics";
import { formatDateRange } from "@/lib/format";
import { fromKilograms } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { listBodyWeights } from "@/server/repositories/body-weight";
import { readTrainingData } from "@/server/repositories/training-data";
import { readMuscleVolume } from "@/server/repositories/muscle-volume";
import { readRecoveryHistory } from "@/server/repositories/recovery-history";
import { parseDateRangeOrDefault, parseWeekRangeOrDefault } from "@/server/validation/date-range";
import Loading from "./loading";
import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: "Progress" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once, except a set: a copy older
 * than the latest set is rendered again before it is shown (the open workout counts here). Only
 * a change made elsewhere, on another device or by the coach, can take up to the minute.
 */
export const unstable_dynamicStaleTime = 60;

export default async function ProgressPage(props: PageProps<"/progress">) {
  const user = await requireUser(),
    params = await props.searchParams;
  const profile = await getRequestProfile(user.id, user.email);
  const seen = await seenSetChanges();
  const { range, error: rangeError } = parseDateRangeOrDefault(
    {
      from: typeof params.from === "string" ? params.from : undefined,
      to: typeof params.to === "string" ? params.to : undefined,
    },
    profile.timeZone,
  );
  // The body map steps a week at a time, independent of the trend range above, so it
  // reads its own Monday-Sunday window: the same week boundary the programme uses.
  const { range: bodyRange, error: weekError } = parseWeekRangeOrDefault(
    params.week,
    profile.timeZone,
  );
  const bodyFrom = bodyRange.from;
  const bodyTo = bodyRange.to;

  const [training, body, bodyWeights, totals, recovery] = await withUser(
    getDb(),
    user.id,
    (tx) =>
      Promise.all([
        readTrainingData(tx, user.id, range),
        readMuscleVolume(tx, user.id, bodyRange),
        listBodyWeights(tx, user.id, range),
        // Complete per-sport totals, from the canonical tables every sport is written to.
        readActivityTotals(tx, user.id, { from: range.from, to: range.to }),
        readRecoveryHistory(tx, user.id, range, profile.timeZone),
      ]),
    { readOnly: true },
  );
  const preferredUnit = profile.preferredUnit === "lb" ? "lb" : "kg";
  const sportTotals =
    totals?.bySport.map((total) => ({
      sport: total.sport,
      label: ACTIVITY_SPORT_LABELS[total.sport],
      count: total.count,
      days: total.days,
      durationMs: total.durationMs,
      unknownDurations: total.unknownDurations,
      distanceMetres: total.distanceMetres,
      unknownDistances: total.unknownDistances,
    })) ?? null;
  const analytics = trainingAnalytics(training, profile.timeZone, range.from, range.to);

  // Eight weeks of training builds dozens of exercise/machine series, each carrying five
  // metric arrays. Sending them all was most of this page's payload, so only the chosen
  // one crosses the wire; picking another is a URL change the server answers.
  const options = analytics.series.map(({ id, name, machine, unit }) => ({
    id,
    name,
    machine,
    unit,
  }));
  const wanted = typeof params.series === "string" ? params.series : undefined;
  const selected = analytics.series.find((s) => s.id === wanted) ?? analytics.series[0] ?? null;

  return (
    <FreshAfterSets seen={seen} loading={<Loading />}>
      <PageHeader title="Progress" meta={formatDateRange(range.from, range.to)} />
      <PageContent>
        {(rangeError || weekError) && (
          <p role="alert" className="text-sm text-danger">
            {rangeError || weekError}
          </p>
        )}
        <ProgressView
          range={range}
          truncated={analytics.truncated}
          sportTotals={sportTotals}
          weeks={analytics.weeks}
          recovery={recovery}
          pace={analytics.pace}
          options={options}
          selected={selected}
          body={{ from: bodyFrom, to: bodyTo, ...body }}
          unit={preferredUnit}
          // Stored in kilograms, read in the account's own unit: the chart is about the
          // person, so it is drawn in the numbers they weigh themselves in.
          bodyWeight={bodyWeights.map(({ measuredOn, weightKg }) => ({
            date: measuredOn,
            value: fromKilograms(weightKg, preferredUnit),
          }))}
        />
      </PageContent>
    </FreshAfterSets>
  );
}
