import { addDays, daysBetween, isoWeekday } from "./program-calendar";
import type { ProgramBlueprint } from "./program-blueprint";
import { plannedRaceDate } from "./programme-start";
import { RUN_TYPE_INTENSITY, type RunType } from "./run-types";
import { weekStart } from "./running";

/**
 * A dated plan's days, moved all at once (ADR 0063).
 *
 * A coach left to choose the days chooses some, and says moving them is fine; moving them meant
 * editing every session of every week, one date at a time. Here each weekday the plan runs on is
 * given another, and every session on it moves to that day of its own week, the order of the
 * week kept. The race stays on race day; a session that would land before the plan starts, on or
 * after the race, or on a day another session keeps, stays where it was.
 */

type Dated = Pick<ProgramBlueprint, "startsOn" | "enduranceSessions" | "weeks">;

/** What a day of the plan mostly holds, in a word the athlete reads beside it. */
export type DayHolds = "long" | "hard" | "easy";

const hard = (type: RunType | undefined) =>
  type === "long" || (type !== undefined && RUN_TYPE_INTENSITY[type] === "quality");

/** The weekdays a dated plan runs on, Monday first, with what each mostly holds; the race aside. */
export function planRunDays(
  blueprint: Dated,
): { day: number; sessions: number; holds: DayHolds }[] {
  const start = blueprint.startsOn;
  if (!start) return [];
  const days = new Map<number, RunType[]>();
  for (const session of blueprint.enduranceSessions ?? []) {
    const type = session.prescription.running?.sessionType;
    if (type === "race") continue;
    const day = isoWeekday(addDays(start, session.dayOffset));
    days.set(day, [...(days.get(day) ?? []), ...(type ? [type] : [])]);
  }
  return [...days]
    .sort(([a], [b]) => a - b)
    .map(([day, types]) => {
      const long = types.filter((type) => type === "long").length;
      const quality = types.filter((type) => hard(type) && type !== "long").length;
      return {
        day,
        sessions: types.length,
        holds: long > 0 && long >= quality ? "long" : quality * 2 >= types.length ? "hard" : "easy",
      };
    });
}

/**
 * The plan with each weekday's sessions moved to the day `moves` gives it, and how many moved,
 * how many stayed for want of a free day, and how many pairs of hard days (a quality session,
 * the long run or the race) it leaves back to back.
 */
export function moveRunDays<T extends Dated>(
  blueprint: T,
  moves: Readonly<Record<number, number>>,
): { blueprint: T; moved: number; stayed: number; backToBack: number } {
  const start = blueprint.startsOn;
  const sessions = blueprint.enduranceSessions ?? [];
  if (!start) return { blueprint, moved: 0, stayed: 0, backToBack: 0 };
  const race = plannedRaceDate(blueprint);
  const last = addDays(start, blueprint.weeks * 7 - 1);
  const dates = sessions.map((session) => addDays(start, session.dayOffset));
  // Every session whose day is given another, the race aside, asks to move.
  const asking = sessions.map((session, index) => {
    const from = isoWeekday(dates[index]!);
    const to = moves[from] ?? from;
    return to !== from && session.prescription.running?.sessionType !== "race"
      ? addDays(weekStart(dates[index]!), to - 1)
      : null;
  });
  const wanted = asking.map((next) =>
    next === null || next < start || next > last || (race !== null && next >= race) ? null : next,
  );
  // A day another session keeps is not free: the moved one stays where it was.
  const kept = new Set(dates.filter((_, index) => wanted[index] === null));
  const final = dates.map((date, index) => {
    const next = wanted[index];
    return next && !kept.has(next) ? next : date;
  });
  const moved = final.filter((date, index) => date !== dates[index]).length;
  const asked = asking.filter((next) => next !== null).length;
  const placed = sessions.map((session, index) => {
    const dayOffset = daysBetween(start, final[index]!);
    return dayOffset === session.dayOffset
      ? session
      : { ...session, dayOffset, weekIndex: Math.floor(dayOffset / 7) + 1 };
  });
  const hardDays = [
    ...new Set(
      placed.flatMap((session, index) =>
        hard(session.prescription.running?.sessionType) ? [final[index]!] : [],
      ),
    ),
  ].sort();
  let backToBack = 0;
  for (let index = 1; index < hardDays.length; index++)
    if (daysBetween(hardDays[index - 1]!, hardDays[index]!) === 1) backToBack++;
  return {
    blueprint: moved > 0 ? { ...blueprint, enduranceSessions: placed } : blueprint,
    moved,
    stayed: asked - moved,
    backToBack,
  };
}
