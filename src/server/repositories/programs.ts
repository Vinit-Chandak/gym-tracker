import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  equipmentTypes,
  exercises,
  programDays,
  programExerciseFallbacks,
  programExercises,
  programRuns,
  programs,
  warmupProtocols,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { programEndDate } from "@/domain/program-calendar";
import {
  BLUEPRINT_VERSION,
  blueprintExerciseSlugs,
  prescriptionTypeOf,
  programBlueprintSchema,
  type ProgramBlueprint,
} from "@/domain/program-blueprint";
import {
  resetReferenceCache,
  sharedEquipmentTypes,
  sharedExercises,
  sharedWarmupProtocols,
} from "@/server/queries/reference";

/** Thrown when a blueprint names shared data this database does not have. */
export class MissingReferenceDataError extends Error {
  constructor(what: string) {
    super(`Reference data is missing (${what}). Run \`npm run db:seed\` first.`);
    this.name = "MissingReferenceDataError";
  }
}

function requireId(map: Map<string, string>, slug: string, what: string): string {
  const id = map.get(slug);
  if (!id) throw new MissingReferenceDataError(`${what} "${slug}"`);
  return id;
}

type ReferenceIds = {
  exerciseIdBySlug: Map<string, string>;
  typeIdBySlug: Map<string, string>;
  warmupIdBySlug: Map<string, string>;
};

/**
 * Ids of everything the blueprint names, from the in-memory library. A slug the memory does not
 * know is re-read from the database once before it counts as missing, so a library seeded after
 * this instance started still works.
 */
async function referenceIds(
  db: DbOrTx,
  blueprint: ProgramBlueprint,
  userId: string,
): Promise<ReferenceIds> {
  const read = async (): Promise<ReferenceIds> => {
    const [shared, own, typeRows, warmupRows] = await Promise.all([
      sharedExercises(db),
      db.select().from(exercises).where(eq(exercises.userId, userId)),
      sharedEquipmentTypes(db),
      sharedWarmupProtocols(db),
    ]);
    return {
      exerciseIdBySlug: new Map([...shared, ...own].map((r) => [r.slug, r.id])),
      typeIdBySlug: new Map(typeRows.map((r) => [r.slug, r.id])),
      warmupIdBySlug: new Map(warmupRows.map((r) => [r.slug, r.id])),
    };
  };
  const ids = await read();
  const complete =
    blueprintExerciseSlugs(blueprint).every((slug) => ids.exerciseIdBySlug.has(slug)) &&
    blueprint.days.every(
      (day) =>
        (day.warmupSlug === "" || ids.warmupIdBySlug.has(day.warmupSlug)) &&
        day.exercises.every((exercise) =>
          (exercise.fallbacks ?? []).every(
            (fallback) =>
              !fallback.equipmentTypeSlug || ids.typeIdBySlug.has(fallback.equipmentTypeSlug),
          ),
        ),
    );
  if (complete) return ids;
  resetReferenceCache();
  return read();
}

export type CreateProgramOptions = {
  /** First day of the programme, `YYYY-MM-DD` in the user's time zone. */
  startDate: string;
  /**
   * Slot the programme starts on. A revision of a running programme passes the original's,
   * so the sequence keeps its shape; a fresh programme leaves it out and starts at its first
   * day.
   */
  startDayIndex?: number;
  /**
   * Continue an existing programme lineage instead of starting one. The new row becomes the
   * next version in that family and the previous active version is archived — the path a
   * revised or regenerated plan takes, so logged history keeps pointing at what it prescribed.
   */
  familyId?: string;
  status?: "draft" | "active";
};

export type CreatedProgram = { id: string; familyId: string; version: number };

/**
 * Writes a blueprint out as one user's own programme rows.
 *
 * Everything the blueprint names by slug is looked up in the shared library, so the same
 * function serves a built-in template, an import and a plan generated from training history.
 * Runs inside `withUser`, so RLS decides what it may touch.
 *
 * Every slug is resolved before the first row is written, and each table gets one insert for
 * the whole plan: a missing slug fails before anything exists, and adopting a programme costs a
 * handful of statements rather than one per exercise.
 */
