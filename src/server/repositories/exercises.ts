import { and, asc, eq, inArray, isNull, isNotNull } from "drizzle-orm";

import {
  equipmentInstances,
  equipmentTypes,
  exerciseEquipmentOptions,
  exercises,
  programDays,
  programExercises,
  programs,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";

type ExerciseRow = typeof exercises.$inferSelect;

export type ExerciseListItem = Pick<
  ExerciseRow,
  | "id"
  | "slug"
  | "name"
  | "category"
  | "modality"
  | "movementPattern"
  | "primaryMuscles"
  | "secondaryMuscles"
  | "loadPortability"
  | "requiresEquipment"
  | "isActive"
  | "defaultRepMin"
  | "defaultRepMax"
  | "defaultRir"
  | "defaultRestSeconds"
> & { isCustom: boolean };

/** Every exercise the user can see: the shared library plus their own, by name. */
export async function listExercises(db: DbOrTx): Promise<ExerciseListItem[]> {
  const rows = await db
    .select({
      id: exercises.id,
      slug: exercises.slug,
      name: exercises.name,
      category: exercises.category,
      modality: exercises.modality,
      movementPattern: exercises.movementPattern,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      loadPortability: exercises.loadPortability,
      requiresEquipment: exercises.requiresEquipment,
      isActive: exercises.isActive,
      defaultRepMin: exercises.defaultRepMin,
      defaultRepMax: exercises.defaultRepMax,
      defaultRir: exercises.defaultRir,
      defaultRestSeconds: exercises.defaultRestSeconds,
      userId: exercises.userId,
    })
    .from(exercises)
    .orderBy(asc(exercises.name));
  return rows.map(({ userId, ...rest }) => ({ ...rest, isCustom: userId !== null }));
}

export type ExerciseEquipmentOption = {
  equipmentTypeId: string;
  typeName: string;
  typeSlug: string;
  preferenceRank: number;
};

export type ExerciseProgramUsage = {
  programExerciseId: string;
  dayIndex: number;
  dayName: string;
  sets: number;
  prescriptionType: typeof programExercises.$inferSelect.prescriptionType;
  repMin: number | null;
  repMax: number | null;
  durationMinSeconds: number | null;
  durationMaxSeconds: number | null;
  perSide: boolean;
  rirMin: number | null;
  rirMax: number | null;
  restMinSeconds: number | null;
  restMaxSeconds: number | null;
  targetLoadNote: string | null;
  progressionNotes: string | null;
  keyCue: string | null;
};

export type ExerciseDetail = ExerciseRow & {
  isCustom: boolean;
  equipmentOptions: ExerciseEquipmentOption[];
  programUsage: ExerciseProgramUsage[];
};

export async function getExercise(
  db: DbOrTx,
  userId: string,
  exerciseId: string,
): Promise<ExerciseDetail | null> {
  const [row] = await db.select().from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  if (!row) return null;

  const equipmentOptions = await db
    .select({
      equipmentTypeId: equipmentTypes.id,
      typeName: equipmentTypes.name,
      typeSlug: equipmentTypes.slug,
      preferenceRank: exerciseEquipmentOptions.preferenceRank,
    })
    .from(exerciseEquipmentOptions)
    .innerJoin(equipmentTypes, eq(equipmentTypes.id, exerciseEquipmentOptions.equipmentTypeId))
    .where(
      and(
        eq(exerciseEquipmentOptions.exerciseId, exerciseId),
        isNull(exerciseEquipmentOptions.userId),
      ),
    )
    .orderBy(asc(exerciseEquipmentOptions.preferenceRank));

  const programUsage = await db
    .select({
      programExerciseId: programExercises.id,
      dayIndex: programDays.dayIndex,
      dayName: programDays.name,
      sets: programExercises.sets,
      prescriptionType: programExercises.prescriptionType,
      repMin: programExercises.repMin,
      repMax: programExercises.repMax,
      durationMinSeconds: programExercises.durationMinSeconds,
      durationMaxSeconds: programExercises.durationMaxSeconds,
      perSide: programExercises.perSide,
      rirMin: programExercises.rirMin,
      rirMax: programExercises.rirMax,
      restMinSeconds: programExercises.restMinSeconds,
      restMaxSeconds: programExercises.restMaxSeconds,
      targetLoadNote: programExercises.targetLoadNote,
      progressionNotes: programExercises.progressionNotes,
      keyCue: programExercises.keyCue,
    })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .innerJoin(programs, eq(programs.id, programDays.programId))
    .where(
      and(
        eq(programExercises.exerciseId, exerciseId),
        eq(programs.userId, userId),
        eq(programs.status, "active"),
      ),
    )
    .orderBy(asc(programDays.dayIndex), asc(programExercises.orderIndex));

  return { ...row, isCustom: row.userId !== null, equipmentOptions, programUsage };
}

export type PreferredMachine = { equipmentInstanceId: string; gymId: string; instanceName: string };

/** The user's "use this machine for this exercise" choices, one per gym at most. */
export async function listPreferredMachines(
  db: DbOrTx,
  userId: string,
  exerciseId: string,
): Promise<PreferredMachine[]> {
  return db
    .select({
      equipmentInstanceId: equipmentInstances.id,
      gymId: equipmentInstances.gymId,
      instanceName: equipmentInstances.name,
    })
    .from(exerciseEquipmentOptions)
    .innerJoin(
      equipmentInstances,
      eq(equipmentInstances.id, exerciseEquipmentOptions.equipmentInstanceId),
    )
    .where(
      and(
        eq(exerciseEquipmentOptions.userId, userId),
        eq(exerciseEquipmentOptions.exerciseId, exerciseId),
        isNotNull(exerciseEquipmentOptions.equipmentInstanceId),
      ),
    );
}

export class MachineNotAtGymError extends Error {
  constructor() {
    super("That machine is not registered at this gym.");
    this.name = "MachineNotAtGymError";
  }
}

/** Sets (or clears, with null) the preferred machine for an exercise at one gym. */
export async function setPreferredMachine(
  db: DbOrTx,
  userId: string,
  exerciseId: string,
  gymId: string,
  equipmentInstanceId: string | null,
): Promise<void> {
  const gymInstances = await db
    .select({ id: equipmentInstances.id })
    .from(equipmentInstances)
    .where(and(eq(equipmentInstances.gymId, gymId), eq(equipmentInstances.userId, userId)));
  const gymInstanceIds = gymInstances.map((row) => row.id);
  if (equipmentInstanceId !== null && !gymInstanceIds.includes(equipmentInstanceId)) {
    throw new MachineNotAtGymError();
  }
  if (gymInstanceIds.length > 0) {
    await db
      .delete(exerciseEquipmentOptions)
      .where(
        and(
          eq(exerciseEquipmentOptions.userId, userId),
          eq(exerciseEquipmentOptions.exerciseId, exerciseId),
          inArray(exerciseEquipmentOptions.equipmentInstanceId, gymInstanceIds),
        ),
      );
  }
  if (equipmentInstanceId !== null) {
    await db.insert(exerciseEquipmentOptions).values({
      userId,
      exerciseId,
      equipmentInstanceId,
      preferenceRank: 0,
      notes: "Preferred machine at this gym",
    });
  }
}
