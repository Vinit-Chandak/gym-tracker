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
 * and the race on its date. Training judgement — how fast to build, what each week holds — is
 * the reference's, not a refusal's.
 */

export type RunningProgrammeAnswers = {
  goal: RunningIntake | null;
  /** Runs a week the athlete confirmed, or null to leave it to the coach. */
  runsPerWeek: number | null;
  /** ISO weekdays they can run on, or empty for any. */
  runDays: readonly number[];
};

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
  });

  if (answers.runsPerWeek !== null) {
    const perWeek = new Map<number, number>();
    for (const session of sessions)
      perWeek.set(session.weekIndex, (perWeek.get(session.weekIndex) ?? 0) + 1);
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
        const weekday = isoWeekday(addDays(start, session.dayOffset));
        if (!answers.runDays.includes(weekday))
          issues.push(`${label(index)} falls on a day the athlete did not offer.`);
      });
  }

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
