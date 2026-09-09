import { and, desc, eq, inArray } from "drizzle-orm";

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
  blueprintExerciseSlugs,
  prescriptionTypeOf,
  type ProgramBlueprint,
} from "@/domain/program-blueprint";

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
 */
export async function createProgramFromBlueprint(
  db: DbOrTx,
  userId: string,
  blueprint: ProgramBlueprint,
  options: CreateProgramOptions,
): Promise<CreatedProgram> {
  const exerciseRows = await db
    .select({ id: exercises.id, slug: exercises.slug })
    .from(exercises)
    .where(inArray(exercises.slug, blueprintExerciseSlugs(blueprint)));
  const exerciseIdBySlug = new Map(exerciseRows.map((r) => [r.slug, r.id]));
  const typeRows = await db
    .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
    .from(equipmentTypes);
  const typeIdBySlug = new Map(typeRows.map((r) => [r.slug, r.id]));
  const warmupRows = await db
    .select({ id: warmupProtocols.id, slug: warmupProtocols.slug })
    .from(warmupProtocols);
  const warmupIdBySlug = new Map(warmupRows.map((r) => [r.slug, r.id]));

  const familyId = options.familyId ?? crypto.randomUUID();
  const [previous] = await db
    .select({ id: programs.id, version: programs.version })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.slug, blueprint.slug)))
    .orderBy(desc(programs.version))
    .limit(1);
  const version = (previous?.version ?? 0) + 1;
  const status = options.status ?? "active";

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

  for (const day of blueprint.days) {
    const [dayRow] = await db
      .insert(programDays)
      .values({
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
        warmupProtocolId: requireId(warmupIdBySlug, day.warmupSlug, "warm-up protocol"),
      })
      .returning({ id: programDays.id });
    if (!dayRow) throw new Error(`Programme day insert returned no row (${day.name})`);

    for (const [index, exercise] of day.exercises.entries()) {
      const [exerciseRow] = await db
        .insert(programExercises)
        .values({
          userId,
          programDayId: dayRow.id,
          exerciseId: requireId(exerciseIdBySlug, exercise.exerciseSlug, "exercise"),
          orderIndex: index + 1,
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
        })
        .returning({ id: programExercises.id });
      if (!exerciseRow) {
        throw new Error(`Programme exercise insert returned no row (${exercise.exerciseSlug})`);
      }

      if (exercise.fallbacks && exercise.fallbacks.length > 0) {
        await db.insert(programExerciseFallbacks).values(
          exercise.fallbacks.map((fallback) => ({
            userId,
            programExerciseId: exerciseRow.id,
            fallbackExerciseId: requireId(exerciseIdBySlug, fallback.exerciseSlug, "exercise"),
            fallbackEquipmentTypeId: fallback.equipmentTypeSlug
              ? requireId(typeIdBySlug, fallback.equipmentTypeSlug, "equipment type")
              : null,
            rank: fallback.rank,
            notes: fallback.notes ?? null,
          })),
        );
      }
    }
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
