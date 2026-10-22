import type { StepPhase } from "./activity-prescription";
import type { RunningLap } from "./activity-metrics";
import type { RunType } from "./run-types";

/**
 * Which parts of a run were one unbroken effort, read from what was recorded and nothing else
 * (ADR 0062).
 *
 * Strava counts a best effort from any stretch of a run, timed as a race is, with the clock
 * running; Garmin and Runna read race fitness from steady running and races, never from reps.
 * A run logged here is its totals and, where the watch gave them, its laps, so a stretch is the
 * whole run, one lap, or laps known to have been run back to back. Three rules keep every figure
 * an actual one:
 *
 * - A lap's time is its own. Nothing is spread over the laps from the run's total, so time the
 *   laps do not account for (a stop that was not recorded, a recovery left out) never slows a lap.
 * - Laps are joined only when the record proves nothing came between them: every lap timed, the
 *   laps adding up to the run's time, and no recovery lap among them. Otherwise each stands alone,
 *   and an unrecorded gap can never make a stretch look faster than it was run.
 * - A session run in pieces (intervals, hills, sprints, run-walk), or any run with a recovery
 *   lap, is never one effort as a whole: its total may hold rests, or leave them out. Each rep
 *   counts at its own distance, on its own.
 */

/** Kinds run in pieces, with a jog, a walk or a stand between them. */
export const RUN_TYPES_WITH_BREAKS = [
  "intervals",
  "hills",
  "sprints",
  "run_walk",
] as const satisfies readonly RunType[];

/** A watch rounds each lap to the second; a run's laps may differ from its total by that much. */
const LAP_ROUNDING_MS = 1000;

export type RecordedLap = {
  phase: StepPhase | null;
  /** Null when the lap's distance was not recorded. */
  distanceMetres: number | null;
  /** Null when the lap's time was not recorded. */
  durationMs: number | null;
};

export type RecordedRun = {
  distanceMetres: number;
  durationMs: number;
  runType: RunType | null;
  /** In the order they were run; empty when the run was recorded as a whole. */
  laps: readonly RecordedLap[];
};

/** A stored lap as this module reads it: metres and milliseconds, or unknown. */
export function recordedLap(lap: RunningLap): RecordedLap {
  return {
    phase: lap.phase,
    distanceMetres: lap.distance?.metres ?? null,
    durationMs: lap.durationMs,
  };
}

/** One unbroken effort inside a run, with where it was. */
export type Stretch = {
  metres: number;
  ms: number;
  /** "whole run", "lap 3", "laps 2–6" or "rep 2 of 6". */
  part: string;
  /** A rep of a session run in pieces: rested before and after it. */
  rep: boolean;
};

/** Whether the run had breaks in it: by its kind, or by a lap marked as recovery. */
export function hasBreaks(run: {
  runType: RunType | null;
  laps: readonly { phase: StepPhase | null }[];
}): boolean {
  return (
    (run.runType !== null && (RUN_TYPES_WITH_BREAKS as readonly RunType[]).includes(run.runType)) ||
    run.laps.some((lap) => lap.phase === "recovery")
  );
}

/**
 * The run's time that no lap accounts for: null without laps or when a lap's time is unknown,
 * zero within a watch's rounding. Positive is time recorded in the total but in no lap.
 */
export function unlappedMs(run: RecordedRun): number | null {
  if (run.laps.length === 0 || run.laps.some((lap) => lap.durationMs === null)) return null;
  const lapped = run.laps.reduce((sum, lap) => sum + lap.durationMs!, 0);
  const gap = run.durationMs - lapped;
  return Math.abs(gap) <= LAP_ROUNDING_MS * (run.laps.length + 1) ? 0 : gap;
}

const measured = (lap: RecordedLap) =>
  lap.distanceMetres !== null &&
  lap.distanceMetres > 0 &&
  lap.durationMs !== null &&
  lap.durationMs > 0;

/**
 * The laps of a session run in pieces that were its reps: the ones marked work where any are,
 * else every lap not marked as something else, in the order they were run.
 */
function repLaps(run: RecordedRun): { lap: RecordedLap }[] {
  const marked = run.laps.some((lap) => lap.phase === "work");
  return run.laps.flatMap((lap) =>
    (marked ? lap.phase === "work" : lap.phase === null) ? [{ lap }] : [],
  );
}

/**
 * Every stretch of the run that was one unbroken effort, each one the record proves. For a
 * continuous run with back-to-back laps that is every block of consecutive laps, so it is
 * quadratic in laps; a run has at most a hundred.
 */