export async function createProgramFromBlueprint(
  db: DbOrTx,
  userId: string,
  blueprint: ProgramBlueprint,
  options: CreateProgramOptions,
): Promise<CreatedProgram> {
  const familyId = options.familyId ?? crypto.randomUUID();
  const [{ exerciseIdBySlug, typeIdBySlug, warmupIdBySlug }, [previous]] = await Promise.all([
    referenceIds(db, blueprint, userId),
    db
      .select({ id: programs.id, version: programs.version })
      .from(programs)
      .where(and(eq(programs.userId, userId), eq(programs.slug, blueprint.slug)))
      .orderBy(desc(programs.version))
      .limit(1),
  ]);
  const version = (previous?.version ?? 0) + 1;
  const status = options.status ?? "active";

  // Resolve every reference first, so a blueprint naming something unknown writes nothing.
  const dayValues = blueprint.days.map((day) => ({
    day,
    warmupProtocolId:
      day.warmupSlug === "" ? null : requireId(warmupIdBySlug, day.warmupSlug, "warm-up protocol"),
    exercises: day.exercises.map((exercise, index) => ({
      exercise,
      orderIndex: index + 1,
      exerciseId: requireId(exerciseIdBySlug, exercise.exerciseSlug, "exercise"),
      fallbacks: (exercise.fallbacks ?? []).map((fallback) => ({
        fallback,
        fallbackExerciseId: requireId(exerciseIdBySlug, fallback.exerciseSlug, "exercise"),
        fallbackEquipmentTypeId: fallback.equipmentTypeSlug
          ? requireId(typeIdBySlug, fallback.equipmentTypeSlug, "equipment type")
          : null,
      })),
    })),
  }));

  if (status === "active") {
    // One active programme at a time: Today, Progress and the coach API all read "the" plan.
    await db
      .update(programs)
      .set({ status: "archived" })
      .where(and(eq(programs.userId, userId), eq(programs.status, "active")));
  }

  const startDayIndex = options.startDayIndex ?? Math.min(...blueprint.days.map((d) => d.dayIndex));
  const [program] = await db
    .insert(programs)
    .values({
      userId,
      familyId,
      slug: blueprint.slug,
      name: blueprint.name,
      version,
      status,
      startDate: options.startDate,
      endDate: programEndDate(options.startDate, blueprint.weeks),
      weeks: blueprint.weeks,
      startDayIndex,
      notes: blueprint.notes,
    })
    .returning({ id: programs.id });
  if (!program) throw new Error("Programme insert returned no row");

  // Rows come back in no guaranteed order, so each is matched by its natural key, not position.
  const dayRows = await db
    .insert(programDays)
    .values(
      dayValues.map(({ day, warmupProtocolId }) => ({
        userId,
        programId: program.id,
        dayIndex: day.dayIndex,
        name: day.name,
        focus: day.focus,
        dayOfWeek: day.dayOfWeek,
        includesLifting: day.includesLifting,
        includesRun: day.includesRun,
        timeNote: day.timeNote,
        effortNote: day.effortNote,
        notes: day.notes,
        warmupProtocolId,
      })),
    )
    .returning({ id: programDays.id, dayIndex: programDays.dayIndex });
  const dayIdByIndex = new Map(dayRows.map((row) => [row.dayIndex, row.id]));
  const dayId = (dayIndex: number): string => {
    const id = dayIdByIndex.get(dayIndex);
    if (!id) throw new Error(`Programme day insert returned no row (day ${dayIndex})`);
    return id;
  };

  const exerciseValues = dayValues.flatMap(({ day, exercises }) =>
    exercises.map(({ exercise, orderIndex, exerciseId }) => ({
      userId,
      programDayId: dayId(day.dayIndex),
      exerciseId,
      orderIndex,
      // A revision carries the slot's lineage over; a fresh plan leaves it for the default.
      lineageId: exercise.lineageId,
      sets: exercise.sets,
      prescriptionType: prescriptionTypeOf(exercise),
      repMin: exercise.reps?.[0] ?? null,
      repMax: exercise.reps?.[1] ?? null,
      durationMinSeconds: exercise.duration?.[0] ?? null,
      durationMaxSeconds: exercise.duration?.[1] ?? null,
      distanceMinMeters: exercise.distance?.[0] ?? null,
      distanceMaxMeters: exercise.distance?.[1] ?? null,
      perSide: exercise.perSide ?? false,
      rirMin: exercise.rir?.[0] ?? null,
      rirMax: exercise.rir?.[1] ?? null,
      restMinSeconds: exercise.rest[0],
      restMaxSeconds: exercise.rest[1],
      targetLoadNote: exercise.targetLoadNote ?? null,
      progressionNotes: exercise.progressionNotes ?? null,
      progressionRule: exercise.progressionRule ?? null,
      keyCue: exercise.keyCue ?? null,
      supersetGroup: exercise.supersetGroup ?? null,
      notes: exercise.notes ?? null,
    })),
  );
  const exerciseRows =
    exerciseValues.length > 0
      ? await db.insert(programExercises).values(exerciseValues).returning({
          id: programExercises.id,
          programDayId: programExercises.programDayId,
          orderIndex: programExercises.orderIndex,
        })
      : [];
  const slotIdByPosition = new Map(
    exerciseRows.map((row) => [`${row.programDayId}:${row.orderIndex}`, row.id]),
  );

  const fallbackValues = dayValues.flatMap(({ day, exercises }) =>
    exercises.flatMap(({ exercise, orderIndex, fallbacks }) =>
      fallbacks.map(({ fallback, fallbackExerciseId, fallbackEquipmentTypeId }) => {
        const programExerciseId = slotIdByPosition.get(`${dayId(day.dayIndex)}:${orderIndex}`);
        if (!programExerciseId) {
          throw new Error(`Programme exercise insert returned no row (${exercise.exerciseSlug})`);
        }
        return {
          userId,
          programExerciseId,
          fallbackExerciseId,
          fallbackEquipmentTypeId,
          rank: fallback.rank,
          notes: fallback.notes ?? null,
        };
      }),
    ),
  );
  if (fallbackValues.length > 0) {
    await db.insert(programExerciseFallbacks).values(fallbackValues);
  }

  if (blueprint.runs.length > 0) {
    await db.insert(programRuns).values(
      blueprint.runs.map((run) => ({
        userId,
        programId: program.id,
        weekIndex: run.weekIndex,
        dayOfWeek: run.dayOfWeek,
        durationMinMinutes: run.duration[0],
        durationMaxMinutes: run.duration[1],
        rpeMin: run.rpe[0],
        rpeMax: run.rpe[1],
        paceNote: run.paceNote,
        progressionNote: run.progressionNote,
        shinRule: run.shinRule,
        comment: run.comment ?? null,
      })),
    );
  }

  return { id: program.id, familyId, version };
}

