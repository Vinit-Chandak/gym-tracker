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
import { sharedExercises } from "@/server/queries/reference";

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
  | "defaultPrescriptionType"
  | "defaultRepMin"
  | "defaultRepMax"
  | "defaultDurationMinSeconds"
  | "defaultDurationMaxSeconds"
  | "defaultDistanceMinMeters"
  | "defaultDistanceMaxMeters"
  | "defaultRir"
  | "defaultRestSeconds"
  | "rirNote"
> & { isCustom: boolean };

function toListItem(row: ExerciseRow): ExerciseListItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    modality: row.modality,
    movementPattern: row.movementPattern,
    primaryMuscles: row.primaryMuscles,
    secondaryMuscles: row.secondaryMuscles,
    loadPortability: row.loadPortability,
    requiresEquipment: row.requiresEquipment,
    isActive: row.isActive,
    defaultPrescriptionType: row.defaultPrescriptionType,
    defaultRepMin: row.defaultRepMin,
    defaultRepMax: row.defaultRepMax,
    defaultDurationMinSeconds: row.defaultDurationMinSeconds,
    defaultDurationMaxSeconds: row.defaultDurationMaxSeconds,
    defaultDistanceMinMeters: row.defaultDistanceMinMeters,
    defaultDistanceMaxMeters: row.defaultDistanceMaxMeters,
    defaultRir: row.defaultRir,
    defaultRestSeconds: row.defaultRestSeconds,
    rirNote: row.rirNote,
    isCustom: row.userId !== null,
  };
}

/**
 * Every exercise the user can see, by name: the shared library (served from memory) plus their
 * own, which Row Level Security limits to the signed-in account.
 */
export async function listExercises(db: DbOrTx): Promise<ExerciseListItem[]> {
  const [shared, own] = await Promise.all([
    sharedExercises(db),
    db.select().from(exercises).where(isNotNull(exercises.userId)).orderBy(asc(exercises.name)),
  ]);
  const items = shared.map(toListItem);
  for (const row of own) {
    const item = toListItem(row);
    const at = items.findIndex((other) => other.name.localeCompare(item.name) > 0);
    items.splice(at === -1 ? items.length : at, 0, item);
  }
  return items;
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
  distanceMinMeters: number | null;
  distanceMaxMeters: number | null;
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
  // Three independent reads, keyed by the exercise alone.
  const [[row], equipmentOptions, programUsage] = await Promise.all([
    db.select().from(exercises).where(eq(exercises.id, exerciseId)).limit(1),
    db
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
      .orderBy(asc(exerciseEquipmentOptions.preferenceRank)),
    db
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
        distanceMinMeters: programExercises.distanceMinMeters,
        distanceMaxMeters: programExercises.distanceMaxMeters,
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
      .orderBy(asc(programDays.dayIndex), asc(programExercises.orderIndex)),
  ]);
  if (!row) return null;

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
