import type { Metadata } from "next";
import { DateRangeForm } from "@/components/date-range-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { liftingAdherence, trainingAnalytics } from "@/domain/analytics";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { weekStart } from "@/domain/running";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getSchedule } from "@/server/repositories/schedule";
import { readTrainingData } from "@/server/repositories/training-data";
import { readMuscleVolume } from "@/server/repositories/muscle-volume";
import { parseDateRange, parseDateRangeOrDefault } from "@/server/validation/date-range";
import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: "Progress" };
export default async function ProgressPage(props: PageProps<"/progress">) {
  const user = await requireUser(),
    params = await props.searchParams;
  const profile = await getRequestProfile(user.id, user.email);
  const { range, error: rangeError } = parseDateRangeOrDefault(
    {
      from: typeof params.from === "string" ? params.from : undefined,
      to: typeof params.to === "string" ? params.to : undefined,
    },
    profile.timeZone,
  );
  // The body map steps a week at a time, independent of the trend range above, so it
  // reads its own Tuesday-Monday window: the same week boundary the programme uses.
  const asked =
    typeof params.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.week)
      ? params.week
      : todayInTimeZone(profile.timeZone);
  const bodyFrom = weekStart(asked);
  const bodyTo = addDays(bodyFrom, 6);
  const bodyRange = parseDateRange({ from: bodyFrom, to: bodyTo }, profile.timeZone);

  const [training, schedule, body] = await withUser(getDb(), user.id, (tx) =>
    Promise.all([
      readTrainingData(tx, user.id, range),
      getSchedule(tx, user.id),
      readMuscleVolume(tx, user.id, bodyRange),
    ]),
  );
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
        {rangeError && (
          <p role="alert" className="text-sm text-danger">
            {rangeError}
          </p>
        )}
        <DateRangeForm from={range.from} to={range.to} />
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
          body={{ from: bodyFrom, to: bodyTo, ...body }}
        />
      </PageContent>
    </>
  );
}
