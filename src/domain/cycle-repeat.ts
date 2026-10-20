import type { CycleRepeat } from "./types";

/**
 * How a programme's cycle repeats, and so how many cycles its weeks hold (owner, 11 October 2026;
 * ADR 0051).
 *
 * - `weekly`: one cycle a week. Each day falls on its weekday and the days between are rest, so
 *   Mon / Wed / Fri trains three times a week and a block of eight weeks is eight cycles.
 * - `rolling`: the days back to back, rest days included, as many cycles as fill the weeks. A
 *   four-day cycle over eight weeks is fourteen cycles, not the eight a week-count gave it —
 *   which ended the block after thirty-two days.
 *
 * A programme written before the choice existed has none, and keeps counting as it always did:
 * one cycle per week, its days back to back. Seven-day cycles, every built-in template among
 * them, read the same whichever way they are counted.
 */

/** What the rules here need to know about a day. */
export type CycleDay = {
  dayIndex: number;
  dayOfWeek: number | null;
  includesLifting: boolean;
  includesRun: boolean;
};

/** What a blueprint says about its cycle. */
export type CyclePlan = {
  weeks: number;
  days: readonly CycleDay[];
  /** Absent for a programme that predates the choice, or one that has not made it yet. */
  repeats?: CycleRepeat | null;
};

const byIndex = (a: CycleDay, b: CycleDay) => a.dayIndex - b.dayIndex;

/**
 * Where each day falls in its week, in days after the cycle's first day, when the days sit on
 * distinct weekdays in the order the cycle runs; null when they do not, because then no week
 * holds the cycle. Mon / Wed / Fri is 0, 2, 4; Fri / Mon / Wed is 0, 3, 5.
 */
export function weekdayOffsets(days: readonly CycleDay[]): Map<number, number> | null {
  const ordered = [...days].sort(byIndex);
  const first = ordered[0]?.dayOfWeek;
  if (!first || ordered.length > 7) return null;
  const offsets = new Map<number, number>();
  let previous = -1;
  for (const day of ordered) {
    if (!day.dayOfWeek) return null;
    const offset = (day.dayOfWeek - first + 7) % 7;
    if (offset <= previous) return null;
    offsets.set(day.dayIndex, offset);
    previous = offset;
  }
  return offsets;
}

const isRest = (day: CycleDay) => !day.includesLifting && !day.includesRun;

/**
 * The choice a programme that has not made one is offered: weekly when the days already read
 * as a week — seven of them, or training days on their own weekdays in order — and back to back
 * otherwise. A cycle that runs is weekly whenever its days allow it, because its runs are
 * planned week by week.
 */
export function inferCycleRepeat(days: readonly CycleDay[]): CycleRepeat {
  if (days.length === 7) return "weekly";
  if (weekdayOffsets(days) === null) return "rolling";
  if (!days.some(isRest) || days.some((day) => day.includesRun)) return "weekly";
  return "rolling";
}

/** How many cycles a programme's weeks hold. */
export function cycleCount(
  weeks: number,
  dayCount: number,
  repeats: CycleRepeat | null | undefined,
): number {
  if (repeats === "once") return 1;
  if (repeats !== "rolling" || dayCount <= 0) return weeks;
  return Math.max(1, Math.round((weeks * 7) / dayCount));
}

/**
 * Whether the days are laid on their weekdays rather than one a day. Only a weekly cycle of
 * fewer than seven days differs: seven days a week back to back is every weekday anyway.
 */
export function datedByWeekday(
  days: readonly CycleDay[],
  repeats: CycleRepeat | null | undefined,
): boolean {
  return repeats === "weekly" && days.length < 7 && weekdayOffsets(days) !== null;
}

/**
 * What the calendar makes of a plan: how many cycles, and whether its days sit on weekdays.
 * Two plans with the same layout train on the same days, whatever their `repeats` says.
 */
export function cycleLayout(plan: CyclePlan): { cycles: number; byWeekday: boolean } {
  return {
    cycles: cycleCount(plan.weeks, plan.days.length, plan.repeats),
    byWeekday: datedByWeekday(plan.days, plan.repeats),
  };
}

/**
 * "Every week", or "Every 4 days" for a cycle laid back to back; "Progressive" for days trained
 * once, in order (ADR 0058).
 */
export function cycleRepeatLabel(plan: CyclePlan): string {
  if (plan.repeats === "once") return "Progressive";
  if (plan.days.length === 7 || cycleLayout(plan).byWeekday) return "Every week";
  return `Every ${plan.days.length === 1 ? "day" : `${plan.days.length} days`}`;
}

/** "8 weeks", or "8 weeks · 14 cycles" when the weeks do not hold one cycle each. */
export function programLengthLabel(plan: CyclePlan): string {
  if (plan.repeats === "once")
    return `${plan.days.length} ${plan.days.length === 1 ? "day" : "days"}`;
  const { cycles } = cycleLayout(plan);
  const weeks = `${plan.weeks} ${plan.weeks === 1 ? "week" : "weeks"}`;
  return cycles === plan.weeks
    ? weeks
    : `${weeks} · ${cycles} ${cycles === 1 ? "cycle" : "cycles"}`;
}

/**
 * Why a plan's cycle cannot repeat the way it says. Checked when a programme is written, not
 * when one is read, so a stored programme stays readable whatever it holds.
 */
export function cycleRepeatIssues(plan: CyclePlan): string[] {
  const issues: string[] = [];
  if (plan.repeats === "once") {
    if (plan.days.length > plan.weeks * 7)
      issues.push("The programme needs enough weeks to hold every day of its sequence.");
    if (plan.days.some((day) => day.includesRun))
      issues.push("Keep dated endurance sessions in their own sport programme.");
  } else if (plan.days.length > 31) {
    issues.push(
      "Use at most 31 days in a repeating cycle, or choose a programme that does not repeat.",
    );
  }
  if (plan.repeats === "weekly" && plan.days.length > 7)
    issues.push("A cycle that repeats every week has at most seven days.");
  else if (plan.repeats === "weekly" && plan.days.length < 7 && weekdayOffsets(plan.days) === null)
    issues.push(
      "In a programme that repeats every week, give each day its own weekday, in order through the week.",
    );
  if (
    plan.repeats === "rolling" &&
    plan.days.length !== 7 &&
    plan.days.some((day) => day.includesRun)
  )
    issues.push(
      "Runs are planned week by week, so a programme with running days has to repeat every week.",
    );
  return issues;
}
