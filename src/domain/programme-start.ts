import { addDays, isoWeekday } from "./program-calendar";
import type { ProgramBlueprint } from "./program-blueprint";

/**
 * Where a programme the coach dated starts (ADR 0063).
 *
 * The coach counts a running plan from `startsOn`: a race plan back from race day, any other
 * plan onto the days the athlete can run. Every session is dated from the programme's start, so
 * starting it on another day moved every session with it, the race included: a plan opened a day
 * after its start put the race on the wrong day. A plan that ends with a race keeps every date
 * now, and a later start leaves out the sessions already behind it. Any other plan still starts
 * on the day chosen, and is offered the next day on its own weekday, so its runs keep their days.
 */

type Dated = Pick<ProgramBlueprint, "startsOn" | "enduranceSessions">;

/** The race a dated plan ends with: its last session of sessionType race, or null. */
export function plannedRaceDate(blueprint: Dated): string | null {
  const start = blueprint.startsOn;
  if (!start) return null;
  const races = (blueprint.enduranceSessions ?? []).filter(
    (session) => session.prescription.running?.sessionType === "race",
  );
  if (races.length === 0) return null;
  return addDays(start, Math.max(...races.map((session) => session.dayOffset)));
}

/**
 * The start a review offers first: the coach's own while it is still to come; once it has gone,
 * today for a race plan, which keeps its dates whenever it starts, and for any other plan the
 * next day on the weekday the coach counted from.
 */
export function suggestedStart(blueprint: Dated, today: string): string {
  const planned = blueprint.startsOn;
  if (!planned) return today;
  if (planned >= today) return planned;
  if (plannedRaceDate(blueprint)) return today;
  return addDays(today, (isoWeekday(planned) - isoWeekday(today) + 7) % 7);
}

/**
 * What starting on `firstDay` makes of a programme: the date its day offsets count from, the
 * sessions it keeps, and how many it leaves out. A race plan counts from its own start whatever
 * day is chosen, so the race stays on race day; the sessions dated before `firstDay` are left out.
 */
export function startOn<T extends Dated>(
  blueprint: T,
  firstDay: string,
): { startDate: string; blueprint: T; leftOut: number; raceDate: string | null } {
  const raceDate = plannedRaceDate(blueprint);
  if (!raceDate) return { startDate: firstDay, blueprint, leftOut: 0, raceDate: null };
  const anchor = blueprint.startsOn!;
  const sessions = blueprint.enduranceSessions ?? [];
  const kept = sessions.filter((session) => addDays(anchor, session.dayOffset) >= firstDay);
  return {
    startDate: anchor,
    blueprint:
      kept.length === sessions.length ? blueprint : { ...blueprint, enduranceSessions: kept },
    leftOut: sessions.length - kept.length,
    raceDate,
  };
}
