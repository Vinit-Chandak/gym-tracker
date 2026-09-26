/**
 * Recovery-aware warnings (Phase 5). Advice only: nothing here changes a suggestion or the
 * programme. Thresholds live in one place so they are easy to tune.
 */

/** Sleep below this many hours warns. */
export const SHORT_SLEEP_HOURS = 6;

export type CheckIn = {
  sleepHours: number | null;
  sleepQuality: number | null;
  /** No longer asked: fatigue asked the other way up. Older check-ins keep it, and it counts. */
  energy: number | null;
  fatigue: number | null;
  soreness: number | null;
};

/** One actual response, kept distinct when someone checks in more than once in a day. */
export type RecoveryReading = CheckIn & {
  id: string;
  date: string;
  recordedAt: string;
  source: "workout" | "daily";
  sessionId: string | null;
};

export type RecoveryWarningCode = "short_sleep" | "low_readiness";

export type RecoveryWarning = {
  code: RecoveryWarningCode;
  title: string;
  advice: string;
};

export function hasCheckIn(checkIn: CheckIn): boolean {
  return Object.values(checkIn).some((value) => value !== null);
}

/** Warnings for today's check-in. */
export function recoveryWarnings(current: CheckIn): RecoveryWarning[] {
  const warnings: RecoveryWarning[] = [];

  if (current.sleepHours !== null && current.sleepHours < SHORT_SLEEP_HOURS) {
    warnings.push({
      code: "short_sleep",
      title: `Sleep ${current.sleepHours} h`,
      advice: "Hold loads today rather than adding, and keep the RIR honest.",
    });
  }

  const flat: string[] = [];
  if (current.sleepQuality !== null && current.sleepQuality <= 1) flat.push("sleep quality");
  if (current.energy !== null && current.energy <= 1) flat.push("energy");
  if (current.fatigue !== null && current.fatigue >= 5) flat.push("fatigue");
  if (current.soreness !== null && current.soreness >= 5) flat.push("soreness");
  if (flat.length > 0) {
    warnings.push({
      code: "low_readiness",
      title: `Worst score on ${flat.join(", ")}`,
      advice: "Treat this as a maintenance day: repeat last loads and stop at the planned RIR.",
    });
  }

  return warnings;
}
