import { and, desc, eq, inArray } from "drizzle-orm";

import { programEndDate } from "../../domain/program-calendar";
import {
  equipmentInstances,
  equipmentTypes,
  exercises,
  gymAbsentEquipmentTypes,
  gyms,
  profiles,
  programDays,
  programExerciseFallbacks,
  programExercises,
  programRuns,
  programs,
  warmupProtocols,
} from "../schema";
import type { DbOrTx } from "../types";
import {
  ANYTIME_FITNESS_ABSENT_EQUIPMENT,
  ANYTIME_FITNESS_EQUIPMENT,
  STARTER_GYMS,
} from "./data/gyms";
import { PROGRAM, type ProgramSeed } from "./data/program";

export type StarterUser = { id: string; email?: string | null };

export type StarterSeedSummary = {
  profileCreated: boolean;
  gymsCreated: number;
  equipmentCreated: number;
  programCreated: boolean;
  programId: string;
};

/** Thrown when the shared reference data has not been seeded yet. */
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

/**
 * Creates a user's starter data: profile, gyms, Anytime Fitness equipment and their copy of
 * the 8-week programme. Idempotent: existing rows are left untouched. Can run inside
 * `withUser` (RLS applies) or as the migration role from the CLI.
 */
export async function seedUserStarterData(
  db: DbOrTx,
  user: StarterUser,
): Promise<StarterSeedSummary> {
  const insertedProfiles = await db
    .insert(profiles)
    .values({ id: user.id, email: user.email ?? null })
    .onConflictDoNothing({ target: profiles.id })
    .returning({ id: profiles.id });
  const profileCreated = insertedProfiles.length > 0;

  const existingGyms = await db
    .select({ slug: gyms.slug, isDefault: gyms.isDefault })
    .from(gyms)
    .where(eq(gyms.userId, user.id));
  const hasDefault = existingGyms.some((g) => g.isDefault);
  const missingGyms = STARTER_GYMS.filter((g) => !existingGyms.some((e) => e.slug === g.slug));
  if (missingGyms.length > 0) {
    await db.insert(gyms).values(
      missingGyms.map((g) => ({
        userId: user.id,
        name: g.name,
        slug: g.slug,
        kind: g.kind,
        notes: g.notes ?? null,
        isDefault: !hasDefault && g.isDefault === true,
      })),
    );
  }
  const gymRows = await db
    .select({ id: gyms.id, slug: gyms.slug })
    .from(gyms)
    .where(eq(gyms.userId, user.id));
  const gymIdBySlug = new Map(gymRows.map((g) => [g.slug, g.id]));

  let equipmentCreated = 0;
  const anytimeFitnessId = gymIdBySlug.get("anytime-fitness");
  if (anytimeFitnessId) {
    const typeRows = await db
      .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
      .from(equipmentTypes);
    const typeIdBySlug = new Map(typeRows.map((r) => [r.slug, r.id]));
    const existing = await db
      .select({ name: equipmentInstances.name })
      .from(equipmentInstances)
      .where(eq(equipmentInstances.gymId, anytimeFitnessId));
    const existingNames = new Set(existing.map((e) => e.name));
    const rows = ANYTIME_FITNESS_EQUIPMENT.filter((e) => !existingNames.has(e.name)).map((e) => ({
      userId: user.id,
      gymId: anytimeFitnessId,
      equipmentTypeId: requireId(typeIdBySlug, e.equipmentTypeSlug, "equipment type"),
      name: e.name,
      resistanceMode: e.resistanceMode,
      unit: e.unit ?? ("kg" as const),
      loadIncrement: e.loadIncrement ?? null,
      notes: e.notes ?? null,
    }));
    if (rows.length > 0) {
      await db.insert(equipmentInstances).values(rows);
      equipmentCreated = rows.length;
    }
    await db
      .insert(gymAbsentEquipmentTypes)
      .values(
        ANYTIME_FITNESS_ABSENT_EQUIPMENT.map((slug) => ({
          userId: user.id,
          gymId: anytimeFitnessId,
          equipmentTypeId: requireId(typeIdBySlug, slug, "equipment type"),
        })),
      )
      .onConflictDoNothing({
        target: [gymAbsentEquipmentTypes.gymId, gymAbsentEquipmentTypes.equipmentTypeId],
      });
  }

  const existingProgram = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, user.id), eq(programs.slug, PROGRAM.slug)))
    .orderBy(desc(programs.version))
    .limit(1);
  if (existingProgram[0]) {
    return {
      profileCreated,
      gymsCreated: missingGyms.length,
      equipmentCreated,
      programCreated: false,
      programId: existingProgram[0].id,
    };
  }

  const programId = await createProgramFromSeed(db, user.id, PROGRAM);
  return {
    profileCreated,
    gymsCreated: missingGyms.length,
    equipmentCreated,
    programCreated: true,
    programId,
  };
}