export function continuousStretches(run: RecordedRun): Stretch[] {
  if (hasBreaks(run)) {
    const reps = repLaps(run);
    return reps.flatMap(({ lap }, n) =>
      measured(lap)
        ? [
            {
              metres: lap.distanceMetres!,
              ms: lap.durationMs!,
              part: `rep ${n + 1} of ${reps.length}`,
              rep: true,
            },
          ]
        : [],
    );
  }
  const stretches: Stretch[] = [];
  if (run.distanceMetres > 0 && run.durationMs > 0)
    stretches.push({
      metres: run.distanceMetres,
      ms: run.durationMs,
      part: "whole run",
      rep: false,
    });
  const laps = run.laps;
  if (unlappedMs(run) === 0) {
    for (let from = 0; from < laps.length; from++) {
      let metres = 0;
      let ms = 0;
      for (let to = from; to < laps.length; to++) {
        // A lap without a distance cannot be measured, so no block runs through it.
        if (!measured(laps[to]!)) break;
        metres += laps[to]!.distanceMetres!;
        ms += laps[to]!.durationMs!;
        // Every lap, back to back, is the whole run again only when it says the same: laps of
        // 5,000 m in 20:00 under a total of 20:01 are their own recorded effort, and kept.
        if (
          from === 0 &&
          to === laps.length - 1 &&
          Math.abs(metres - run.distanceMetres) < 0.5 &&
          Math.abs(ms - run.durationMs) < 500
        )
          continue;
        stretches.push({
          metres,
          ms,
          part: from === to ? `lap ${from + 1}` : `laps ${from + 1}–${to + 1}`,
          rep: false,
        });
      }
    }
  } else
    laps.forEach((lap, index) => {
      if (measured(lap))
        stretches.push({
          metres: lap.distanceMetres!,
          ms: lap.durationMs!,
          part: `lap ${index + 1}`,
          rep: false,
        });
    });
  return stretches;
}

/**
 * What a session run in pieces came to, as the log says it: how many reps, their average time
 * and, where every rep was measured, their average pace. Null for a run without breaks, or one
 * with fewer than two timed reps.
 */
export function repSummary(
  run: RecordedRun,
): { reps: number; averageSeconds: number; averagePaceSecondsPerKm: number | null } | null {
  if (!hasBreaks(run)) return null;
  const reps = repLaps(run).map(({ lap }) => lap);
  const timed = reps.filter((lap) => lap.durationMs !== null && lap.durationMs > 0);
  if (timed.length < 2) return null;
  const ms = timed.reduce((sum, lap) => sum + lap.durationMs!, 0);
  const metres = timed.every((lap) => lap.distanceMetres !== null && lap.distanceMetres > 0)
    ? timed.reduce((sum, lap) => sum + lap.distanceMetres!, 0)
    : null;
  return {
    reps: reps.length,
    averageSeconds: Math.round(ms / timed.length / 1000),
    averagePaceSecondsPerKm: metres === null ? null : Math.round(ms / metres),
  };
}

/** A run as the coach's run lists hold it: its totals, and its laps as recorded. */
type ListedRun = {
  distanceMeters: number;
  durationSeconds: number;
  runType: RunType | null;
  laps: readonly RunningLap[];
};

/**
 * What a coach reads of a run beside its totals (ADR 0062): its kind, whether it had breaks in
 * it, what its reps came to and, where asked, every lap as recorded with the time no lap holds.
 * The whole run's pace is only a pace when it had no breaks; `wholeRunPace` says which.
 */
export function runReading(run: ListedRun, detail: "laps" | "summary") {
  const recorded: RecordedRun = {
    distanceMetres: run.distanceMeters,
    durationMs: run.durationSeconds * 1000,
    runType: run.runType,
    laps: run.laps.map(recordedLap),
  };
  const breaks = hasBreaks(recorded);
  const unlapped = unlappedMs(recorded);
  return {
    runType: run.runType,
    hadBreaks: breaks,
    wholeRunPace: !breaks,
    reps: repSummary(recorded),
    ...(detail === "laps"
      ? {
          laps: run.laps.map((lap, index) => ({
            lap: index + 1,
            phase: lap.phase,
            distanceMeters: lap.distance === null ? null : Math.round(lap.distance.metres),
            durationSeconds: lap.durationMs === null ? null : Math.round(lap.durationMs / 1000),
            paceSecondsPerKm:
              lap.distance !== null && lap.distance.metres > 0 && lap.durationMs
                ? Math.round(lap.durationMs / lap.distance.metres)
                : null,
            averageHeartRate: lap.averageHeartRate,
            maxHeartRate: lap.maxHeartRate,
          })),
          unlappedSeconds: unlapped === null ? null : Math.round(unlapped / 1000),
        }
      : {}),
  };
}
