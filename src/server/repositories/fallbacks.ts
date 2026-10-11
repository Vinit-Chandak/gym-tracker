import { and, asc, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";

import {
  equipmentInstances,
  exercises,
  programDays,
  programExerciseFallbacks,
  programExercises,
  programs,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";

import { GymNotFoundError, machinesByExerciseAtGym } from "./equipment";
import { MachineNotAtGymError } from "./exercises";
import { getGym } from "./gyms";

export type GymFallbackItem = {
  id: string;
  programExerciseId: string;
  fallbackExerciseId: string;
  fallbackExerciseName: string;
  fallbackEquipmentInstanceId: string | null;
  fallbackInstanceName: string | null;
  rank: number;
};

export class IncompatibleFallbackMachineError extends Error {
  constructor() {
    super("Choose a compatible machine for this exercise, or Any.");
    this.name = "IncompatibleFallbackMachineError";
  }
}

/** Gym-specific fallbacks the user added for the planned exercises of the active programme. */
export async function listGymFallbacks(
  db: DbOrTx,
  userId: string,
  gymId: string,
): Promise<GymFallbackItem[]> {
  return db
    .select({
      id: programExerciseFallbacks.id,
      programExerciseId: programExerciseFallbacks.programExerciseId,
      fallbackExerciseId: programExerciseFallbacks.fallbackExerciseId,
      fallbackExerciseName: exercises.name,
      fallbackEquipmentInstanceId: programExerciseFallbacks.fallbackEquipmentInstanceId,
      fallbackInstanceName: equipmentInstances.name,
      rank: programExerciseFallbacks.rank,
    })
    .from(programExerciseFallbacks)
    .innerJoin(exercises, eq(exercises.id, programExerciseFallbacks.fallbackExerciseId))
    .leftJoin(
      equipmentInstances,
      eq(equipmentInstances.id, programExerciseFallbacks.fallbackEquipmentInstanceId),
    )
    .where(
      and(eq(programExerciseFallbacks.userId, userId), eq(programExerciseFallbacks.gymId, gymId)),
    );
}

/** Program exercise ids of the active programme that use `exerciseId`. */
async function activeProgramExerciseIds(
  db: DbOrTx,
  userId: string,
  exerciseId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: programExercises.id })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .innerJoin(programs, eq(programs.id, programDays.programId))
    .where(
      and(
        eq(programExercises.exerciseId, exerciseId),
        eq(programs.userId, userId),
        eq(programs.status, "active"),
      ),
    );
  return rows.map((row) => row.id);
}

export type AddGymFallbackInput = {
  gymId: string;
  exerciseId: string;
  fallbackExerciseId: string;
  fallbackEquipmentInstanceId: string | null;
};

/**
 * Adds a gym-specific fallback to every active-programme slot that uses the exercise. A slot that
 * already has it, on the same machine, is left as it is: a swap remembered every week is one
 * fallback, not one more each week. Returns how many slots have it now (0 when the exercise is
 * not in the programme).
 */
