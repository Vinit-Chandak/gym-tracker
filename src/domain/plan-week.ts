import type { ActivitySport } from "./activity";
import type { EndurancePrescription } from "./activity-prescription";
import type { OccurrenceResolution } from "./occurrences";
import { addDays, daysBetween, isoWeekday } from "./program-calendar";
import {
  allSlots,
  isRestSlot,
  slotDates,
  slotFinishedOn,
  suggestion,
  type ScheduleState,
  type SlotRef,
} from "./schedule";

/**
 * Where a planned session stands on Plan's week (ADR 0058): done, skipped, missed once its day
 * has passed unanswered, today's, or still to come. A session of today's is Today's to start or
 * log, so the week only points to it.
 */
export type WeekStatus = "done" | "skipped" | "missed" | "today" | "planned";

/** One planned session on the week, from any sport's programme or put on the calendar. */
export type WeekSession = {
  key: string;
  /**
   * The day it stands on: an endurance session's own date; a lifting day's, the date it was done
   * or skipped, else the date the sequence will reach it (`liftingWeek`).
   */
  date: string;
  sport: ActivitySport;
  /** Its own name; null for an endurance session nobody named, which the row names by sport. */
  title: string | null;
  status: WeekStatus;
  /** The scheduled session it is, for an endurance session, whose page it opens. */
  occurrenceId: string | null;
  /** The programme day it is, for a lifting day, whose page it opens. */
  dayId: string | null;
  /**
   * What an endurance session asks for, so its row is named as Today names it (ADR 0059: its
   * name, else its kind of run, else its sport) with its figure beside it.
   */
  prescription?: EndurancePrescription | null;
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

/** The strength programme as the week reads it: its days, its sequence and when it began. */
export type LiftingSchedule = {
  state: ScheduleState;
  days: readonly { id: string; dayIndex: number; name: string; includesLifting: boolean }[];
  startDate: string;
  /** The days "Pick up from today" skipped (ADR 0051), rather than the athlete one at a time. */
  pickedUp?: readonly SlotRef[];
};

const slotKey = (ref: SlotRef) => `${ref.cycleIndex}:${ref.dayIndex}`;

/**
 * The dates after `after` on which the programme's calendar has a day that trains
 * (`slotDates`), `count` of them at most. The calendar runs on past its last cycle, so a
 * sequence that has waited beyond the programme's end still has dates to land on.
 */
function trainingDatesAfter(
  state: ScheduleState,
  startDate: string,
  after: string,
  count: number,
): string[] {
  const trains = new Set(
    state.slots.filter((slot) => !isRestSlot(slot)).map((slot) => slot.dayIndex),
  );
  if (count <= 0 || trains.size === 0) return [];
  const last = slotDates(state, startDate).at(-1)?.date ?? startDate;
  // A cycle spans at least a day for each of its days: enough more cycles to pass `after`, and
  // one more for each date wanted, since every cycle trains at least once.
  const more = Math.ceil(Math.max(0, daysBetween(last, after)) / state.slots.length) + count + 1;
  return slotDates({ ...state, cycles: state.cycles + more }, startDate)
    .filter(({ ref, date }) => date > after && trains.has(ref.dayIndex))
    .slice(0, count)
    .map(({ date }) => date);
}

/**
 * The week's lifting days, each drawn once (ADR 0058). A day done or skipped stands on the date
 * it was done or skipped, save one "Pick up from today" skipped: that stands where the calendar
 * put it, where it was due, so a long gap picked up does not pile onto the day of the tap. The
 * sequence waits for a day still owed (ADR 0051), so such a day stands where the sequence will
 * reach it, never on the date the calendar first gave it: the day Today offers on today, and
 * each lifting day after it on the programme's next training date, as its calendar lays its days
 * out. A day finished today has had its day, so Today offers nothing more and what is left
 * starts after it.
 */
export function liftingWeek(
  { state, days, startDate, pickedUp = [] }: LiftingSchedule,
  monday: string,
  today: string,
): WeekSession[] {
  const sunday = addDays(monday, 6);
  const lifting = new Map(
    days.filter((day) => day.includesLifting).map((day) => [day.dayIndex, day]),
  );
  const answers = new Map(
    state.events
      .filter((event) => event.part === "session")
      .map((event) => [slotKey(event), event]),
  );
  const sequence = allSlots(state).filter((ref) => lifting.has(ref.dayIndex));
  const owed = sequence.filter((ref) => !answers.has(slotKey(ref)));
  const offered = slotFinishedOn(state, today) ? null : (suggestion(state)?.slot ?? null);
  const onToday = offered && owed.find((ref) => slotKey(ref) === slotKey(offered));
  const later = owed.filter((ref) => ref !== onToday);
  // Only as far as the week shown: a date holds one day of the sequence at most.
  const dates = trainingDatesAfter(
    state,
    startDate,
    today,
    Math.min(later.length, daysBetween(today, sunday)),
  );
  const reached = new Map(later.slice(0, dates.length).map((ref, i) => [slotKey(ref), dates[i]]));
  if (onToday) reached.set(slotKey(onToday), today);
  const calendar = new Map(
    slotDates(state, startDate).map(({ ref, date }) => [slotKey(ref), date]),
  );
  const picked = new Set(pickedUp.map(slotKey));
  return sequence.flatMap((ref) => {
    const slot = slotKey(ref);
    const day = lifting.get(ref.dayIndex);
    const answer = answers.get(slot);
    // A day Pick up from today skipped stands on its calendar date, as does one answered
    // without a date, from before answers carried one.
    const date = !answer
      ? reached.get(slot)
      : answer.status === "skipped" && picked.has(slot)
        ? calendar.get(slot)
        : (answer.occurredOn ?? calendar.get(slot));
    if (!day || !date || date < monday || date > sunday) return [];
    const status: WeekStatus = answer
      ? answer.status === "completed"
        ? "done"
        : "skipped"
      : date === today
        ? "today"
        : "planned";
    return [
      {
        key: `lift:${slot}`,
        date,
        sport: "strength" as const,
        title: day.name,
        status,
        occurrenceId: null,
        dayId: day.id,
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