async function createProgramFromSeed(
  db: DbOrTx,
  userId: string,
  seed: ProgramSeed,
): Promise<string> {
  const exerciseSlugs = [
    ...new Set(
      seed.days.flatMap((d) =>
        d.exercises.flatMap((e) => [
          e.exerciseSlug,
          ...(e.fallbacks ?? []).map((f) => f.exerciseSlug),
        ]),
      ),
    ),
  ];
  const exerciseRows = await db
    .select({ id: exercises.id, slug: exercises.slug })
    .from(exercises)
    .where(inArray(exercises.slug, exerciseSlugs));
  const exerciseIdBySlug = new Map(exerciseRows.map((r) => [r.slug, r.id]));
  const typeRows = await db
    .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
    .from(equipmentTypes);
  const typeIdBySlug = new Map(typeRows.map((r) => [r.slug, r.id]));
  const warmupRows = await db
    .select({ id: warmupProtocols.id, slug: warmupProtocols.slug })
    .from(warmupProtocols);
  const warmupIdBySlug = new Map(warmupRows.map((r) => [r.slug, r.id]));

  const familyId = crypto.randomUUID();
  // Start the full sequence at Lower A; the start date does not skip earlier day slots.
  const startDayIndex = Math.min(...seed.days.map((d) => d.dayIndex));
  const [program] = await db
    .insert(programs)
    .values({
      id: familyId,
      userId,
      familyId,
      slug: seed.slug,
      name: seed.name,
      version: 1,
      status: "active",
      startDate: seed.startDate,
      endDate: programEndDate(seed.startDate, seed.weeks),
      weeks: seed.weeks,
      startDayIndex,
      notes: seed.notes,
    })
    .returning({ id: programs.id });
  if (!program) throw new Error("Programme insert returned no row");

  for (const day of seed.days) {
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

    for (const [index, ex] of day.exercises.entries()) {
      const [exerciseRow] = await db
        .insert(programExercises)
        .values({
          userId,
          programDayId: dayRow.id,
          exerciseId: requireId(exerciseIdBySlug, ex.exerciseSlug, "exercise"),
          orderIndex: index + 1,
          sets: ex.sets,
          prescriptionType: ex.duration ? "duration" : "reps",
          repMin: ex.reps?.[0] ?? null,
          repMax: ex.reps?.[1] ?? null,
          durationMinSeconds: ex.duration?.[0] ?? null,
          durationMaxSeconds: ex.duration?.[1] ?? null,
          perSide: ex.perSide ?? false,
          rirMin: ex.rir[0],
          rirMax: ex.rir[1],
          restMinSeconds: ex.rest[0],
          restMaxSeconds: ex.rest[1],
          targetLoadNote: ex.targetLoadNote ?? null,
          progressionNotes: ex.progressionNotes ?? null,
          progressionRule: ex.progressionRule ?? null,
          keyCue: ex.keyCue ?? null,
          supersetGroup: ex.supersetGroup ?? null,
          notes: ex.notes ?? null,
        })
        .returning({ id: programExercises.id });
      if (!exerciseRow)
        throw new Error(`Programme exercise insert returned no row (${ex.exerciseSlug})`);

      if (ex.fallbacks && ex.fallbacks.length > 0) {
        await db.insert(programExerciseFallbacks).values(
          ex.fallbacks.map((f) => ({
            userId,
            programExerciseId: exerciseRow.id,
            fallbackExerciseId: requireId(exerciseIdBySlug, f.exerciseSlug, "exercise"),
            fallbackEquipmentTypeId: f.equipmentTypeSlug
              ? requireId(typeIdBySlug, f.equipmentTypeSlug, "equipment type")
              : null,
            rank: f.rank,
            notes: f.notes ?? null,
          })),
        );
      }
    }
  }

  await db.insert(programRuns).values(
    seed.runs.map((r) => ({
      userId,
      programId: program.id,
      weekIndex: r.weekIndex,
      dayOfWeek: r.dayOfWeek,
      durationMinMinutes: r.duration[0],
      durationMaxMinutes: r.duration[1],
      rpeMin: r.rpe[0],
      rpeMax: r.rpe[1],
      paceNote: r.paceNote,
      progressionNote: r.progressionNote,
      shinRule: r.shinRule,
      comment: r.comment ?? null,
    })),
  );

  return program.id;
}