/**
 * Reads a programme back out as a blueprint, lineage included.
 *
 * This is the inverse of `createProgramFromBlueprint`, and it exists so a revision is one
 * round trip through the same validated document the app already understands: read, patch,
 * write the next version. Everything is named by slug again, so nothing in the patch has to
 * know a database id.
 */
export async function readProgramBlueprint(
  db: DbOrTx,
  userId: string,
  programId: string,
): Promise<{ blueprint: ProgramBlueprint; startDayIndex: number } | null> {
  const [program] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.userId, userId)))
    .limit(1);
  if (!program) return null;
  const days = await db
    .select({ day: programDays, warmupSlug: warmupProtocols.slug })
    .from(programDays)
    .leftJoin(warmupProtocols, eq(warmupProtocols.id, programDays.warmupProtocolId))
    .where(eq(programDays.programId, programId))
    .orderBy(asc(programDays.dayIndex));
  const dayIds = days.map((row) => row.day.id);
  const [slots, runRows] = await Promise.all([
    dayIds.length
      ? db
          .select({ slot: programExercises, slug: exercises.slug })
          .from(programExercises)
          .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
          .where(inArray(programExercises.programDayId, dayIds))
          .orderBy(asc(programExercises.orderIndex))
      : Promise.resolve([]),
    db
      .select()
      .from(programRuns)
      .where(eq(programRuns.programId, programId))
      .orderBy(asc(programRuns.weekIndex), asc(programRuns.dayOfWeek)),
  ]);
  const slotIds = slots.map((row) => row.slot.id);
  const fallbacks = slotIds.length
    ? await db
        .select({
          fallback: programExerciseFallbacks,
          slug: exercises.slug,
          typeSlug: equipmentTypes.slug,
        })
        .from(programExerciseFallbacks)
        .innerJoin(exercises, eq(exercises.id, programExerciseFallbacks.fallbackExerciseId))
        .leftJoin(
          equipmentTypes,
          eq(equipmentTypes.id, programExerciseFallbacks.fallbackEquipmentTypeId),
        )
        .where(inArray(programExerciseFallbacks.programExerciseId, slotIds))
        .orderBy(asc(programExerciseFallbacks.rank))
    : [];

  const blueprint = programBlueprintSchema.parse({
    blueprintVersion: BLUEPRINT_VERSION,
    slug: program.slug,
    name: program.name,
    weeks: program.weeks ?? 8,
    notes: program.notes ?? "",
    days: days.map(({ day, warmupSlug }) => ({
      dayIndex: day.dayIndex,
      dayOfWeek: day.dayOfWeek ?? 1,
      name: day.name,
      focus: day.focus ?? "",
      timeNote: day.timeNote ?? "",
      effortNote: day.effortNote ?? "",
      notes: day.notes ?? "",
      includesLifting: day.includesLifting,
      includesRun: day.includesRun,
      warmupSlug: warmupSlug ?? "",
      exercises: slots
        .filter((row) => row.slot.programDayId === day.id)
        .map(({ slot, slug }) => ({
          exerciseSlug: slug,
          lineageId: slot.lineageId,
          sets: slot.sets,
          reps:
            slot.prescriptionType === "reps" && slot.repMin !== null && slot.repMax !== null
              ? [slot.repMin, slot.repMax]
              : undefined,
          duration:
            slot.prescriptionType === "duration" &&
            slot.durationMinSeconds !== null &&
            slot.durationMaxSeconds !== null
              ? [slot.durationMinSeconds, slot.durationMaxSeconds]
              : undefined,
          distance:
            slot.prescriptionType === "distance" &&
            slot.distanceMinMeters !== null &&
            slot.distanceMaxMeters !== null
              ? [slot.distanceMinMeters, slot.distanceMaxMeters]
              : undefined,
          perSide: slot.perSide,
          rir: slot.rirMin === null || slot.rirMax === null ? null : [slot.rirMin, slot.rirMax],
          rest: [slot.restMinSeconds ?? 0, slot.restMaxSeconds ?? slot.restMinSeconds ?? 0],
          targetLoadNote: slot.targetLoadNote ?? undefined,
          progressionNotes: slot.progressionNotes ?? undefined,
          progressionRule: slot.progressionRule ?? undefined,
          keyCue: slot.keyCue ?? undefined,
          supersetGroup: slot.supersetGroup ?? undefined,
          notes: slot.notes ?? undefined,
          fallbacks: fallbacks
            .filter((row) => row.fallback.programExerciseId === slot.id)
            .map((row) => ({
              exerciseSlug: row.slug,
              equipmentTypeSlug: row.typeSlug ?? undefined,
              rank: row.fallback.rank,
              notes: row.fallback.notes ?? undefined,
            })),
        })),
    })),
    runs: runRows.map((run) => ({
      weekIndex: run.weekIndex,
      dayOfWeek: run.dayOfWeek,
      duration: [run.durationMinMinutes, run.durationMaxMinutes],
      rpe: [run.rpeMin ?? 0, run.rpeMax ?? run.rpeMin ?? 0],
      paceNote: run.paceNote ?? "",
      progressionNote: run.progressionNote ?? "",
      shinRule: run.shinRule ?? "",
      comment: run.comment ?? undefined,
    })),
  });
  return { blueprint, startDayIndex: program.startDayIndex };
}

/** The user's active programme, if they have one. */
export async function getActiveProgram(
  db: DbOrTx,
  userId: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  const [program] = await db
    .select({ id: programs.id, slug: programs.slug, name: programs.name })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  return program ?? null;
}
