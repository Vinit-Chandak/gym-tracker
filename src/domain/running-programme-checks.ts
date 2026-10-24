import { expandSteps, type EndurancePrescription } from "./activity-prescription";
import { addDays, isoWeekday } from "./program-calendar";
import type { ProgramBlueprint } from "./program-blueprint";
import { RUN_TYPE_INTENSITY } from "./run-types";
import type { RunningIntake } from "./running-intake";

/**
 * What the server holds a coach-written running programme to (ADR 0059), beyond what the
 * schema already refuses: the things an athlete would notice at once and a coach can always
 * get right. Each issue names the session it is about, so one correction can answer every one.
 *
 * These are the athlete's own answers, checked: how many runs a week they said, which days,
 * each day's time limit, and the race on its date; and the coach's own sums, which the athlete
 * reads: a session's steps add up to the time it says it takes (ADR 0063). Training judgement
 * — how fast to build, what each week holds — is the reference's, not a refusal's.
 */

export type RunningProgrammeAnswers = {
  goal: RunningIntake | null;
  /** Runs a week the athlete confirmed, or null to leave it to the coach. */
  runsPerWeek: number | null;
  /** ISO weekdays they can run on, or empty for any. */
  runDays: readonly number[];
  /**
   * An older intake's minutes for every run but the long run, before limits were asked by day
   * (ADR 0063); its `goal.longRunMinutes` is the long run's.
   */
  minutesPerRun?: number | null;
};

/** A sum read to the minute is a minute either way: a coach is refused a real difference only. */
const SLACK_MS = 60_000;

const minutes = (ms: number) => Math.round(ms / 60_000);
const span = ([low, high]: readonly [number, number]) =>
  minutes(low) === minutes(high) ? `${minutes(high)} min` : `${minutes(low)}–${minutes(high)} min`;

/**
 * How long a session's written steps take, shortest to longest: a distance step at its pace, or
 * the session's, the fast end for the shortest and the slow end for the longest, with the rests
 * between repetitions. Null without steps, or when a distance has no pace to time it by.
 */
export function stepsTime(prescription: EndurancePrescription): [number, number] | null {
  if (prescription.nodes.length === 0) return null;
  let low = 0;
  let high = 0;
  for (const step of expandSteps(prescription)) {
    if (step.target.kind === "duration") {
      low += step.target.ms[0];
      high += step.target.ms[1];
      continue;
    }
    const pace = step.paceSecondsPerKm ?? prescription.sessionTargets.paceSecondsPerKm;
    if (!pace) return null;
    low += step.target.metres[0] * pace[0];
    high += step.target.metres[1] * pace[1];
  }
  for (const node of prescription.nodes)
    if (node.kind === "repeat" && node.restBetweenMs) {
      low += node.restBetweenMs * (node.repetitions - 1);
      high += node.restBetweenMs * (node.repetitions - 1);
    }
  return [low, high];
}

/** The longest a session may take: its own time, else its steps', else its distance at its pace. */
function longestTime(prescription: EndurancePrescription): number | null {
  const { durationMs, distanceMetres, paceSecondsPerKm } = prescription.sessionTargets;
  if (durationMs) return durationMs[1];
  const steps = stepsTime(prescription);
  if (steps) return steps[1];
  return distanceMetres && paceSecondsPerKm ? distanceMetres[1] * paceSecondsPerKm[1] : null;
}

/** Quality sessions are written as steps; an easy or long run may be a whole-session target. */
function needsSteps(type: string): boolean {
  return (
    type in RUN_TYPE_INTENSITY &&
    RUN_TYPE_INTENSITY[type as keyof typeof RUN_TYPE_INTENSITY] === "quality" &&
    type !== "race"
  );
}

