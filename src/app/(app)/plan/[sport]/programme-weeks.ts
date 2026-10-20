import { daysBetween } from "@/domain/program-calendar";
import type { ProgrammeOccurrence } from "@/server/repositories/occurrences";

export function currentProgrammeWeek(start: string | null, weeks: number, today: string): number {
  return start ? Math.max(1, Math.min(weeks, Math.floor(daysBetween(start, today) / 7) + 1)) : 1;
}

export function selectedProgrammeWeek(
  requested: string | string[] | undefined,
  current: number,
  weeks: number,
): number {
  const value = typeof requested === "string" ? Number(requested) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= weeks ? value : current;
}

/** A moved session still belongs to the programme week it was written for. */
export function sessionsInProgrammeWeek(
  sessions: readonly ProgrammeOccurrence[],
  start: string | null,
  weeks: number,
  week: number,
): ProgrammeOccurrence[] {
  return sessions.filter(
    (session) =>
      (session.originalWeekIndex ??
        currentProgrammeWeek(start, weeks, session.originalScheduledOn ?? session.scheduledOn)) ===
      week,
  );
}
