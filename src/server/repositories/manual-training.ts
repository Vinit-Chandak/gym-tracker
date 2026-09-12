import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  equipmentInstances,
  exerciseEquipmentOptions,
  exercises,
  programExercises,
  savedRoutines,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { blueprintDaySchema, blueprintExerciseSchema } from "@/domain/program-blueprint";
import type { SavedRoutineDay } from "@/domain/saved-routine";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_MODALITIES,
  MUSCLE_GROUPS,
  PRESCRIPTION_TYPES,
} from "@/domain/types";
import { assertNoOpenWorkout, CoachingError } from "./coaching-state";
import { libraryAtGym } from "./coach-plans";
import { startAdHocSession } from "./sessions";

export const customExerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(EXERCISE_CATEGORIES),
  modality: z.enum(EXERCISE_MODALITIES),
  measurement: z.enum(PRESCRIPTION_TYPES),
  primaryMuscles: z.array(z.enum(MUSCLE_GROUPS)).max(20),
  equipmentInstanceId: z.uuid().nullable(),
  notes: z.string().trim().max(2000).default(""),
});
export async function createCustomExercise(db: DbOrTx, userId: string, input: unknown) {
  const value = customExerciseSchema.parse(input);
  const needsMachine = ["machine", "smith_machine", "cable", "cardio"].includes(value.modality);
  if (needsMachine && !value.equipmentInstanceId)
    throw new CoachingError("Choose the registered equipment for this exercise.", 422);
  if (value.equipmentInstanceId) {
    const [machine] = await db
      .select()
      .from(equipmentInstances)
      .where(
        and(
          eq(equipmentInstances.id, value.equipmentInstanceId),
          eq(equipmentInstances.userId, userId),
          eq(equipmentInstances.isActive, true),
        ),
      );
    if (!machine) throw new CoachingError("Choose your own active equipment.", 422);
  }
  const [exercise] = await db
    .insert(exercises)
    .values({
      userId,
      slug: `custom-${crypto.randomUUID()}`,
      name: value.name,
      category: value.category,
      modality: value.modality,
      movementPattern: "user-defined",
      primaryMuscles: value.primaryMuscles,
      defaultPrescriptionType: value.measurement,
      requiresEquipment: !["bodyweight", "mobility"].includes(value.modality),
      loadPortability: needsMachine ? "equipment_specific" : "global",
      formNotes: value.notes,
    })
    .returning();
  if (value.equipmentInstanceId)
    await db
      .insert(exerciseEquipmentOptions)
      .values({ userId, exerciseId: exercise!.id, equipmentInstanceId: value.equipmentInstanceId });
  return exercise!;
}
export async function listSavedRoutines(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(savedRoutines)
    .where(eq(savedRoutines.userId, userId))
    .orderBy(desc(savedRoutines.updatedAt));
}
export async function saveRoutine(db: DbOrTx, userId: string, name: string, input: unknown) {
  const day = blueprintDaySchema.parse(input);
  const title = z.string().trim().min(1).max(120).parse(name);
  if (!day.exercises.length)
    throw new CoachingError("Add at least one exercise to save this routine.", 422);
  const slugs = day.exercises.map((e) => e.exerciseSlug);
  const visible = await db
    .select({ slug: exercises.slug })
    .from(exercises)
    .where(
      and(
        inArray(exercises.slug, slugs),
        eq(exercises.isActive, true),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    );
  if (slugs.some((slug) => !visible.some((e) => e.slug === slug)))
    throw new CoachingError("An exercise in this routine is unavailable.", 422);
  const [routine] = await db.insert(savedRoutines).values({ userId, name: title, day }).returning();
  return routine!;
}
export async function startSavedRoutine(db: DbOrTx, userId: string, id: string, gymId: string) {
  await assertNoOpenWorkout(db, userId);
  const [routine] = await db
    .select()
    .from(savedRoutines)
    .where(and(eq(savedRoutines.id, id), eq(savedRoutines.userId, userId)));
  if (!routine) throw new CoachingError("Routine not found.", 404);
  const candidates = await libraryAtGym(db, userId, gymId);
  const chosen = routine.day.exercises.map((entry) => ({
    entry,
    exercise: candidates.find((e) => e.slug === entry.exerciseSlug),
  }));
  if (chosen.some((e) => !e.exercise?.available))
    throw new CoachingError(
      "An exercise is not available at this gym. Update its equipment or choose another gym before starting.",
      422,
    );
  const session = await startAdHocSession(db, userId, { gymId });
  await db.insert(workoutExercises).values(
    chosen.map(({ entry, exercise }, i) => ({
      userId,
      workoutSessionId: session.sessionId,
      exerciseId: exercise!.id,
      equipmentInstanceId: exercise!.machine?.id ?? null,
      orderIndex: i + 1,
      supersetGroup: "supersetGroup" in entry ? (entry.supersetGroup ?? null) : null,
      savedPrescription: "sets" in entry ? entry : null,
      notes: entry.notes ?? null,
    })),
  );
  return session;
}
/** Copies targets and exercise order, never completed set logs or schedule completion. */
export async function routineFromWorkout(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  name: string,
) {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.id, sessionId)));
  if (!session?.completedAt)
    throw new CoachingError("Choose a completed workout to save or repeat.", 422);
  const rows = await db
    .select({ row: workoutExercises, exercise: exercises, planned: programExercises })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(programExercises, eq(programExercises.id, workoutExercises.plannedProgramExerciseId))
    .where(
      and(
        eq(workoutExercises.userId, userId),
        eq(workoutExercises.workoutSessionId, sessionId),
        isNull(workoutExercises.skippedAt),
      ),
    )
    .orderBy(asc(workoutExercises.orderIndex));
  const entries = rows.map(({ row, exercise, planned }) => {
    if (row.savedPrescription) return row.savedPrescription;
    if (!planned || planned.restMinSeconds === null || planned.restMaxSeconds === null)
      return { exerciseSlug: exercise.slug, notes: row.notes ?? undefined };
    const measure = planned.prescriptionType;
    const target =
      measure === "duration"
        ? [planned.durationMinSeconds, planned.durationMaxSeconds]
        : measure === "distance"
          ? [planned.distanceMinMeters, planned.distanceMaxMeters]
          : [planned.repMin, planned.repMax];
    if (target.some((value) => value === null))
      return { exerciseSlug: exercise.slug, notes: row.notes ?? undefined };
    return blueprintExerciseSchema.parse({
      exerciseSlug: exercise.slug,
      sets: planned.sets,
      [measure === "duration" ? "duration" : measure === "distance" ? "distance" : "reps"]: target,
      rir:
        planned.rirMin === null || planned.rirMax === null
          ? null
          : [planned.rirMin, planned.rirMax],
      rest: [planned.restMinSeconds, planned.restMaxSeconds],
      supersetGroup: row.supersetGroup ?? undefined,
      notes: row.notes ?? undefined,
    });
  });
  if (!entries.length)
    throw new CoachingError("This workout has no performed exercises to save.", 422);
  const title = z.string().trim().min(1).max(120).parse(name);
  const day: SavedRoutineDay = {
    dayIndex: 1,
    dayOfWeek: 1,
    name: title,
    focus: "Saved workout",
    timeNote: "",
    effortNote: "",
    notes:
      "Copied exercise order and any known targets. Completed set logs remain in the original workout.",
    includesLifting: true,
    includesRun: false,
    warmupSlug: "none",
    exercises: entries,
  };
  const [routine] = await db.insert(savedRoutines).values({ userId, name: title, day }).returning();
  return routine!;
}
