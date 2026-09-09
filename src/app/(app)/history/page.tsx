import type { Metadata } from "next";
import { DateRangeForm } from "@/components/date-range-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatDuration, formatPace } from "@/domain/pace";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { readTrainingData } from "@/server/repositories/training-data";
import { parseDateRangeOrDefault } from "@/server/validation/date-range";
import { HistoryView, type HistoryItem } from "./history-view";

export const metadata: Metadata = { title: "History" };
function readings(values: [string, number | null][]) {
  return values
    .filter(([, value]) => value !== null)
    .map(([label, value]) => `${label} ${value}`)
    .join(" · ");
}
export default async function HistoryPage(props: PageProps<"/history">) {
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
  const data = await withUser(getDb(), user.id, async (tx) => {
    const [training, gyms] = await Promise.all([
      readTrainingData(tx, user.id, range),
      listGyms(tx, user.id),
    ]);
    return { training, gyms };
  });
  const items: HistoryItem[] = [
    ...data.training.workouts
      .filter((w) => w.completedAt)
      .map((w) => ({
        id: w.id,
        kind: "workout" as const,
        date: w.startedAt.toISOString(),
        title: w.day?.name ?? "Ad hoc session",
        subtitle: `${formatDateTime(w.startedAt, profile.timeZone)} · ${w.gym.name}`,
        href: `/workouts/${w.id}` as const,
        meta: `${w.exercises.reduce((n, e) => n + e.sets.length, 0)} sets`,
        gymId: w.gymId,
        exercises: w.exercises.map((e) => ({
          id: e.exerciseId,
          name: e.exercise.name,
          machineId: e.equipment?.id ?? null,
          machineName: e.equipment ? `${e.equipment.name} · ${w.gym.name}` : null,
        })),
        recovery: readings([
          ["Sleep h", w.sleepHours],
          ["Back", w.backPainPre],
          ["Shin L", w.shinLeftPre],
          ["Shin R", w.shinRightPre],
        ]),
      })),
    ...data.training.runs.map((r) => ({
      id: r.id,
      kind: "run" as const,
      date: r.startedAt.toISOString(),
      title: `${r.mode === "treadmill" ? "Treadmill" : "Outdoor"} · ${Math.round(r.distanceMeters / 10) / 100} km`,
      subtitle: formatDateTime(r.startedAt, profile.timeZone),
      href: `/runs/${r.id}` as const,
      meta: `${formatDuration(r.durationSeconds)} · ${formatPace(r.averagePaceSecondsPerKm)}/km`,
      gymId: r.gymId,
      exercises: [],
      recovery: readings([
        ["RPE", r.rpe],
        ["Shin L after", r.shinLeftPost],
        ["Shin R after", r.shinRightPost],
      ]),
    })),
    ...data.training.recovery.map((r) => ({
      id: r.id,
      kind: "recovery" as const,
      date: r.date,
      title: `Recovery · ${r.date}`,
      subtitle: readings([
        ["Sleep h", r.sleepHours],
        ["Energy", r.energy],
        ["Fatigue", r.fatigue],
        ["Back", r.backPain],
        ["Shin L", r.shinLeft],
        ["Shin R", r.shinRight],
      ]),
      meta: "",
      gymId: null,
      exercises: [],
      recovery: r.notes ?? undefined,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeader title="History" />
      <PageContent>
        {rangeError && (
          <p role="alert" className="text-sm text-danger">
            {rangeError}
          </p>
        )}
        <DateRangeForm from={range.from} to={range.to} />
        {data.training.truncated && (
          <p role="status" className="text-sm text-warning">
            Showing the newest 500 workouts and runs. Narrow the dates to see every entry.
          </p>
        )}
        <HistoryView items={items} gyms={data.gyms.map((g) => ({ id: g.id, name: g.name }))} />
      </PageContent>
    </>
  );
}
