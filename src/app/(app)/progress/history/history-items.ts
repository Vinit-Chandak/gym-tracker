import type { Effort } from "@/domain/activity";
import { formatDuration, formatPace } from "@/domain/pace";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatRunKm, formatTime } from "@/lib/format";
import { UNPLANNED_SESSION } from "@/lib/labels";
import { originQuery } from "@/lib/nav";
import type { ActivityListItem } from "@/server/repositories/activity-analytics";
import type { readHistoryWorkouts, readLatestActivities } from "@/server/repositories/history";
import type { readRecovery, RunActivity } from "@/server/repositories/training-data";

import type { HistoryItem } from "./history-list";

/**
 * Each record as History lists it, made once for History's pages and for Overview's latest
 * (ADR 0045), so the two never word an entry differently.
 */

/** Activities Overview lists under its month: as many as a page of History holds. */
export const LATEST_COUNT = 10;

type HistoryWorkout = Awaited<ReturnType<typeof readHistoryWorkouts>>["workouts"][number];
type RecoveryReading = Awaited<ReturnType<typeof readRecovery>>[number];

/** Each entry under its own local day, at its local time, as the list is read. */
export type HistoryClock = { dayOf: (at: Date) => string; timeOf: (at: Date) => string };

export function historyClock(timeZone: string): HistoryClock {
  return {
    dayOf: (at) => todayInTimeZone(timeZone, at),
    timeOf: (at) => formatTime(at, timeZone),
  };
}

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
  if (effort.status === "reported") return `Effort ${effort.value} of 5`;
  if (effort.value === null) return "";
  return `Effort ${effort.value} of 5 (unconfirmed)`;
}

export function workoutItem(w: HistoryWorkout, clock: HistoryClock): HistoryItem {
  return {
    id: w.id,
    kind: "workout",
    date: w.startedAt.toISOString(),
    day: clock.dayOf(w.startedAt),
    title: w.dayName ?? UNPLANNED_SESSION,
    subtitle: `${clock.timeOf(w.startedAt)} · ${w.gymName}`,
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
  };
}

export function runItem(r: RunActivity, clock: HistoryClock): HistoryItem {
  return {
    id: r.id,
    kind: "run",
    date: r.startedAt.toISOString(),
    day: clock.dayOf(r.startedAt),
    title: `${r.environment === "treadmill" ? "Treadmill" : "Outdoor"} · ${formatRunKm(r.distanceMeters)} km`,
    subtitle: clock.timeOf(r.startedAt),
    href: `/training/activities/${r.id}${originQuery("history")}` as const,
    meta: `${formatDuration(r.durationSeconds)} · ${formatPace(r.averagePaceSecondsPerKm)}/km`,
    gymId: r.gymId,
    exercises: [],
    recovery: runEffort(r.effort),
  };
}

/** A ride or a swim. */
export function enduranceItem(activity: ActivityListItem, clock: HistoryClock): HistoryItem {
  const name = activity.sport === "cycling" ? "Ride" : "Swim";
  return {
    id: activity.id,
    kind: activity.sport as "cycling" | "swimming",
    date: activity.startedAt.toISOString(),
    day: activity.occurredOn,
    title:
      activity.distanceMetres === null
        ? name
        : `${name} · ${formatRunKm(activity.distanceMetres)} km`,
    subtitle: clock.timeOf(activity.startedAt),
    href: `/training/activities/${activity.id}${originQuery("history")}` as const,
    // An unrecorded duration says so rather than reading as zero minutes.
    meta:
      activity.durationMs === null ? "" : formatDuration(Math.round(activity.durationMs / 1000)),
    gymId: null,
    exercises: [],
    recovery: readings([
      ["Effort", activity.effortStatus === "reported" ? activity.effortValue : null],
    ]),
  };
}

export function recoveryItem(r: RecoveryReading): HistoryItem {
  return {
    id: r.id,
    kind: "recovery",
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
  };
}

/** Newest first, as every list of them is read. */
export const newestFirst = (a: HistoryItem, b: HistoryItem) => b.date.localeCompare(a.date);

/**
 * Overview's latest (ADR 0045): the newest activities of every sport, newest first, ten at most.
 * Each sport is read `LATEST_COUNT` deep, so however they mix, the newest ten are among them.
 */
export function latestItems(
  read: Awaited<ReturnType<typeof readLatestActivities>>,
  clock: HistoryClock,
): HistoryItem[] {
  return (
    [
      ...read.workouts.map((w) => workoutItem(w, clock)),
      ...read.runs.map((r) => runItem(r, clock)),
      ...read.endurance.map((activity) => enduranceItem(activity, clock)),
    ]
      .sort(newestFirst)
      .slice(0, LATEST_COUNT)
      // Only History's filters choose by exercise; Overview has none to send them for.
      .map((item) => ({ ...item, exercises: [] }))
  );
}
