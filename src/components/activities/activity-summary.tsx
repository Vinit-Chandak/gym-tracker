import { formatDuration } from "@/domain/pace";
import { metricLabel, type SharedMetric } from "@/domain/shared-stats";
import {
  formatSharedDistance,
  formatSharedLoad,
  formatSharedMetric,
  formatSharedPace,
  formatVolume,
  type SharedDistanceUnits,
} from "@/lib/format";
import type { BodyLoadUnit } from "@/domain/types";
import type {
  SharedActivityDetail,
  SharedSessionExercise,
} from "@/server/repositories/shared-stats";

/**
 * What a follower sees of one session (plan §9.2), laid out as its owner's own record is: a
 * workout's time, sets and volume three across, as the finished workout says them, then its
 * movements; a run's, a ride's or a swim's figures two by two, as the activity's page does.
 *
 * The shape of this component is the privacy rule made visible: it takes shared rows and
 * nothing else. There is no activity here to accidentally read a note, an effort, a heart
 * rate, a pool or a named bike from — those never left the owner's account, and a component
 * that cannot reach them cannot leak them (AT-PRIV-02). A movement the owner created is not
 * shared at all, and the workout says so rather than leave its sets unaccounted for.
 *
 * Cycling and swimming deliberately show less than running. A ride's pace depends on whether
 * the bike was assisted and whether the ride was indoors; a swim's depends on a time basis
 * nobody else can see. Publishing either as a bare number would invite a comparison the data
 * does not support, so it is not published at all this release.
 *
 * Loads read in the reader's load unit and distances in the one they use for the sport, as
 * every friend's number does.
 */
export function ActivitySummary({
  activity,
  exercises = [],
  name,
  unit,
  distanceUnits,
}: {
  activity: SharedActivityDetail;
  /** A workout's shared-library movements. */
  exercises?: readonly SharedSessionExercise[];
  /** Whose session it is, as the page names them. */
  name: string;
  unit: BodyLoadUnit;
  distanceUnits: SharedDistanceUnits;
}) {
  if (activity.sport !== "workout")
    return (
      <dl className="activity-stats">
        {endurance(activity, distanceUnits).map((stat) => (
          <div key={stat.label} className="activity-stat">
            <dt className="activity-stat-label">{stat.label}</dt>
            <dd className="activity-stat-figure">
              <span className="type-figure-l">{stat.figure}</span>
              {stat.unit && <span className="activity-stat-unit">{stat.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
    );

  // The sets of movements the owner created have no shared row; the session counts them all.
  const listed = exercises.reduce((sum, exercise) => sum + exercise.workingSets, 0);
  const unlisted = Math.max(activity.workingSets - listed, 0);
  return (
    <>
      <dl className="finished-stats">
        {workout(activity, unit).map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="sr-only">{stat.label}</dt>
            <dd className="whitespace-nowrap">
              <span className="type-figure-l">{stat.figure}</span>
              {stat.unit && <span className="figure-row-unit"> {stat.unit}</span>}
            </dd>
            <dd aria-hidden className="type-caption font-medium text-ink-2">
              {stat.label}
            </dd>
          </div>
        ))}
      </dl>
      {(exercises.length > 0 || unlisted > 0) && (
        <section aria-labelledby="shared-exercises">
          <h2 id="shared-exercises" className="caption-head mt-4.5">
            Exercises
          </h2>
          {exercises.length > 0 && (
            <ul>
              {exercises.map((exercise) => (
                <li key={exercise.id} className="record-row">
                  <span className="record-row-name">{exercise.name}</span>{" "}
                  <span className="record-row-sets">{exerciseLine(exercise, unit)}</span>
                </li>
              ))}
            </ul>
          )}
          {unlisted > 0 && (
            <p className="mt-2 type-meta text-ink-2">
              {unlisted}
              {exercises.length > 0 ? " more" : ""} {unlisted === 1 ? "set" : "sets"} in exercises{" "}
              {name} created, which are not shared.
            </p>
          )}
        </section>
      )}
    </>
  );
}

type Stat = { label: string; figure: string; unit?: string };

/** "5.2 km" as its figure and its unit. */
function split(text: string): { figure: string; unit?: string } {
  const at = text.search(/\s/);
  return at < 0 ? { figure: text } : { figure: text.slice(0, at), unit: text.slice(at + 1) };
}

const sets = (count: number) => `${count} ${count === 1 ? "set" : "sets"}`;

/** Time, sets and volume, worded as the finished workout words them: "69 min", "18", "5,730 kg". */
function workout(activity: SharedActivityDetail, unit: BodyLoadUnit): Stat[] {
  const stats: Stat[] = [];
  if (activity.durationSeconds > 0)
    stats.push({
      label: "Time",
      figure: String(Math.round(activity.durationSeconds / 60)),
      unit: "min",
    });
  stats.push({ label: "Sets", figure: String(activity.workingSets) });
  if (activity.volumeKg > 0)
    stats.push({ label: "Volume", ...split(formatVolume(activity.volumeKg, unit)) });
  return stats;
}

/** A run's distance, time and pace; a ride's or a swim's distance, where known, and time. */
function endurance(activity: SharedActivityDetail, distanceUnits: SharedDistanceUnits): Stat[] {
  const stats: Stat[] = [];
  const sport = activity.sport === "workout" ? null : activity.sport;
  if (sport === null) return stats;
  if (activity.distanceMeters !== null)
    stats.push({
      label: "Distance",
      ...split(formatSharedDistance(activity.distanceMeters, distanceUnits[sport])),
    });
  if (activity.durationSeconds > 0)
    stats.push({ label: "Time", figure: formatDuration(activity.durationSeconds) });
  if (sport === "run" && activity.paceSecondsPerKm !== null)
    stats.push({
      label: "Pace",
      ...split(formatSharedPace(activity.paceSecondsPerKm, distanceUnits.run)),
    });
  return stats;
}

/**
 * One movement in a line: its sets, then the best it shared, named as Compare names it — the
 * heaviest set in the app's notation ("Top weight 110 kg × 3"), else the most reps, the longest
 * hold or the longest carry. The figure keeps its unit and its reps on its line. A machine's load
 * is its own, as on the leaderboard, so a machine movement says its sets alone.
 */
function exerciseLine(exercise: SharedSessionExercise, unit: BodyLoadUnit): string {
  const count = sets(exercise.workingSets);
  if (!exercise.comparable) return count;
  const best = ((): [SharedMetric, string] | null => {
    switch (exercise.defaultPrescriptionType) {
      case "duration":
        return exercise.longestDurationSeconds === null
          ? null
          : ["longest_hold", formatDuration(exercise.longestDurationSeconds)];
      case "distance":
        return exercise.longestDistanceMeters === null
          ? null
          : [
              "longest_carry",
              formatSharedMetric("longest_carry", exercise.longestDistanceMeters, unit),
            ];
      case "reps":
        if (exercise.topWeightKg !== null && exercise.topWeightKg > 0)
          return [
            "top_weight",
            `${formatSharedLoad(exercise.topWeightKg, unit)}${
              exercise.topWeightReps === null ? "" : ` × ${exercise.topWeightReps}`
            }`,
          ];
        return exercise.mostReps === null ? null : ["most_reps", String(exercise.mostReps)];
    }
  })();
  if (best === null) return count;
  const [metric, figure] = best;
  return `${count} · ${metricLabel(metric, exercise)} ${figure.replaceAll(" ", "\u00a0")}`;
}