export async function addGymFallback(
  db: DbOrTx,
  userId: string,
  input: AddGymFallbackInput,
): Promise<number> {
  const gym = await getGym(db, userId, input.gymId);
  if (!gym) throw new GymNotFoundError();
  if (input.fallbackEquipmentInstanceId) {
    const [instance] = await db
      .select({ id: equipmentInstances.id })
      .from(equipmentInstances)
      .where(
        and(
          eq(equipmentInstances.id, input.fallbackEquipmentInstanceId),
          eq(equipmentInstances.gymId, input.gymId),
          eq(equipmentInstances.userId, userId),
        ),
      )
      .limit(1);
    if (!instance) throw new MachineNotAtGymError();
    const compatible = await machinesByExerciseAtGym(db, userId, input.gymId);
    if (!compatible[input.fallbackExerciseId]?.includes(instance.id)) {
      throw new IncompatibleFallbackMachineError();
    }
  }

  const slotIds = await activeProgramExerciseIds(db, userId, input.exerciseId);
  if (slotIds.length === 0) return 0;

  const [ranks, existing] = await Promise.all([
    db
      .select({
        programExerciseId: programExerciseFallbacks.programExerciseId,
        maxRank: max(programExerciseFallbacks.rank),
      })
      .from(programExerciseFallbacks)
      .where(inArray(programExerciseFallbacks.programExerciseId, slotIds))
      .groupBy(programExerciseFallbacks.programExerciseId),
    db
      .select({ programExerciseId: programExerciseFallbacks.programExerciseId })
      .from(programExerciseFallbacks)
      .where(
        and(
          inArray(programExerciseFallbacks.programExerciseId, slotIds),
          sameGymFallback(input.gymId, input.fallbackExerciseId, input.fallbackEquipmentInstanceId),
        ),
      ),
  ]);
  const maxRankBySlot = new Map(ranks.map((row) => [row.programExerciseId, row.maxRank ?? 0]));
  const holding = new Set(existing.map((row) => row.programExerciseId));
  const missing = slotIds.filter((programExerciseId) => !holding.has(programExerciseId));

  if (missing.length > 0) {
    await db.insert(programExerciseFallbacks).values(
      missing.map((programExerciseId) => ({
        userId,
        programExerciseId,
        gymId: input.gymId,
        fallbackExerciseId: input.fallbackExerciseId,
        fallbackEquipmentInstanceId: input.fallbackEquipmentInstanceId,
        rank: (maxRankBySlot.get(programExerciseId) ?? 0) + 1,
      })),
    );
  }
  return slotIds.length;
}

/**
 * A swap made in a workout, remembered as the fallback at this gym (Swap the exercise, Add a
 * fallback). It is the fallback for the exercise the row's programme slot plans, not for the one
 * the row holds now: a row already doing a fallback or the coach's swap still answers for the
 * slot's own lift, and going back to that lift is no fallback for it. Returns how many slots
 * have it now, as `addGymFallback` does.
 */
export async function rememberSlotFallback(
  db: DbOrTx,
  userId: string,
  input: Omit<AddGymFallbackInput, "exerciseId"> & { programExerciseId: string },
): Promise<number> {
  const plannedExerciseId = await slotExerciseId(db, userId, input.programExerciseId);
  if (!plannedExerciseId || plannedExerciseId === input.fallbackExerciseId) return 0;
  return addGymFallback(db, userId, {
    gymId: input.gymId,
    exerciseId: plannedExerciseId,
    fallbackExerciseId: input.fallbackExerciseId,
    fallbackEquipmentInstanceId: input.fallbackEquipmentInstanceId,
  });
}

/** The exercise a programme slot plans, whatever a workout row for it is doing instead. */
export async function slotExerciseId(
  db: DbOrTx,
  userId: string,
  programExerciseId: string,
): Promise<string | null> {
  const [slot] = await db
    .select({ exerciseId: programExercises.exerciseId })
    .from(programExercises)
    .where(and(eq(programExercises.id, programExerciseId), eq(programExercises.userId, userId)))
    .limit(1);
  return slot?.exerciseId ?? null;
}

/** The rows that are one gym fallback: its gym, its exercise and its machine, or none. */
function sameGymFallback(
  gymId: string,
  fallbackExerciseId: string,
  fallbackEquipmentInstanceId: string | null,
) {
  return and(
    eq(programExerciseFallbacks.gymId, gymId),
    eq(programExerciseFallbacks.fallbackExerciseId, fallbackExerciseId),
    fallbackEquipmentInstanceId
      ? eq(programExerciseFallbacks.fallbackEquipmentInstanceId, fallbackEquipmentInstanceId)
      : isNull(programExerciseFallbacks.fallbackEquipmentInstanceId),
  );
}

/**
 * Removes a gym-specific fallback. It was added to every slot that plans the exercise and
 * Programme fit lists it once, so it goes from all of them, copies included, not only from the
 * one row whose id was shown. Programme-level fallbacks (no gym) are left alone.
 */
