import { and, asc, eq, inArray } from "drizzle-orm";

import { programs, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { programWeekIndex } from "@/domain/program-calendar";
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
  return Promise.all(
    active.map(async (programme) => {
      const waiting = drafts.filter((draft) => draft.sport === programme.sport);
      if (programme.sport === "strength") {
        const overview = await getProgramOverview(db, userId, timeZone);
        return {
          programme,
          waiting,
          position: overview
            ? `Cycle ${overview.currentCycle} of ${overview.program.cycles}`
            : null,
          next: overview?.days.find((day) => day.isNext)?.day.name ?? null,
          completed: overview?.progress.completed ?? 0,
          total: overview?.progress.total ?? 0,
        };
      }
      const sessions = await programmeOccurrences(db, userId, programme.familyId);
      const upcoming = sessions.find(
        (session) => session.scheduledOn >= today && session.resolution.kind === "incomplete",
      );
      const week = programme.startDate
        ? programWeekIndex(programme.startDate, programme.weeks ?? 8, today)
        : null;
      return {
        programme,
        waiting,
        position: week ? `Week ${week} of ${programme.weeks}` : null,
        next: upcoming?.scheduledOn ?? null,
        completed: sessions.filter(
          (session) =>
            session.resolution.kind === "logged" || session.resolution.kind === "legacy_completed",
        ).length,
        total: sessions.filter((session) => session.resolution.kind !== "cancelled").length,
      };
    }),
  );
}

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
