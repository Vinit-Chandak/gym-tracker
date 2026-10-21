import type { DbOrTx } from "@/db/types";
import { liftingWeek, datedStatus, type WeekSession } from "@/domain/plan-week";
import { addDays } from "@/domain/program-calendar";

import { occurrencesBetween } from "./occurrences";
import { getSchedule } from "./schedule";

/**
 * Plan's week (ADR 0058): every sport's sessions from `monday` to Sunday, with where each stands.
 * Lifting days come from the strength programme's sequence (`liftingWeek`); runs, rides and swims
 * from their own dated sessions, those the athlete put on the calendar included. Read in two
 * statements.
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
            dayId: null,
            prescription: occurrence.prescription,
          },
        ]
      : [];
  });
  if (!schedule?.program.startDate) return dated;
  const lifting = liftingWeek(
    {
      state: schedule.state,
      days: schedule.days,
      startDate: schedule.program.startDate,
      pickedUp: schedule.pickedUp,
    },
    monday,
    today,
  );
  return [...lifting, ...dated];
}