export async function removeGymFallback(
  db: DbOrTx,
  userId: string,
  fallbackId: string,
): Promise<boolean> {
  const [fallback] = await db
    .select({
      programExerciseId: programExerciseFallbacks.programExerciseId,
      gymId: programExerciseFallbacks.gymId,
      fallbackExerciseId: programExerciseFallbacks.fallbackExerciseId,
      fallbackEquipmentInstanceId: programExerciseFallbacks.fallbackEquipmentInstanceId,
      plannedExerciseId: programExercises.exerciseId,
    })
    .from(programExerciseFallbacks)
    .innerJoin(
      programExercises,
      eq(programExercises.id, programExerciseFallbacks.programExerciseId),
    )
    .where(
      and(
        eq(programExerciseFallbacks.id, fallbackId),
        eq(programExerciseFallbacks.userId, userId),
        isNotNull(programExerciseFallbacks.gymId),
      ),
    )
    .limit(1);
  if (!fallback?.gymId) return false;
  const slotIds = new Set([
    fallback.programExerciseId,
    ...(await activeProgramExerciseIds(db, userId, fallback.plannedExerciseId)),
  ]);
  const deleted = await db
    .delete(programExerciseFallbacks)
    .where(
      and(
        eq(programExerciseFallbacks.userId, userId),
        inArray(programExerciseFallbacks.programExerciseId, [...slotIds]),
        sameGymFallback(
          fallback.gymId,
          fallback.fallbackExerciseId,
          fallback.fallbackEquipmentInstanceId,
        ),
      ),
    )
    .returning({ id: programExerciseFallbacks.id });
  return deleted.length > 0;
}

/**
 * Carries the athlete's gym fallbacks onto the next version of a programme: a revision, or a
 * draft approved to continue it. The blueprint a new version is written from holds only the
 * programme's own fallbacks, so each gym's are copied across here as `addGymFallback` adds them,
 * onto every slot of the new version that plans the same exercise, with their machine and rank.
 * A slot the change took out, or gave another exercise, keeps none of them.
 */
export async function carryGymFallbacks(
  db: DbOrTx,
  userId: string,
  versions: { fromProgramId: string; toProgramId: string },
): Promise<void> {
  const [previous, slots] = await Promise.all([
    db
      .select({
        plannedExerciseId: programExercises.exerciseId,
        gymId: programExerciseFallbacks.gymId,
        fallbackExerciseId: programExerciseFallbacks.fallbackExerciseId,
        fallbackEquipmentTypeId: programExerciseFallbacks.fallbackEquipmentTypeId,
        fallbackEquipmentInstanceId: programExerciseFallbacks.fallbackEquipmentInstanceId,
        rank: programExerciseFallbacks.rank,
        notes: programExerciseFallbacks.notes,
      })
      .from(programExerciseFallbacks)
      .innerJoin(
        programExercises,
        eq(programExercises.id, programExerciseFallbacks.programExerciseId),
      )
      .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
      .where(
        and(
          eq(programExerciseFallbacks.userId, userId),
          eq(programDays.programId, versions.fromProgramId),
          isNotNull(programExerciseFallbacks.gymId),
        ),
      )
      .orderBy(asc(programExerciseFallbacks.rank)),
    db
      .select({ id: programExercises.id, exerciseId: programExercises.exerciseId })
      .from(programExercises)
      .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
      .where(
        and(eq(programExercises.userId, userId), eq(programDays.programId, versions.toProgramId)),
      ),
  ]);
  // One of each, however many slots of the old version held it: the first, so its lowest rank.
  const fallbacks = new Map<string, (typeof previous)[number]>();
  for (const row of previous) {
    const key = [
      row.plannedExerciseId,
      row.gymId,
      row.fallbackExerciseId,
      row.fallbackEquipmentInstanceId ?? "",
      row.fallbackEquipmentTypeId ?? "",
    ].join(":");
    if (!fallbacks.has(key)) fallbacks.set(key, row);
  }
  const values = [...fallbacks.values()].flatMap(({ plannedExerciseId, ...fallback }) =>
    slots
      .filter((slot) => slot.exerciseId === plannedExerciseId)
      .map((slot) => ({ ...fallback, userId, programExerciseId: slot.id })),
  );
  if (values.length > 0) await db.insert(programExerciseFallbacks).values(values);
}
