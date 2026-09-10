import { and, asc, desc, eq } from "drizzle-orm";

import { programRuns, runs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  shinEscalations,
  volumeSpike,
  weeklyVolumes,
  type ShinEscalation,
  type VolumeSpike,
  type WeekVolume,
} from "@/domain/running";
import { nextPendingSlot, suggestion } from "@/domain/schedule";
import type { RunMode } from "@/domain/types";

import { getSchedule, type Schedule } from "./schedule";

export class RunNotFoundError extends Error {
  constructor() {
    super("That run no longer exists.");
    this.name = "RunNotFoundError";
  }
}

export class PlannedRunNotFoundError extends Error {
  constructor() {
    super("That planned run is not in your programme.");
    this.name = "PlannedRunNotFoundError";
  }
}

export type RunInput = {
  mode: RunMode;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number;
  rpe: number | null;
  shinLeftPre: number | null;
  shinRightPre: number | null;
  shinLeftDuring: number | null;
  shinRightDuring: number | null;
  shinLeftPost: number | null;
  shinRightPost: number | null;
  /** The programme run this fulfils, or null for an unplanned run. */
  programRunId: string | null;
  notes: string | null;
};

export type PlannedRunRef = {
  id: string;
  weekIndex: number;
  dayOfWeek: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  rpeMin: number | null;
  rpeMax: number | null;
};

export type RunRecord = typeof runs.$inferSelect & { planned: PlannedRunRef | null };

/** Where a planned run sits in the programme: its programme, its week and its weekday. */
export type PlannedRunPlace = {
  id: string;
  programId: string;
  weekIndex: number;
  dayOfWeek: number;
};

export async function getPlannedRunPlace(
  db: DbOrTx,
  userId: string,
  programRunId: string,
): Promise<PlannedRunPlace | null> {
  const [row] = await db
    .select({
      id: programRuns.id,
      programId: programRuns.programId,
      weekIndex: programRuns.weekIndex,
      dayOfWeek: programRuns.dayOfWeek,
    })
    .from(programRuns)
    .where(and(eq(programRuns.id, programRunId), eq(programRuns.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function assertPlannedRun(db: DbOrTx, userId: string, programRunId: string | null) {
  if (!programRunId) return;
  if (!(await getPlannedRunPlace(db, userId, programRunId))) throw new PlannedRunNotFoundError();
}

export async function createRun(
  db: DbOrTx,
  userId: string,
  input: RunInput,
): Promise<{ id: string }> {
  await assertPlannedRun(db, userId, input.programRunId);
  const [row] = await db
    .insert(runs)
    .values({ userId, ...input })
    .returning({ id: runs.id });
  if (!row) throw new Error("Run insert returned no row");
  return row;
}

export async function updateRun(
  db: DbOrTx,
  userId: string,
  runId: string,
  input: RunInput,
): Promise<void> {
  await assertPlannedRun(db, userId, input.programRunId);
  const updated = await db
    .update(runs)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .returning({ id: runs.id });
  if (updated.length === 0) throw new RunNotFoundError();
}

export async function deleteRun(db: DbOrTx, userId: string, runId: string): Promise<void> {
  const deleted = await db
    .delete(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .returning({ id: runs.id });
  if (deleted.length === 0) throw new RunNotFoundError();
}

const plannedColumns = {
  id: programRuns.id,
  weekIndex: programRuns.weekIndex,
  dayOfWeek: programRuns.dayOfWeek,
  durationMinMinutes: programRuns.durationMinMinutes,
  durationMaxMinutes: programRuns.durationMaxMinutes,
  rpeMin: programRuns.rpeMin,
  rpeMax: programRuns.rpeMax,
};

export async function listRuns(db: DbOrTx, userId: string, limit = 50): Promise<RunRecord[]> {
  const rows = await db
    .select({ run: runs, planned: plannedColumns })
    .from(runs)
    .leftJoin(programRuns, eq(programRuns.id, runs.programRunId))
    .where(eq(runs.userId, userId))
    .orderBy(desc(runs.startedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.run, planned: row.planned?.id ? row.planned : null }));
}

export async function getRun(db: DbOrTx, userId: string, runId: string): Promise<RunRecord | null> {
  const [row] = await db
    .select({ run: runs, planned: plannedColumns })
    .from(runs)
    .leftJoin(programRuns, eq(programRuns.id, runs.programRunId))
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .limit(1);
  return row ? { ...row.run, planned: row.planned?.id ? row.planned : null } : null;
}

export type PlannedRunStatus = PlannedRunRef & {
  paceNote: string | null;
  progressionNote: string | null;
  shinRule: string | null;
  comment: string | null;
  /** The logged run that fulfils this planned run, if any. */
  loggedRunId: string | null;
};

export type PlannedRunsForCycle = { cycleIndex: number; planned: PlannedRunStatus[] };

/** The current cycle's planned runs (Wednesday and Saturday) with what has been logged for them. */
export async function plannedRunsForCurrentCycle(
  db: DbOrTx,
  userId: string,
  logged: readonly Pick<RunRecord, "id" | "programRunId">[],
): Promise<PlannedRunsForCycle | null> {
  const schedule = await getSchedule(db, userId);
  if (!schedule) return null;
  return plannedRunsForCycle(db, schedule, logged);
}

/** As above, for a schedule the caller already holds, so it can be read alongside other data. */
export async function plannedRunsForCycle(
  db: DbOrTx,
  schedule: Schedule,
  logged: readonly Pick<RunRecord, "id" | "programRunId">[],
): Promise<PlannedRunsForCycle> {
  const { state } = schedule;
  const cycleIndex =
    suggestion(state)?.slot.cycleIndex ?? nextPendingSlot(state)?.cycleIndex ?? state.cycles;
  const rows = await db
    .select({
      ...plannedColumns,
      paceNote: programRuns.paceNote,
      progressionNote: programRuns.progressionNote,
      shinRule: programRuns.shinRule,
      comment: programRuns.comment,
    })
    .from(programRuns)
    .where(
      and(eq(programRuns.programId, schedule.program.id), eq(programRuns.weekIndex, cycleIndex)),
    )
    .orderBy(asc(programRuns.dayOfWeek));
  return {
    cycleIndex,
    planned: rows.map((row) => ({
      ...row,
      loggedRunId: logged.find((run) => run.programRunId === row.id)?.id ?? null,
    })),
  };
}

export type RunsOverview = {
  today: string;
  /** This week then last week. */
  weeks: WeekVolume[];
  spike: VolumeSpike | null;
  cycle: PlannedRunsForCycle | null;
  shin: ShinEscalation[];
  recent: RunRecord[];
};

/** Everything the Runs tab shows. */
export async function getRunsOverview(
  db: DbOrTx,
  userId: string,
  timeZone: string,
): Promise<RunsOverview> {
  const today = todayInTimeZone(timeZone);
  // The runs and the programme are independent, so they are read in one round trip.
  const [all, schedule] = await Promise.all([listRuns(db, userId, 200), getSchedule(db, userId)]);
  const weeks = weeklyVolumes(
    all.map((run) => ({
      startedOn: todayInTimeZone(timeZone, run.startedAt),
      durationSeconds: run.durationSeconds,
      distanceMeters: run.distanceMeters,
    })),
    today,
    2,
  );
  const [thisWeek, lastWeek] = weeks;
  return {
    today,
    weeks,
    spike: thisWeek && lastWeek ? volumeSpike(thisWeek, lastWeek) : null,
    cycle: schedule ? await plannedRunsForCycle(db, schedule, all) : null,
    shin: shinEscalations(all),
    recent: all.slice(0, 20),
  };
}
