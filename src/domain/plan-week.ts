import type { ActivitySport } from "./activity";
import type { OccurrenceResolution } from "./occurrences";
import { addDays, isoWeekday } from "./program-calendar";
import type { SlotRef, SlotStatus } from "./schedule";

/**
 * Where a planned session stands on Plan's week (ADR 0058): done, skipped, missed once its day
 * has passed unanswered, today's, or still to come. A session of today's is Today's to start or
 * log, so the week only points to it.
 */
export type WeekStatus = "done" | "skipped" | "missed" | "today" | "planned";

/** One planned session on the week, from any sport's programme or put on the calendar. */
export type WeekSession = {
  key: string;
  /** The day it is planned for, which for the lifting day Today offers is today. */
  date: string;
  sport: ActivitySport;
  /** Its own name; null for an endurance session nobody named, which the row names by sport. */
  title: string | null;
  status: WeekStatus;
  /** The scheduled session it is, for an endurance session; lifting days have no page of their own. */
  occurrenceId: string | null;
};

/** The Monday of the week holding `date`: a week runs Monday to Sunday. */
export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * A dated session's standing: what answered it, else where its day stands against today. Null
 * for one a programme change withdrew, which asks for nothing and has no row.
 */
export function datedStatus(
  resolution: OccurrenceResolution,
  scheduledOn: string,
  today: string,
): WeekStatus | null {
  switch (resolution.kind) {
    case "logged":
    case "legacy_completed":
      return "done";
    case "skipped":
      return "skipped";
    case "cancelled":
      return null;
    case "incomplete":
      return scheduledOn < today ? "missed" : scheduledOn === today ? "today" : "planned";
  }
}

/** A lifting day as the week needs it: where the programme put it, and what became of it. */
export type LiftingDay = {
  ref: SlotRef;
  /** The date the programme's calendar gives the slot (`slotDates`). */
  date: string;
  name: string;
  status: SlotStatus | "pending";
};

/**
 * The week's lifting days. The sequence waits for a missed day and runs on when a day is done
 * early (ADR 0051), so the day Today offers stands on today, whichever date the calendar gave
 * it: that is when it will be trained. Any other day still owed reads missed once its date has
 * passed.
 */
export function liftingWeek(
  days: readonly LiftingDay[],
  offered: SlotRef | null,
  monday: string,
  today: string,
): WeekSession[] {
  const sunday = addDays(monday, 6);
  return days.flatMap((day) => {
    const isOffered =
      offered !== null &&
      day.status === "pending" &&
      day.ref.cycleIndex === offered.cycleIndex &&
      day.ref.dayIndex === offered.dayIndex;
    const date = isOffered ? today : day.date;
    if (date < monday || date > sunday) return [];
    const status: WeekStatus =
      day.status === "completed"
        ? "done"
        : day.status === "skipped"
          ? "skipped"
          : isOffered
            ? "today"
            : date < today
              ? "missed"
              : "planned";
    return [
      {
        key: `lift:${day.ref.cycleIndex}:${day.ref.dayIndex}`,
        date,
        sport: "strength" as const,
        title: day.name,
        status,
        occurrenceId: null,
      },
    ];
  });
}

const SPORT_ORDER: readonly ActivitySport[] = ["strength", "running", "cycling", "swimming"];

/**
 * The week's sessions by day, earliest first, lifting before running, riding and swimming on a
 * shared day as Today lists them. Days with nothing planned are left out.
 */
export function byDay(
  sessions: readonly WeekSession[],
): { date: string; sessions: WeekSession[] }[] {
  const days = new Map<string, WeekSession[]>();
  for (const session of [...sessions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || SPORT_ORDER.indexOf(a.sport) - SPORT_ORDER.indexOf(b.sport),
  )) {
    days.set(session.date, [...(days.get(session.date) ?? []), session]);
  }
  return [...days].map(([date, entries]) => ({ date, sessions: entries }));
}