export function runningProgrammeIssues(
  plan: ProgramBlueprint,
  answers: RunningProgrammeAnswers,
): string[] {
  const issues: string[] = [];
  const sessions = plan.enduranceSessions ?? [];
  const label = (index: number) => {
    const session = sessions[index]!;
    return `"${session.name || `Session ${index + 1}`}" (week ${session.weekIndex})`;
  };

  sessions.forEach((session, index) => {
    const type = session.prescription.running?.sessionType;
    if (!type) {
      issues.push(`Give ${label(index)} its running.sessionType.`);
      return;
    }
    if (needsSteps(type) && session.prescription.nodes.length === 0)
      issues.push(
        `Write ${label(index)} as steps: a ${type.replace("_", " ")} session has a warm-up, its work and a cool-down.`,
      );
    // The figure the athlete reads beside a session is the time its steps add up to.
    const own = session.prescription.sessionTargets.durationMs;
    const steps = stepsTime(session.prescription);
    if (
      own &&
      steps &&
      (steps[1] > own[1] + Math.max(SLACK_MS, own[1] * 0.05) ||
        steps[0] < own[0] - Math.max(SLACK_MS, own[0] * 0.05))
    )
      issues.push(
        `${label(index)} says ${span(own)}, but its steps add up to ${span(steps)}: make them agree.`,
      );
  });

  if (answers.runsPerWeek !== null) {
    // Counted by the week each run falls in, as the athlete meets it, whatever its weekIndex.
    const perWeek = new Map<number, number>();
    for (const session of sessions) {
      const week = Math.floor(session.dayOffset / 7) + 1;
      perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
    }
    for (const [week, count] of [...perWeek].sort(([a], [b]) => a - b))
      if (count > answers.runsPerWeek)
        issues.push(
          `Week ${week} has ${count} runs; the athlete confirmed ${answers.runsPerWeek} a week.`,
        );
  }

  const start = plan.startsOn;
  if (answers.runDays.length > 0) {
    if (!start)
      issues.push("Set startsOn: the athlete confirmed run days, which are counted from it.");
    else
      sessions.forEach((session, index) => {
        // The race is on the date the athlete gave for it, whichever weekday that is.
        if (session.prescription.running?.sessionType === "race") return;
        const weekday = isoWeekday(addDays(start, session.dayOffset));
        if (!answers.runDays.includes(weekday))
          issues.push(`${label(index)} falls on a day the athlete did not offer.`);
      });
  }

  // Each run fits its day's time limit at the slow end of its pace (ADR 0063); a race is the
  // race. An older intake said one figure for every run and another for the long run.
  const limits = answers.goal?.timeLimits ?? [];
  if (limits.length > 0 && !start)
    issues.push("Set startsOn: the athlete's time limits are by weekday, counted from it.");
  sessions.forEach((session, index) => {
    const type = session.prescription.running?.sessionType;
    const longest = longestTime(session.prescription);
    if (type === "race" || longest === null) return;
    let limit: { minutes: number; on: string } | null = null;
    if (limits.length > 0) {
      if (!start) return;
      const weekday = isoWeekday(addDays(start, session.dayOffset));
      const found = limits.find((entry) => entry.day === weekday);
      limit = found ? { minutes: found.minutes, on: `on ${WEEKDAYS[weekday - 1]}` } : null;
    } else if (type === "long" && answers.goal?.longRunMinutes)
      limit = { minutes: answers.goal.longRunMinutes, on: "for the long run" };
    else if (type !== "long" && answers.minutesPerRun)
      limit = { minutes: answers.minutesPerRun, on: "for a run" };
    if (limit && longest > limit.minutes * 60_000 + SLACK_MS)
      issues.push(
        `${label(index)} takes up to ${minutes(longest)} min; the athlete has ${limit.minutes} min ${limit.on}.`,
      );
  });

  const raceDate = answers.goal?.goal === "race" ? answers.goal.raceDate : null;
  if (raceDate) {
    if (!start) issues.push(`Set startsOn so the programme ends with the race on ${raceDate}.`);
    else {
      const dated = sessions.map((session) => addDays(start, session.dayOffset));
      const race = sessions.findIndex(
        (session, index) =>
          session.prescription.running?.sessionType === "race" && dated[index] === raceDate,
      );
      if (race < 0)
        issues.push(`End the programme with a session of sessionType race on ${raceDate}.`);
      const after = dated.findIndex((date) => date > raceDate);
      if (after >= 0) issues.push(`${label(after)} is after the race on ${raceDate}.`);
    }
  }
  return issues;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
