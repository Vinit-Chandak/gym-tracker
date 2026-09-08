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
import { parseDateRange } from "@/server/validation/date-range";
import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: "Progress" };
export default async function ProgressPage(props: PageProps<"/progress">) {
  const user = await requireUser(),
    params = await props.searchParams;
  const profile = await withUser(getDb(), user.id, (tx) => ensureProfile(tx, user));
  let range;
  try {
    range = parseDateRange(
      {
        from: typeof params.from === "string" ? params.from : undefined,
        to: typeof params.to === "string" ? params.to : undefined,
      },
      profile.timeZone,
    );
  } catch {
    return (
      <>
        <PageHeader title="Progress" />
        <PageContent>
          <Card>
            <p role="alert">Choose valid dates, From before To, up to one year apart.</p>
            <DateRangeForm {...parseDateRange({}, profile.timeZone)} />
          </Card>
        </PageContent>
      </>
    );
  }
  const { training, schedule } = await withUser(getDb(), user.id, async (tx) => ({
    training: await readTrainingData(tx, user.id, range),
    schedule: await getSchedule(tx, user.id),
  }));
  return (
    <>
      <PageHeader title="Progress" />
      <PageContent>
        <Card>
          <DateRangeForm from={range.from} to={range.to} />
        </Card>
        <ProgressView
          key={`${range.from}:${range.to}`}
          data={trainingAnalytics(training, profile.timeZone, range.from, range.to)}
          adherence={liftingAdherence(schedule)}
        />
      </PageContent>
    </>
  );
}
