import type { ActivitySport } from "@/domain/activity";
import {
  enduranceAdherence,
  isAhead,
  liftingAdherence,
  sessionStanding,
  type SessionStanding,
  type SportAdherence,
} from "@/domain/programme-sessions";
import { nextPendingSlot, type ScheduleState } from "@/domain/schedule";
import type { ProgrammeOccurrence } from "@/server/repositories/occurrences";

export type ProgrammeRow = {
  occurrence: ProgrammeOccurrence;
  standing: SessionStanding;
  /** The programme day it belongs to, as the cycle names it; null when it belongs to none. */
  dayName: string | null;
};

export type ProgrammeView = {
  /** Per sport, lifting first. Empty when there is nothing of the programme to count. */
  adherence: SportAdherence[];
  /** Each list's title, by what it holds: "Runs to come", "Runs not done", "Earlier runs". */
  titles: { ahead: string; notDone: string; earlier: string };
  /** Still owed, in the order the sequence will reach them: Today's first. */
  ahead: ProgrammeRow[];
  /** Left behind with no answer, oldest first. */
  notDone: ProgrammeRow[];
  /** Answered one way or another, the latest first. */
  earlier: ProgrammeRow[];
};

const PLURALS: Record<ActivitySport, string> = {
  strength: "workouts",
  running: "runs",
  cycling: "rides",
  swimming: "swims",
};

/**
 * What a programme's sessions are, said by their sports: "runs", "runs and rides", "runs, rides
 * and swims". The lists hold only the sessions an occurrence records, never the lifting days the
 * adherence above them counts, so their titles say whose they are ("Runs to come") rather than
 * reading as the whole programme (year audit, October 2026).
 */
export function sessionsNoun(sports: readonly ActivitySport[]): string {
  const order: ActivitySport[] = ["running", "cycling", "swimming", "strength"];
  const words = order.filter((sport) => sports.includes(sport)).map((sport) => PLURALS[sport]);
  if (words.length === 0) return "sessions";
  return words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

function listTitles(noun: string): ProgrammeView["titles"] {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return { ahead: `${Noun} to come`, notDone: `${Noun} not done`, earlier: `Earlier ${noun}` };
}

/** Where a row sits in the sequence: its cycle and slot, or its date where it has neither. */
function compareRows(a: ProgrammeRow, b: ProgrammeRow): number {
  const x = a.occurrence;
  const y = b.occurrence;
  return (
    (x.cycleIndex ?? 0) - (y.cycleIndex ?? 0) ||
    (x.cycleDayIndex ?? 0) - (y.cycleDayIndex ?? 0) ||
    (x.scheduledOn < y.scheduledOn ? -1 : x.scheduledOn > y.scheduledOn ? 1 : 0) ||
    x.orderIndex - y.orderIndex
  );
}

/**
 * The programme page, worked out from the sequence and the programme's occurrences.
 *
 * What is still to do comes first, in the order Today will offer it; what was answered follows,
 * the latest first. Each row is placed by where it stands in the sequence, never by its date
 * alone, so a gap in the calendar leaves runs to come rather than missed (owner, 11 October
 * 2026). `sport` narrows the page to one sport, lifting included.
 */
export function programmeView(input: {
  state: ScheduleState;
  days: readonly { dayIndex: number; name: string }[];
  occurrences: readonly ProgrammeOccurrence[];
  today: string;
  sport?: ActivitySport | null;
}): ProgrammeView {
  const position = nextPendingSlot(input.state);
  const names = new Map(input.days.map((day) => [day.dayIndex, day.name]));
  const rows: ProgrammeRow[] = input.occurrences.map((occurrence) => ({
    occurrence,
    standing: sessionStanding(input.state, occurrence, input.today, position),
    dayName:
      occurrence.cycleDayIndex === null ? null : (names.get(occurrence.cycleDayIndex) ?? null),
  }));
  rows.sort(compareRows);

  const lifting = !input.sport || input.sport === "strength" ? liftingAdherence(input.state) : null;
  return {
    adherence: [
      ...(lifting ? [lifting] : []),
      ...enduranceAdherence(
        rows.map((row) => ({ sport: row.occurrence.sport, standing: row.standing })),
      ),
    ],
    titles: listTitles(sessionsNoun(rows.map((row) => row.occurrence.sport))),
    ahead: rows.filter((row) => isAhead(row.standing)),
    notDone: rows.filter((row) => row.standing === "not_done"),
    earlier: rows.filter((row) => !isAhead(row.standing) && row.standing !== "not_done").reverse(),
  };
}
