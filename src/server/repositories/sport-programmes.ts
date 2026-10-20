import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";

import { coachJobs, programs, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { programWeekIndex } from "@/domain/program-calendar";
import { cycleRepeatLabel } from "@/domain/cycle-repeat";
import { endurancePattern } from "@/domain/programme-pattern";
import { partStatus, slotDates, suggestion } from "@/domain/schedule";
import type { CycleRepeat } from "@/domain/types";
import { formatIsoDate } from "@/lib/format";
import { asReconciledJob } from "./coaching-jobs";
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
        return {
          programme,
          waiting,
          pattern,
          position: strengthPosition({
            complete: overview.complete,
            repeats: programme.repeats,
            pattern,
            currentCycle: overview.currentCycle,
            cycles: overview.program.cycles,
            nextDayIndex: overview.days.find((day) => day.isNext)?.day.dayIndex,
            dayCount: overview.days.length,
          }),
          finished: overview.complete,
        };
      }
      const sessions = await programmeOccurrences(db, userId, programme.familyId);
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
        position: finished
          ? null
          : endurancePosition(programme.startDate, programme.weeks ?? 8, today),
        finished,
      };
    }),
  );
}

/**
 * Where a strength programme has got to, in the words its card on Plan and its own page share
 * (ADR 0058): "Week 3 of 8" for one that runs every week, "Cycle 5 of 14" for one whose cycle is
 * not a week, "Day 12 of 40" for a progressive one; null once it is complete.
 */
export function strengthPosition(overview: {
  complete: boolean;
  repeats: CycleRepeat | null | undefined;
  /** How it runs, as `cycleRepeatLabel` says it: "Every week", "Every 4 days", "Progressive". */
  pattern: string;
  currentCycle: number;
  cycles: number;
  /** The day the sequence waits on, where one does. */
  nextDayIndex: number | undefined;
  dayCount: number;
}): string | null {
  if (overview.complete) return null;
  if (overview.repeats === "once")
    return `Day ${overview.nextDayIndex ?? overview.dayCount} of ${overview.dayCount}`;
  return `${overview.pattern === "Every week" ? "Week" : "Cycle"} ${overview.currentCycle} of ${overview.cycles}`;
}

/**
 * Where a run, ride or swim programme has got to, as its card and its page say it: "Week 3 of 21"
 * while it runs, "Starts Mon 26 Oct" before its first day, and nothing past its last week.
 */
export function endurancePosition(
  startDate: string | null,
  weeks: number,
  today: string,
): string | null {
  if (!startDate) return null;
  if (today < startDate) return `Starts ${formatIsoDate(startDate, today.slice(0, 4))}`;
  const week = programWeekIndex(startDate, weeks, today);
  return week ? `Week ${week} of ${weeks}` : null;
}

/**
 * A first programme of a sport, drafted and not yet started (ADR 0059): the coach's answer to a
 * request from New programme, or one being built by hand. It belongs to no programme yet, so
 * no programme's card can say it is waiting; Plan lists it beside them until it is started or
 * discarded.
 */
export async function newProgrammeDrafts(db: DbOrTx, userId: string) {
  const active = new Set((await activeSportProgrammes(db, userId)).map((row) => row.sport));
  const drafts = await db
    .select({
      id: programDrafts.id,
      sport: programDrafts.sport,
      status: programDrafts.status,
      name: sql<string | null>`${programDrafts.blueprint}->>'name'`,
    })
    .from(programDrafts)
    .where(
      and(
        eq(programDrafts.userId, userId),
        inArray(programDrafts.status, ["editing", "ready"]),
        eq(programDrafts.standalone, false),
        isNull(programDrafts.baseProgramId),
      ),
    )
    .orderBy(asc(programDrafts.createdAt));
  return drafts.filter((draft) => !active.has(draft.sport));
}

export type NewProgrammeDraft = Awaited<ReturnType<typeof newProgrammeDrafts>>[number];

/** Where a request for a first programme stands, in the words Plan's card says it in. */
export type NewProgrammeRequestStatus = "writing" | "needs_answer" | "failed";

export type NewProgrammeRequest = {
  id: string;
  sport: ActivitySport;
  status: NewProgrammeRequestStatus;
};

/**
 * A first programme asked of the coach (ADR 0059), from the moment it is asked until a draft
 * answers it: being written, waiting on the athlete's answer, or given up on. It belongs to no
 * programme and has no draft yet, so Plan lists it beside the programme cards, where the draft
 * will stand once it exists.
 *
 * Only a sport's latest request counts, and only while nothing newer stands for that sport's
 * first programme: a draft (the one this request was answered with, or one built by hand) or a
 * programme started since. A request answered, or set aside by changed answers, is finished
 * with.
 */
export async function newProgrammeRequests(
  db: DbOrTx,
  userId: string,
  now = new Date(),
): Promise<NewProgrammeRequest[]> {
  const jobSport = sql`coalesce(${coachJobs.target}->>'sport', 'strength')`;
  const [active, jobs, drafts, started] = await Promise.all([
    activeSportProgrammes(db, userId),
    db
      .selectDistinctOn([jobSport])
      .from(coachJobs)
      .where(
        and(
          eq(coachJobs.userId, userId),
          eq(coachJobs.kind, "create_program"),
          sql`coalesce(${coachJobs.target}->>'scope', 'programme') = 'programme'`,
          sql`${coachJobs.target}->>'programId' is null`,
        ),
      )
      .orderBy(jobSport, desc(coachJobs.createdAt)),
    db
      .select({ sport: programDrafts.sport, at: max(programDrafts.createdAt) })
      .from(programDrafts)
      .where(
        and(
          eq(programDrafts.userId, userId),
          eq(programDrafts.standalone, false),
          isNull(programDrafts.baseProgramId),
        ),
      )
      .groupBy(programDrafts.sport),
    db
      .select({ sport: programs.sport, at: max(programs.createdAt) })
      .from(programs)
      .where(eq(programs.userId, userId))
      .groupBy(programs.sport),
  ]);
  const activeSports = new Set(active.map((programme) => programme.sport));
  const since = (
    rows: readonly { sport: ActivitySport; at: Date | null }[],
    sport: ActivitySport,
  ) => rows.find((row) => row.sport === sport)?.at ?? null;
  return jobs
    .flatMap((stored): NewProgrammeRequest[] => {
      // An attempt whose lease ran out reads as it will be recorded: tried again, or given up.
      const job = asReconciledJob(stored, now);
      const sport = job.target.sport ?? "strength";
      const newer = [since(drafts, sport), since(started, sport)].some(
        (at) => at !== null && at >= job.createdAt,
      );
      if (activeSports.has(sport) || newer) return [];
      const status: NewProgrammeRequestStatus | null =
        job.status === "queued" || job.status === "claimed"
          ? "writing"
          : job.status === "needs_input"
            ? "needs_answer"
            : job.status === "failed"
              ? "failed"
              : null;
      return status ? [{ id: job.id, sport, status }] : [];
    })
    .sort((a, b) => ACTIVITY_SPORTS.indexOf(a.sport) - ACTIVITY_SPORTS.indexOf(b.sport));
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
