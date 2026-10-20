import { and, asc, eq, inArray } from "drizzle-orm";

import { programs, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { programWeekIndex } from "@/domain/program-calendar";
import { cycleRepeatLabel } from "@/domain/cycle-repeat";
import { endurancePattern } from "@/domain/programme-pattern";
import { partStatus, slotDates, suggestion } from "@/domain/schedule";
import { programmeOccurrences, occurrencesOnDate } from "./occurrences";
import { getSchedule, getProgramOverview } from "./schedule";

export async function activeSportProgrammes(db: DbOrTx, userId: string) {
  const rows = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")));
  return rows.sort((a, b) => ACTIVITY_SPORTS.indexOf(a.sport) - ACTIVITY_SPORTS.indexOf(b.sport));
}

export async function programmeCards(db: DbOrTx, userId: string, timeZone: string, today: string) {
  const active = await activeSportProgrammes(db, userId);
  const drafts = await db
    .select({
      id: programDrafts.id,
      sport: programDrafts.sport,
      baseProgramId: programDrafts.baseProgramId,
      headline: programDrafts.headline,
      status: programDrafts.status,
    })
    .from(programDrafts)
    .where(
      and(
        eq(programDrafts.userId, userId),
        inArray(programDrafts.status, ["editing", "ready"]),
        eq(programDrafts.standalone, false),
      ),
    )
    .orderBy(asc(programDrafts.createdAt));
  /**
   * Each card says what the programme is and how it runs, and where it has got to (ADR 0058):
   * "Every week · Week 3 of 8", "Progressive · Week 5 of 12". Never its next session, which is
   * Today's, and never a bar, which is the programme's own page's.
   */
  return Promise.all(
    active.map(async (programme): Promise<ProgrammeCard> => {
      const waiting = drafts.filter(
        (draft) => draft.sport === programme.sport && draft.baseProgramId === programme.id,
      );
      if (programme.sport === "strength") {
        const overview = await getProgramOverview(db, userId, timeZone);
        if (!overview)
          return { programme, waiting, pattern: null, position: null, finished: false };
        const pattern = cycleRepeatLabel({
          weeks: programme.weeks ?? 8,
          repeats: programme.repeats,
          days: overview.days.map((entry) => entry.day),
        });
        const nextDay = overview.days.find((day) => day.isNext)?.day;
        return {
          programme,
          waiting,
          pattern,
          position: overview.complete
            ? null
            : programme.repeats === "once"
              ? `Day ${nextDay?.dayIndex ?? overview.days.length} of ${overview.days.length}`
              : `${pattern === "Every week" ? "Week" : "Cycle"} ${overview.currentCycle} of ${overview.program.cycles}`,
          finished: overview.complete,
        };
      }
      const sessions = await programmeOccurrences(db, userId, programme.familyId);
      const week = programme.startDate
        ? programWeekIndex(programme.startDate, programme.weeks ?? 8, today)
        : null;
      const finished =
        sessions.length > 0 &&
        sessions.every((session) => session.resolution.kind !== "incomplete");
      return {
        programme,
        waiting,
        pattern: endurancePattern(
          sessions.map((session) => ({
            prescription: session.prescription,
            withdrawn: session.resolution.kind === "cancelled",
          })),
        ),
        position: finished || !week ? null : `Week ${week} of ${programme.weeks ?? 8}`,
        finished,
      };
    }),
  );
}

export type ProgrammeCard = {
  programme: Awaited<ReturnType<typeof activeSportProgrammes>>[number];
  /** Drafts and proposals of a change to this programme, oldest first. */
  waiting: { id: string; status: string; headline: string | null }[];
  /** "Every week", "Every 4 days", "Progressive", "Repeating". */
  pattern: string | null;
  /** "Week 3 of 8", "Cycle 5 of 14", "Day 12 of 40"; null once finished. */
  position: string | null;
  finished: boolean;
};

/** A selected date identifies candidate sessions; only the athlete chooses an association. */
export async function sessionsForLogDate(
  db: DbOrTx,
  userId: string,
  sport: ActivitySport,
  date: string,
  today?: string,
) {
  if (sport !== "strength")
    return { endurance: await occurrencesOnDate(db, userId, date, sport), strength: [] };
  const schedule = await getSchedule(db, userId);
  if (schedule && today === date) {
    const next = suggestion(schedule.state);
    const ref = next?.nextTrainingSlot ?? next?.slot;
    const day = ref
      ? schedule.days.find((day) => day.dayIndex === ref.dayIndex && day.includesLifting)
      : null;
    return {
      endurance: [],
      strength:
        day && ref
          ? [
              {
                programDayId: day.id,
                dayIndex: ref.dayIndex,
                cycleIndex: ref.cycleIndex,
                name: day.name,
              },
            ]
          : [],
    };
  }
  const strength = schedule?.program.startDate
    ? slotDates(schedule.state, schedule.program.startDate).flatMap(
        ({ ref, date: scheduledOn }) => {
          const day = schedule.days.find((entry) => entry.dayIndex === ref.dayIndex);
          if (
            scheduledOn !== date ||
            !day?.includesLifting ||
            partStatus(schedule.state, ref, "session") === "completed"
          )
            return [];
          return [
            {
              programDayId: day.id,
              dayIndex: day.dayIndex,
              cycleIndex: ref.cycleIndex,
              name: day.name,
            },
          ];
        },
      )
    : [];
  return { endurance: [], strength };
}
