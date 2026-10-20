import type { DbOrTx } from "@/db/types";
import { liftingWeek, datedStatus, type WeekSession } from "@/domain/plan-week";
import { addDays } from "@/domain/program-calendar";
import { partStatus, slotDates, slotFinishedOn, suggestion } from "@/domain/schedule";

import { occurrencesBetween } from "./occurrences";
import { getSchedule } from "./schedule";

/**
 * Plan's week (ADR 0058): every sport's sessions from `monday` to Sunday, with where each stands.
 * Lifting days come from the strength programme's calendar; runs, rides and swims from their own
 * dated sessions, those the athlete put on the calendar included. Read in two statements.
 */
export async function planWeek(
  db: DbOrTx,
  userId: string,
  monday: string,
  today: string,
): Promise<WeekSession[]> {
  const [occurrences, schedule] = await Promise.all([
    occurrencesBetween(db, userId, monday, addDays(monday, 7)),
    getSchedule(db, userId),
  ]);
  const dated = occurrences.flatMap((occurrence): WeekSession[] => {
    const status = datedStatus(occurrence.resolution, occurrence.scheduledOn, today);
    return status
      ? [
          {
            key: occurrence.id,
            date: occurrence.scheduledOn,
            sport: occurrence.sport,
            title: occurrence.prescription?.title ?? null,
            status,
            occurrenceId: occurrence.id,
          },
        ]
      : [];
  });
  if (!schedule?.program.startDate) return dated;
  const { state, days } = schedule;
  // Today offers the day the sequence has reached, unless a day was finished today: the next
  // one is then not today's, and Today no longer shows it (ADR 0058).
  const offered = slotFinishedOn(state, today) ? null : (suggestion(state)?.slot ?? null);
  const lifting = slotDates(state, schedule.program.startDate).flatMap(({ ref, date }) => {
    const day = days.find((entry) => entry.dayIndex === ref.dayIndex);
    return day?.includesLifting
      ? [{ ref, date, name: day.name, status: partStatus(state, ref, "session") }]
      : [];
  });
  return [...liftingWeek(lifting, offered, monday, today), ...dated];
}
