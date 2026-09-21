import { and, asc, eq } from "drizzle-orm";

import { programRuns } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { nextPendingSlot, suggestion } from "@/domain/schedule";

import { getSchedule, type Schedule } from "./schedule";

/**
 * The runs a programme prescribes, which is not the same thing as the runs anybody did.
 *
 * What was done lives in `activities` and is read through `training-data.ts`. This reads
 * `program_runs`, the prescriptions themselves, and exists for the one question a cycle view
 * asks: what is this cycle supposed to run? Everything here that used to read the retired
 * `runs` log — the old Runs tab's list, detail, overview and writers — went with the tab.
 */

export type PlannedRunRef = {
  id: string;
  weekIndex: number;
  dayOfWeek: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  distanceMinKm: number | null;
  distanceMaxKm: number | null;
  rpeMin: number | null;
  rpeMax: number | null;
};

const plannedColumns = {
  id: programRuns.id,
  weekIndex: programRuns.weekIndex,
  dayOfWeek: programRuns.dayOfWeek,
  durationMinMinutes: programRuns.durationMinMinutes,
  durationMaxMinutes: programRuns.durationMaxMinutes,
  distanceMinKm: programRuns.distanceMinKm,
  distanceMaxKm: programRuns.distanceMaxKm,
  rpeMin: programRuns.rpeMin,
  rpeMax: programRuns.rpeMax,
};

export type PlannedRunStatus = PlannedRunRef & {
  paceNote: string | null;
  progressionNote: string | null;
  stopRule: string | null;
  comment: string | null;
};

export type PlannedRunsForCycle = { cycleIndex: number; planned: PlannedRunStatus[] };

/** The current cycle's planned runs, wherever the sequence has got to. */
export async function plannedRunsForCurrentCycle(
  db: DbOrTx,
  userId: string,
): Promise<PlannedRunsForCycle | null> {
  const schedule = await getSchedule(db, userId);
  if (!schedule) return null;
  return plannedRunsForCycle(db, schedule);
}

/** As above, for a schedule the caller already holds, so it can be read alongside other data. */
export async function plannedRunsForCycle(
  db: DbOrTx,
  schedule: Schedule,
): Promise<PlannedRunsForCycle> {
  const { state } = schedule;
  const cycleIndex =
    suggestion(state)?.slot.cycleIndex ?? nextPendingSlot(state)?.cycleIndex ?? state.cycles;
  const rows = await db
    .select({
      ...plannedColumns,
      paceNote: programRuns.paceNote,
      progressionNote: programRuns.progressionNote,
      stopRule: programRuns.stopRule,
      comment: programRuns.comment,
    })
    .from(programRuns)
    .where(
      and(eq(programRuns.programId, schedule.program.id), eq(programRuns.weekIndex, cycleIndex)),
    )
    .orderBy(asc(programRuns.dayOfWeek));
  return { cycleIndex, planned: rows };
}
