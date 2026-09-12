import { and, eq, inArray, isNotNull, max } from "drizzle-orm";

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
 * Adds a gym-specific fallback to every active-programme slot that uses the exercise.
 * Returns how many slots were updated (0 when the exercise is not in the programme).
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

  const ranks = await db
    .select({
      programExerciseId: programExerciseFallbacks.programExerciseId,
      maxRank: max(programExerciseFallbacks.rank),
    })
    .from(programExerciseFallbacks)
    .where(inArray(programExerciseFallbacks.programExerciseId, slotIds))
    .groupBy(programExerciseFallbacks.programExerciseId);
  const maxRankBySlot = new Map(ranks.map((row) => [row.programExerciseId, row.maxRank ?? 0]));

  await db.insert(programExerciseFallbacks).values(
    slotIds.map((programExerciseId) => ({
      userId,
      programExerciseId,
      gymId: input.gymId,
      fallbackExerciseId: input.fallbackExerciseId,
      fallbackEquipmentInstanceId: input.fallbackEquipmentInstanceId,
      rank: (maxRankBySlot.get(programExerciseId) ?? 0) + 1,
    })),
  );
  return slotIds.length;
}

/** Removes one gym-specific fallback. Programme-level fallbacks (no gym) are left alone. */
export async function removeGymFallback(
  db: DbOrTx,
  userId: string,
  fallbackId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(programExerciseFallbacks)
    .where(
      and(
        eq(programExerciseFallbacks.id, fallbackId),
        eq(programExerciseFallbacks.userId, userId),
        isNotNull(programExerciseFallbacks.gymId),
      ),
    )
    .returning({ id: programExerciseFallbacks.id });
  return deleted.length > 0;
}
