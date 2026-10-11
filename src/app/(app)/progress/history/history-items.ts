import { enduranceName } from "@/components/activities/endurance-line";
import type { Effort } from "@/domain/activity";
import { formatDuration, formatPace } from "@/domain/pace";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  DEFAULT_SPORT_UNITS,
  formatSportDistance,
  METRES_PER_MILE,
  type SportUnits,
} from "@/lib/distance-units";
import { joinFacts } from "@/lib/facts";
import { formatTime } from "@/lib/format";
import { ENDURANCE_PLACE_LABELS, UNPLANNED_SESSION } from "@/lib/labels";
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

/**
 * Each entry at its local time, as the list is read. Its day is the one it was recorded on, as
 * the calendar marks it; `dayOf` dates only a workout older than its parent activity.
 */
/** How an account reads its history: its days and times, and each sport's distances. */
export type HistoryClock = {
  dayOf: (at: Date) => string;
  timeOf: (at: Date) => string;
  units?: Partial<Record<string, SportUnits>>;
};

export function historyClock(
  timeZone: string,
  units: Partial<Record<string, SportUnits>> = {},
): HistoryClock {
  return {
    dayOf: (at) => todayInTimeZone(timeZone, at),
    timeOf: (at) => formatTime(at, timeZone),
    units,
  };
}

/** A distance in the unit the athlete reads the sport in, as the activity's own page says it. */
function distanceIn(metres: number, sport: string, clock: HistoryClock): string {
  return formatSportDistance(metres, sport, clock.units?.[sport] ?? DEFAULT_SPORT_UNITS);
}

/** "5:25/km" or "8:43/mi": a pace stored per kilometre, in the athlete's road unit. */
function paceIn(secondsPerKm: number | null, clock: HistoryClock): string {
  const unit = clock.units?.running?.distanceUnit ?? "km";
  const seconds =
    secondsPerKm === null
      ? null
      : unit === "mi"
        ? (secondsPerKm * METRES_PER_MILE) / 1000
        : secondsPerKm;
  return `${formatPace(seconds)}/${unit}`;
}

/** "Sleep 7.25 h · Fatigue 2": each reading kept whole on its line, its name, figure and unit. */
function readings(values: [string, number | null, string?][]) {
  return joinFacts(
    values
      .filter(([, value]) => value !== null)
      .map(([label, value, unit]) => `${label}\u00a0${value}${unit ? `\u00a0${unit}` : ""}`),
  );
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
    day: w.occurredOn ?? clock.dayOf(w.startedAt),
    title: w.dayName ?? UNPLANNED_SESSION,
    subtitle: joinFacts([clock.timeOf(w.startedAt), w.gymName]),
    // Opened from here, the entry keeps Progress selected rather than the tab it lives under,
    // and goes back to History.
    href: `/workouts/${w.id}${originQuery("history")}` as const,
    meta: `${w.setCount}\u00a0${w.setCount === 1 ? "set" : "sets"}`,
    gymId: w.gymId,
    exercises: w.exercises.map((e) => ({
      id: e.exerciseId,
      name: e.name,
      machineId: e.machineId,
      machineName: e.machineName ? joinFacts([e.machineName, w.gymName]) : null,
    })),
    recovery: readings([["Sleep", w.sleepHours, "h"]]),
  };
}

export function runItem(r: RunActivity, clock: HistoryClock): HistoryItem {
  return {
    id: r.id,
    kind: "run",
    date: r.startedAt.toISOString(),
    day: r.occurredOn,
    title: joinFacts([
      r.title ?? enduranceName("running"),
      distanceIn(r.distanceMeters, "running", clock),
    ]),
    subtitle: joinFacts([clock.timeOf(r.startedAt), ENDURANCE_PLACE_LABELS[r.environment]]),
    href: `/training/activities/${r.id}${originQuery("history")}` as const,
    meta: joinFacts([formatDuration(r.durationSeconds), paceIn(r.averagePaceSecondsPerKm, clock)]),
    gymId: r.gymId,
    exercises: [],
    recovery: runEffort(r.effort),
  };
}

/**
 * A ride or a swim, named as its own page and the day name it: its title, else "Ride" or "Swim",
 * with where it happened beside the time ("09:48 · Indoor"). One ride read "Ride" here, "Indoor
 * ride" on its day and "Cycling" on its page.
 */
export function enduranceItem(activity: ActivityListItem, clock: HistoryClock): HistoryItem {
  const name = activity.title ?? enduranceName(activity.sport);
  return {
    id: activity.id,
    kind: activity.sport as "cycling" | "swimming",
    date: activity.startedAt.toISOString(),
    day: activity.occurredOn,
    title: joinFacts([
      name,
      activity.distanceMetres === null
        ? null
        : distanceIn(activity.distanceMetres, activity.sport, clock),
    ]),
    subtitle: joinFacts([
      clock.timeOf(activity.startedAt),
      activity.environment ? ENDURANCE_PLACE_LABELS[activity.environment] : null,
    ]),
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

/**
 * Newest first, as every list of them is read: by day, then by when in it. The day leads because
 * `date` is an instant in UTC for what was trained and a bare date for a recovery reading, and
 * west of UTC an evening's instant already reads as the next day's date; a day's entries must
 * also stay together, one section each, wherever their instants fall.
 */
export const newestFirst = (a: HistoryItem, b: HistoryItem) =>
  b.day.localeCompare(a.day) || b.date.localeCompare(a.date);

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
