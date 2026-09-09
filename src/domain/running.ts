import { addDays, isoWeekday, TRAINING_WEEK_START } from "./program-calendar";

/**
 * Running rules (Phase 6): weekly volume, the week-over-week spike warning and the shin
 * escalation flag from the training context. Advice only, like the rest of the engine.
 */

/** This week's minutes above this multiple of last week's counts as a spike. */
export const RUN_VOLUME_SPIKE_RATIO = 1.3;
/** Runs in a row with a rising shin score before the escalation flag shows. */
export const SHIN_ESCALATION_RUNS = 3;

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

export type ShinReadings = {
  shinLeftPre: number | null;
  shinLeftDuring: number | null;
  shinLeftPost: number | null;
  shinRightPre: number | null;
  shinRightDuring: number | null;
  shinRightPost: number | null;
};

export type ShinSide = "left" | "right";

export type ShinEscalation = {
  side: ShinSide;
  /** `rising`: worse than before the run on each recent run; `worsening`: higher after each run. */
  pattern: "rising" | "worsening";
  runs: number;
};

function peak(reading: ShinReadings, side: ShinSide): number | null {
  const during = side === "left" ? reading.shinLeftDuring : reading.shinRightDuring;
  const post = side === "left" ? reading.shinLeftPost : reading.shinRightPost;
  if (during === null && post === null) return null;
  return Math.max(during ?? -1, post ?? -1);
}

function pre(reading: ShinReadings, side: ShinSide): number | null {
  return side === "left" ? reading.shinLeftPre : reading.shinRightPre;
}

/**
 * The training-context escalation rule on the numbers we have: a side whose score rose during
 * or after each of the last N runs, or whose after-run score went up run after run.
 */
export function shinEscalations(readings: readonly ShinReadings[]): ShinEscalation[] {
  const recent = readings.slice(0, SHIN_ESCALATION_RUNS);
  if (recent.length < SHIN_ESCALATION_RUNS) return [];
  const out: ShinEscalation[] = [];
  for (const side of ["left", "right"] as const) {
    const rising = recent.every((reading) => {
      const before = pre(reading, side);
      const after = peak(reading, side);
      return before !== null && after !== null && after > before;
    });
    if (rising) {
      out.push({ side, pattern: "rising", runs: recent.length });
      continue;
    }
    const peaks = recent.map((reading) => peak(reading, side));
    const worsening = peaks.every(
      (value, index) =>
        value !== null && (index === recent.length - 1 || value > (peaks[index + 1] ?? Infinity)),
    );
    if (worsening) out.push({ side, pattern: "worsening", runs: recent.length });
  }
  return out;
}
