/**
 * Recovery-aware warnings (Phase 5). Advice only: nothing here changes a suggestion or the
 * programme. Thresholds live in one place so they are easy to tune.
 */

/** Sleep below this many hours warns. */
export const SHORT_SLEEP_HOURS = 6;
/** A symptom score this many points above the previous check-in warns. */
export const SYMPTOM_RISE_POINTS = 2;
/** A symptom score at or above this level warns on its own. */
export const SYMPTOM_HIGH_SCORE = 5;

export type CheckIn = {
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  fatigue: number | null;
  soreness: number | null;
  backPainPre: number | null;
  shinLeftPre: number | null;
  shinRightPre: number | null;
};

export type RecoveryWarningCode = "short_sleep" | "low_readiness" | "back_pain" | "shin_pain";

export type RecoveryWarning = {
  code: RecoveryWarningCode;
  title: string;
  advice: string;
};

export function hasCheckIn(checkIn: CheckIn): boolean {
  return Object.values(checkIn).some((value) => value !== null);
}

function symptomLabel(now: number | null, before: number | null): string | null {
  if (now === null) return null;
  if (before !== null && now - before >= SYMPTOM_RISE_POINTS) return `${now}/10, up from ${before}`;
  if (now >= SYMPTOM_HIGH_SCORE) return `${now}/10`;
  return null;
}

/** Warnings for today's check-in, compared with the previous one when there is any. */
export function recoveryWarnings(current: CheckIn, previous: CheckIn | null): RecoveryWarning[] {
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

  const back = symptomLabel(current.backPainPre, previous?.backPainPre ?? null);
  if (back) {
    warnings.push({
      code: "back_pain",
      title: `Lower back ${back}`,
      advice:
        "Go lighter on hinges and squats (deadlift, RDL, leg press, split squat) and stop if it worsens.",
    });
  }

  const shins = [
    ["Left shin", symptomLabel(current.shinLeftPre, previous?.shinLeftPre ?? null)],
    ["Right shin", symptomLabel(current.shinRightPre, previous?.shinRightPre ?? null)],
  ].filter((entry): entry is [string, string] => entry[1] !== null);
  if (shins.length > 0) {
    warnings.push({
      code: "shin_pain",
      title: shins.map(([side, text]) => `${side} ${text}`).join(" · "),
      advice: "Shorten or skip today's run; walk or bike instead. Lifting is fine.",
    });
  }

  return warnings;
}
