import { and, desc, eq } from "drizzle-orm";

import {
  programDays,
  programExerciseFallbacks,
  programExercises,
  programRuns,
  programs,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { programEndDate } from "@/domain/program-calendar";
import {
  blueprintExerciseSlugs,
  prescriptionTypeOf,
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
async function referenceIds(db: DbOrTx, blueprint: ProgramBlueprint): Promise<ReferenceIds> {
  const read = async (): Promise<ReferenceIds> => {
    const [exerciseRows, typeRows, warmupRows] = await Promise.all([
      sharedExercises(db),
      sharedEquipmentTypes(db),
      sharedWarmupProtocols(db),
    ]);
    return {
      exerciseIdBySlug: new Map(exerciseRows.map((r) => [r.slug, r.id])),
      typeIdBySlug: new Map(typeRows.map((r) => [r.slug, r.id])),
      warmupIdBySlug: new Map(warmupRows.map((r) => [r.slug, r.id])),
    };
  };
  const ids = await read();
  const complete =
    blueprintExerciseSlugs(blueprint).every((slug) => ids.exerciseIdBySlug.has(slug)) &&
    blueprint.days.every(
      (day) =>
        ids.warmupIdBySlug.has(day.warmupSlug) &&
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
    referenceIds(db, blueprint),
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
    warmupProtocolId: requireId(warmupIdBySlug, day.warmupSlug, "warm-up protocol"),
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

  const startDayIndex = Math.min(...blueprint.days.map((d) => d.dayIndex));
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
      sets: exercise.sets,
      prescriptionType: prescriptionTypeOf(exercise),
      repMin: exercise.reps?.[0] ?? null,
      repMax: exercise.reps?.[1] ?? null,
      durationMinSeconds: exercise.duration?.[0] ?? null,
      durationMaxSeconds: exercise.duration?.[1] ?? null,
      perSide: exercise.perSide ?? false,
      rirMin: exercise.rir[0],
      rirMax: exercise.rir[1],
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
