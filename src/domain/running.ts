import { addDays, isoWeekday, TRAINING_WEEK_START } from "./program-calendar";

/**
 * Running rules (Phase 6): weekly volume and the week-over-week spike warning. Advice only,
 * like the rest of the engine.
 */

/** This week's minutes above this multiple of last week's counts as a spike. */
export const RUN_VOLUME_SPIKE_RATIO = 1.3;

export type RunVolumeInput = {
  /** Civil date of the run in the user's time zone, "YYYY-MM-DD". */
  startedOn: string;
  durationSeconds: number;
  distanceMeters: number;
};

export type WeekVolume = {
  /** Monday of the training week, "YYYY-MM-DD". */
  weekStart: string;
  runs: number;
  minutes: number;
  km: number;
};

/** Monday of the training week containing the date. */
export function weekStart(isoDate: string): string {
  return addDays(isoDate, -((isoWeekday(isoDate) - TRAINING_WEEK_START + 7) % 7));
}

/** Volumes for the last `weeks` calendar weeks ending with the week of `today`, newest first. */
export function weeklyVolumes(
  runs: readonly RunVolumeInput[],
  today: string,
  weeks = 2,
): WeekVolume[] {
  const current = weekStart(today);
  const out: WeekVolume[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = addDays(current, -7 * i);
    const inWeek = runs.filter((run) => weekStart(run.startedOn) === start);
    out.push({
      weekStart: start,
      runs: inWeek.length,
      minutes: Math.round(inWeek.reduce((sum, run) => sum + run.durationSeconds, 0) / 60),
      km: Math.round(inWeek.reduce((sum, run) => sum + run.distanceMeters, 0) / 100) / 10,
    });
  }
  return out;
}

export type VolumeSpike = { thisWeekMinutes: number; lastWeekMinutes: number; ratio: number };

/** Warns once the current week already exceeds last week's minutes by the spike ratio. */
export function volumeSpike(thisWeek: WeekVolume, lastWeek: WeekVolume): VolumeSpike | null {
  if (lastWeek.runs === 0 || lastWeek.minutes === 0) return null;
  const ratio = thisWeek.minutes / lastWeek.minutes;
  if (ratio <= RUN_VOLUME_SPIKE_RATIO) return null;
  return {
    thisWeekMinutes: thisWeek.minutes,
    lastWeekMinutes: lastWeek.minutes,
    ratio: Math.round(ratio * 100) / 100,
  };
}
