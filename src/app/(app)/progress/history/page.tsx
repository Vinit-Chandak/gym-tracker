import type { Metadata } from "next";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { Effort } from "@/domain/activity";
import { formatDuration, formatPace } from "@/domain/pace";
import { formatDateRange, formatDateTime, formatIsoWeekdayDay, formatRunKm } from "@/lib/format";
import { originQuery } from "@/lib/nav";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listGyms } from "@/server/repositories/gyms";
import { listActivityPage } from "@/server/repositories/activity-analytics";
import { readHistory } from "@/server/repositories/history";
import { parseDateRangeOrDefault } from "@/server/validation/date-range";
import { HistoryView, type HistoryItem } from "./history-view";

export const metadata: Metadata = { title: "History" };

/**
 * Coming back to this section within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device or by the coach, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

/** "sleep 7 h, fatigue 2": readings as the tail of a row's one line, the missing ones left out. */
function readings(values: [string, number | null, string?][]): string[] {
  return values
    .filter(([, value]) => value !== null)
    .map(([label, value, unit]) => `${label} ${value}${unit ? ` ${unit}` : ""}`);
}
/**
 * A run's effort, said to be unconfirmed where it is a migrated number nobody stood by.
 *
 * "Effort", not "RPE", and for the same reason the rides and swims below say it: this reads
 * out of five like every other endurance effort, while a strength set's RPE is still out of
 * ten. One word over two scales is what the five-step change was undoing.
 */
function runEffort(effort: Effort): string | null {
  if (effort.status === "reported") return `effort ${effort.value}`;
  if (effort.value === null) return null;
  return `effort ${effort.value} (unconfirmed)`;
}

/** The parts of a row's line, joined as a phrase rather than a string of dots. */
function line(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

const RIDE_NAMES: Record<string, string> = { outdoor: "Outdoor ride", indoor: "Indoor ride" };
const SWIM_NAMES: Record<string, string> = { pool: "Pool swim", open_water: "Open water swim" };

/**
 * History, one of Progress's sections (ADR 0034): every workout, run, ride, swim and recovery
 * reading in the range, newest first. It was a tab of its own until Food took its place.
 *
 * Each row is its name, one line of when and how, and the figure it is remembered by: a
 * workout's sets, a run's distance, a ride's or a swim's distance or else its time.
 */
export default async function HistoryPage(props: PageProps<"/progress/history">) {
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
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [training, gyms] = await Promise.all([
        readHistory(tx, user.id, range),
        listGyms(tx, user.id),
      ]);
      // Runs are already in `training`, read from this same canonical table by a reader that
      // also hands back their pace and the gym a migrated one named. These two need neither.
      const endurance = await listActivityPage(tx, user.id, {
        sports: ["cycling", "swimming"],
        from: range.from,
        to: range.to,
        limit: 100,
      });
      return { training, gyms, endurance };
    },
    { readOnly: true },
  );
  const items: HistoryItem[] = [
    ...data.training.workouts.map((w) => ({
      id: w.id,
      kind: "workout" as const,
      date: w.startedAt.toISOString(),
      title: w.dayName ?? "Ad hoc session",
      subtitle: line([
        formatDateTime(w.startedAt, profile.timeZone),
        w.gymName,
        ...readings([["sleep", w.sleepHours, "h"]]),
      ]),
      // Opened from here, the entry keeps Progress selected rather than the tab it lives under,
      // and goes back to History.
      href: `/workouts/${w.id}${originQuery("history")}` as const,
      meta: `${w.setCount} ${w.setCount === 1 ? "set" : "sets"}`,
      gymId: w.gymId,
      exercises: w.exercises.map((e) => ({
        id: e.exerciseId,
        name: e.name,
        machineId: e.machineId,
        machineName: e.machineName ? `${e.machineName}, ${w.gymName}` : null,
      })),
    })),
    ...data.training.runs.map((r) => ({
      id: r.id,
      kind: "run" as const,
      date: r.startedAt.toISOString(),
      title: r.title ?? (r.environment === "treadmill" ? "Treadmill run" : "Outdoor run"),
      subtitle: line([
        formatDateTime(r.startedAt, profile.timeZone),
        formatDuration(r.durationSeconds),
        `${formatPace(r.averagePaceSecondsPerKm)} /km`,
        runEffort(r.effort),
      ]),
      href: `/training/activities/${r.id}${originQuery("history")}` as const,
      meta: `${formatRunKm(r.distanceMeters)} km`,
      gymId: r.gymId,
      exercises: [],
    })),
    ...data.endurance.items.map((activity) => {
      const cycling = activity.sport === "cycling";
      // An unrecorded duration says so by its absence rather than reading as zero minutes.
      const duration =
        activity.durationMs === null
          ? null
          : formatDuration(Math.round(activity.durationMs / 1000));
      const distance =
        activity.distanceMetres === null
          ? null
          : cycling
            ? `${formatRunKm(activity.distanceMetres)} km`
            : `${Math.round(activity.distanceMetres)} m`;
      return {
        id: activity.id,
        kind: activity.sport as "cycling" | "swimming",
        date: activity.startedAt.toISOString(),
        title:
          activity.title ??
          (cycling ? RIDE_NAMES : SWIM_NAMES)[activity.environment ?? ""] ??
          (cycling ? "Ride" : "Swim"),
        subtitle: line([
          formatDateTime(activity.startedAt, profile.timeZone),
          // The time is the row's figure when there is no distance, so it is not said twice.
          distance === null ? null : duration,
          ...readings([
            ["effort", activity.effortStatus === "reported" ? activity.effortValue : null],
          ]),
        ]),
        href: `/training/activities/${activity.id}${originQuery("history")}` as const,
        meta: distance ?? duration ?? "",
        gymId: null,
        exercises: [],
      };
    }),
    ...data.training.recovery.map((r) => ({
      id: r.id,
      kind: "recovery" as const,
      date: r.date,
      title: "Recovery",
      subtitle: line([
        formatIsoWeekdayDay(r.date),
        ...readings([
          ["sleep", r.sleepHours, "h"],
          ["energy", r.energy],
          ["fatigue", r.fatigue],
          ["soreness", r.soreness],
        ]),
      ]),
      meta: "",
      gymId: null,
      exercises: [],
      recovery: r.notes ?? undefined,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      {/* The tab's name, as on every other section of it; the picker below says which. */}
      <PageHeader title="Progress" meta={formatDateRange(range.from, range.to)} />
      <PageContent>
        {rangeError && (
          <p role="alert" className="text-sm text-danger">
            {rangeError}
          </p>
        )}
        <HistoryView
          range={range}
          items={items}
          gyms={data.gyms.map((g) => ({ id: g.id, name: g.name }))}
          truncated={data.training.truncated || data.endurance.nextCursor !== null}
        />
      </PageContent>
    </>
  );
}
