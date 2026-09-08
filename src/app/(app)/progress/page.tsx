import type { Metadata } from "next";
import { DateRangeForm } from "@/components/date-range-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { liftingAdherence, trainingAnalytics } from "@/domain/analytics";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { getSchedule } from "@/server/repositories/schedule";
import { readTrainingData } from "@/server/repositories/training-data";
import { parseDateRangeOrDefault } from "@/server/validation/date-range";
import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: "Progress" };
export default async function ProgressPage(props: PageProps<"/progress">) {
  const user = await requireUser(),
    params = await props.searchParams;
  const profile = await withUser(getDb(), user.id, (tx) => ensureProfile(tx, user));
  const { range, error: rangeError } = parseDateRangeOrDefault(
    {
      from: typeof params.from === "string" ? params.from : undefined,
      to: typeof params.to === "string" ? params.to : undefined,
    },
    profile.timeZone,
  );
  const { training, schedule } = await withUser(getDb(), user.id, async (tx) => ({
    training: await readTrainingData(tx, user.id, range),
    schedule: await getSchedule(tx, user.id),
  }));
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
    <>
      <PageHeader title="Progress" />
      <PageContent>
        <Card>
          {rangeError && (
            <p role="alert" className="text-sm text-danger">
              {rangeError}
            </p>
          )}
          <DateRangeForm from={range.from} to={range.to} />
        </Card>
        <ProgressView
          key={`${range.from}:${range.to}`}
          summary={{
            workouts: analytics.workouts,
            runs: analytics.runs,
            trainingDays: analytics.trainingDays,
            truncated: analytics.truncated,
          }}
          adherence={liftingAdherence(schedule)}
          weeks={analytics.weeks}
          recovery={analytics.recovery.map(({ date, sleep, back, leftShin, rightShin }) => ({
            date,
            sleep,
            back,
            leftShin,
            rightShin,
          }))}
          pace={analytics.pace}
          options={options}
          selected={selected}
        />
      </PageContent>
    </>
  );
}
