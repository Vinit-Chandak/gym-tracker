import { aboutLabel } from "@/components/ui/about-label";
import { InfoTip } from "@/components/ui/info-tip";
import { describeEffort } from "@/domain/activity";
import {
  actualDistanceMetres,
  formatPaceSeconds,
  formatSpeed,
  lapFigures,
  paceHasRests,
  pacePerUnit,
  paceSecondsPerKm,
  repPace,
  speedMetresPerSecond,
  swimPaceSecondsPer100,
} from "@/domain/activity-metrics";
import type { ResolvedHeartRate } from "@/domain/heart-rate";
import { formatDuration } from "@/domain/pace";
import { sportDistanceParts, type SportUnits } from "@/lib/distance-units";
import type { ActivityRecord } from "@/server/repositories/activities";

import { recordedExtras, type ActivityStat } from "./recorded-extras";

/** "3 km" as its figure and its unit. */
function split(text: string): { figure: string; unit?: string } {
  const at = text.indexOf(" ");
  return at < 0 ? { figure: text } : { figure: text.slice(0, at), unit: text.slice(at + 1) };
}

/**
 * What an activity recorded, in the athlete's own units: a distance and its pace or speed in km
 * or mi, a swim and its pace in m or yd, whatever unit each number was typed in, then its effort
 * and what else was given. Its own page reads it, and so does the planned session it answered,
 * under its plan (owner, 28 October 2026).
 *
 * Each sport shows what it actually recorded and nothing more: a ride with no distance shows no
 * speed, a swim timed only end to end shows no pace, and an effort nobody confirmed says so
 * rather than passing for a report (plan §§4, 9.1).
 */
export function recordStats(
  activity: ActivityRecord,
  units: SportUnits,
  heartRate: ResolvedHeartRate | null,
): ActivityStat[] {
  const actual = activity.actual;
  const metres = actual ? actualDistanceMetres(actual) : null;
  const stats: ActivityStat[] = [
    {
      label: "Distance",
      ...(metres === null || !actual
        ? { figure: "—" }
        : sportDistanceParts(metres, actual.sport, units)),
    },
    {
      label: "Time",
      figure: activity.durationMs === null ? "—" : formatDuration(activity.durationMs / 1000),
    },
  ];
  if (actual?.sport === "running") {
    const overall = formatPaceSeconds(
      pacePerUnit(paceSecondsPerKm(actual.distance.metres, actual.durationMs), units.distanceUnit),
    );
    if (paceHasRests(actual)) {
      // An interval session leads with its reps' pace, the pace that counts; its own distance
      // over its time has the rests in it and says so (DESIGN.md, Laps and intervals).
      const reps = repPace(actual.laps.map(lapFigures));
      if (reps)
        stats.unshift({
          label: "Rep pace",
          figure: formatPaceSeconds(pacePerUnit(reps.secondsPerKm, units.distanceUnit)),
          unit: `/${units.distanceUnit}`,
          note: `${reps.reps} ${reps.reps === 1 ? "rep" : "reps"}`,
        });
      stats.push({ label: "Overall, with rests", figure: overall, unit: `/${units.distanceUnit}` });
    } else stats.push({ label: "Pace", figure: overall, unit: `/${units.distanceUnit}` });
  }
  // A ride's speed is its distance over its time: one with no distance (an indoor ride, as a
  // rule) has none to show, not a second dash beside the distance's (AT-LOG-03).
  if (actual?.sport === "cycling" && metres !== null)
    stats.push({
      label: "Speed",
      ...split(formatSpeed(speedMetresPerSecond(metres, actual.durationMs), units.distanceUnit)),
    });
  if (actual?.sport === "swimming") {
    const pace = swimPaceSecondsPer100(actual, units.poolUnit);
    stats.push({
      label: "Pace",
      figure: pace === null ? "—" : formatPaceSeconds(pace, 1),
      unit: `/100 ${units.poolUnit}`,
      // Timed end to end only: its dash says there is no pace, and the ⓘ beside it says why.
      info:
        actual.activeMs === null
          ? "Only its elapsed time was recorded: a pace needs the swimming time, rests left out."
          : undefined,
    });
  }
  stats.push({ label: "Effort", figure: describeEffort(activity.effort) });
  if (actual) stats.push(...recordedExtras(actual, units, heartRate));
  return stats;
}

/** The figures two by two, in one card (board Run). */
export function RecordStats({ stats }: { stats: readonly ActivityStat[] }) {
  return (
    <dl className="activity-stats">
      {stats.map((stat) => (
        <div key={stat.label} className="activity-stat">
          <dt className="activity-stat-label">{stat.label}</dt>
          <dd className="activity-stat-figure">
            <span className={/\d/.test(stat.figure) ? "type-figure-l" : "type-heading"}>
              {stat.figure}
            </span>
            {stat.unit && <span className="activity-stat-unit">{stat.unit}</span>}
            {/* Beside the figure it explains (a dash), never inside the stat's name. */}
            {stat.info && <InfoTip label={aboutLabel(stat.label)}>{stat.info}</InfoTip>}
            {stat.note && <span className="activity-stat-note">{stat.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
