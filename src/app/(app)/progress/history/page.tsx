import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { Effort } from "@/domain/activity";
import { formatDuration, formatPace } from "@/domain/pace";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatRunKm, formatTime } from "@/lib/format";
import { originQuery } from "@/lib/nav";
import { UNPLANNED_SESSION } from "@/lib/labels";
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

function readings(values: [string, number | null, string?][]) {
  return values
    .filter(([, value]) => value !== null)
    .map(([label, value, unit]) => `${label} ${value}${unit ? ` ${unit}` : ""}`)
    .join(" · ");
}
/**
 * A run's effort, said to be unconfirmed where it is a migrated number nobody stood by.
 *
 * "Effort", not "RPE", and for the same reason the rides and swims below say it: this reads
 * out of five like every other endurance effort, while a strength set's RPE is still out of
 * ten. One word over two scales is what the five-step change was undoing.
 */
function runEffort(effort: Effort) {
  if (effort.status === "reported") return `Effort ${effort.value}`;
  if (effort.value === null) return "";
  return `Effort ${effort.value} (unconfirmed)`;
}
/**
 * History, one of Progress's sections (ADR 0034): every workout, run, ride, swim and recovery
 * reading in the range, newest first. It was a tab of its own until Food took its place.
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
  // Each entry under its own local day, at its local time, as the list is read.
  const dayOf = (at: Date) => todayInTimeZone(profile.timeZone, at);
  const timeOf = (at: Date) => formatTime(at, profile.timeZone);
  const items: HistoryItem[] = [
    ...data.training.workouts.map((w) => ({
      id: w.id,
      kind: "workout" as const,
      date: w.startedAt.toISOString(),
      day: dayOf(w.startedAt),
      title: w.dayName ?? UNPLANNED_SESSION,
      subtitle: `${timeOf(w.startedAt)} · ${w.gymName}`,
      // Opened from here, the entry keeps Progress selected rather than the tab it lives under,
      // and goes back to History.
      href: `/workouts/${w.id}${originQuery("history")}` as const,
      meta: `${w.setCount} ${w.setCount === 1 ? "set" : "sets"}`,
      gymId: w.gymId,
      exercises: w.exercises.map((e) => ({
        id: e.exerciseId,
        name: e.name,
        machineId: e.machineId,
        machineName: e.machineName ? `${e.machineName} · ${w.gymName}` : null,
      })),
      recovery: readings([["Sleep", w.sleepHours, "h"]]),
    })),
    ...data.training.runs.map((r) => ({
      id: r.id,
      kind: "run" as const,
      date: r.startedAt.toISOString(),
      day: dayOf(r.startedAt),
      title: `${r.environment === "treadmill" ? "Treadmill" : "Outdoor"} · ${formatRunKm(r.distanceMeters)} km`,
      subtitle: timeOf(r.startedAt),
      href: `/training/activities/${r.id}${originQuery("history")}` as const,
      meta: `${formatDuration(r.durationSeconds)} · ${formatPace(r.averagePaceSecondsPerKm)}/km`,
      gymId: r.gymId,
      exercises: [],
      recovery: runEffort(r.effort),
    })),
    ...data.endurance.items.map((activity) => ({
      id: activity.id,
      kind: activity.sport as "cycling" | "swimming",
      date: activity.startedAt.toISOString(),
      day: activity.occurredOn,
      title:
        activity.distanceMetres === null
          ? activity.sport === "cycling"
            ? "Ride"
            : "Swim"
          : `${activity.sport === "cycling" ? "Ride" : "Swim"} · ${formatRunKm(activity.distanceMetres)} km`,
      subtitle: timeOf(activity.startedAt),
      href: `/training/activities/${activity.id}${originQuery("history")}` as const,
      // An unrecorded duration says so rather than reading as zero minutes.
      meta:
        activity.durationMs === null ? "" : formatDuration(Math.round(activity.durationMs / 1000)),
      gymId: null,
      exercises: [],
      recovery: readings([
        ["Effort", activity.effortStatus === "reported" ? activity.effortValue : null],
      ]),
    })),
    ...data.training.recovery.map((r) => ({
      id: r.id,
      kind: "recovery" as const,
      date: r.date,
      day: r.date,
      title: "Recovery",
      subtitle: readings([
        ["Sleep", r.sleepHours, "h"],
        ["Energy", r.energy],
        ["Fatigue", r.fatigue],
        ["Soreness", r.soreness],
      ]),
      meta: "",
      gymId: null,
      exercises: [],
      recovery: r.notes ?? undefined,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    // Progress's own opening, as on every other section of it; the picker says which.
    <div className="progress page-width pt-safe">
      <HistoryView
        error={rangeError}
        range={range}
        items={items}
        gyms={data.gyms.map((g) => ({ id: g.id, name: g.name }))}
        truncated={data.training.truncated || data.endurance.nextCursor !== null}
      />
    </div>
  );
}
