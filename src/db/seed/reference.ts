import { and, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { EQUIPMENT_ART } from "../../components/equipment-art/catalogue";
import {
  assumedEquipmentTypes,
  equipmentCombinations,
  equipmentCombinationTypes,
  equipmentPresets,
  equipmentTypes,
  exerciseEquipmentOptions,
  exerciseEquipmentRequirements,
  exerciseGuides,
  exerciseMedia,
  exercises,
  warmupProtocols,
} from "../schema";
import type { DbOrTx } from "../types";
import { ASSUMED_EQUIPMENT } from "./data/assumed-equipment";
import { DRAFT_COMBINATION_ALIASES, EQUIPMENT_COMBINATIONS } from "./data/equipment-combinations";
import { DRAFT_EQUIPMENT_ALIASES, EQUIPMENT_DESCRIPTIONS } from "./data/equipment-descriptions";
import { EQUIPMENT_PRESETS } from "./data/equipment-presets";
import { EQUIPMENT_TYPES } from "./data/equipment-types";
import { DRAFT_EXERCISE_ALIASES, EXERCISE_ALIASES } from "./data/exercise-aliases";
import { EXERCISES, requirementGroups, type ExerciseSeed } from "./data/exercises";
import { GUIDES, MEDIA } from "./data/guides";
import { WARMUP_PROTOCOLS } from "./data/warmups";

export type ReferenceSeedSummary = {
  equipmentTypes: number;
  exercises: number;
  equipmentOptions: number;
  requirements: number;
  combinations: number;
  presets: number;
  guides: number;
  media: number;
  warmupProtocols: number;
};

export type ReferenceSeedOptions = {
  /**
   * Seed the catalogue additions still awaiting the owner's approval (`review: "draft"`), and
   * everything that points at them: a way to do a published exercise on a draft type, and the
   * aliases drafted for published items (`DRAFT_*_ALIASES`). Off unless asked for: the production
   * deploy never asks, so a draft never reaches the production database. The local seeder asks
   * for a loopback database.
   */
  drafts?: boolean;
  /** Tests only: runs inside the seed's transaction after every write, before it commits. */
  beforeCommit?: (tx: DbOrTx) => Promise<void>;
};

/**
 * One exercise as an environment seeds it, or null for a draft it leaves out. A published
 * exercise may gain a way to do it on a draft type, and that way waits with the type: where the
 * type is not seeded, the alternative goes whole, because dropping only the type would change what
 * the group asks for or leave it without its primary. A published exercise always keeps a way to
 * be done, and a type no manifest knows is a mistake wherever it appears.
 */
export function seededExercise(
  exercise: ExerciseSeed,
  environment: { drafts: boolean; seeded: ReadonlySet<string>; known: ReadonlySet<string> },
): ExerciseSeed | null {
  if (!environment.drafts && exercise.review === "draft") return null;
  const unseeded = new Set<string>();
  const equipment = exercise.equipment.filter((alternative) => {
    const group = typeof alternative === "string" ? [alternative] : alternative;
    const unknown = group.filter((slug) => !environment.known.has(slug));
    if (unknown.length > 0)
      throw new Error(`Exercise "${exercise.slug}" names unknown equipment: ${unknown.join(", ")}`);
    for (const slug of group) if (!environment.seeded.has(slug)) unseeded.add(slug);
    return group.every((slug) => environment.seeded.has(slug));
  });
  if (equipment.length === exercise.equipment.length) return exercise;
  if (equipment.length > 0) return { ...exercise, equipment };
  if (exercise.review === "draft") return null;
  throw new Error(
    `Exercise "${exercise.slug}" needs unseeded equipment for every way to do it: ` +
      [...unseeded].join(", "),
  );
}

/** The manifests as one environment sees them: drafts kept or dropped, with what depends on them. */
export function referenceManifests(options: ReferenceSeedOptions = {}) {
  const drafts = options.drafts ?? false;
  const types = EQUIPMENT_TYPES.filter((type) => drafts || type.review !== "draft");
  const typeSlugs = new Set(types.map((type) => type.slug));
  const environment = {
    drafts,
    seeded: typeSlugs,
    known: new Set(EQUIPMENT_TYPES.map((type) => type.slug)),
  };
  const exerciseList = EXERCISES.flatMap((exercise) => {
    const seeded = seededExercise(exercise, environment);
    return seeded ? [seeded] : [];
  });
  const exerciseSlugs = new Set(exerciseList.map((exercise) => exercise.slug));
  // Aliases still awaiting the owner join a published item's own only where drafts are seeded.
  const withDrafted = (
    published: readonly string[] | undefined,
    drafted: readonly string[] | undefined,
  ): string[] => [...(published ?? []), ...(drafts ? (drafted ?? []) : [])];
  const combinations = EQUIPMENT_COMBINATIONS.filter((combination) => {
    if (!drafts && combination.review === "draft") return false;
    const unknown = combination.types.filter((slug) => !typeSlugs.has(slug));
    if (unknown.length === 0) return true;
    if (combination.review !== "draft")
      throw new Error(
        `Combination "${combination.slug}" needs unseeded types: ${unknown.join(", ")}`,
      );
    return false;
  }).map((combination) => ({
    ...combination,
    aliases: withDrafted(combination.aliases, DRAFT_COMBINATION_ALIASES[combination.slug]),
  }));
  const combinationSlugs = new Set(combinations.map((combination) => combination.slug));
  const families = new Set(types.flatMap((type) => (type.family ? [type.family] : [])));
  // A preset is published, but may name a draft so a development build shows it in place.
  const presets = EQUIPMENT_PRESETS.map((preset) => ({
    ...preset,
    items: preset.items.filter((item) =>
      "type" in item
        ? typeSlugs.has(item.type)
        : "family" in item
          ? families.has(item.family)
          : combinationSlugs.has(item.combination),
    ),
  }));
  return {
    types,
    exercises: exerciseList,
    combinations,
    /** Every seeded type's aliases, by slug. */
    equipmentAliases: Object.fromEntries(
      types.map((type) => [
        type.slug,
        withDrafted(EQUIPMENT_DESCRIPTIONS[type.slug]?.aliases, DRAFT_EQUIPMENT_ALIASES[type.slug]),
      ]),
    ),
    /** Every seeded exercise's aliases, by slug. */
    exerciseAliases: Object.fromEntries(
      exerciseList.map((exercise) => [
        exercise.slug,
        withDrafted(EXERCISE_ALIASES[exercise.slug], DRAFT_EXERCISE_ALIASES[exercise.slug]),
      ]),
    ),
    presets,
    assumed: Object.entries(ASSUMED_EQUIPMENT).flatMap(([gymKind, slugs]) =>
      slugs
        .filter((slug) => typeSlugs.has(slug))
        .map((slug) => ({ gymKind: gymKind as keyof typeof ASSUMED_EQUIPMENT, slug })),
    ),
    guides: GUIDES.filter((guide) => exerciseSlugs.has(guide.exercise)),
    media: MEDIA.filter((item) => exerciseSlugs.has(item.exercise)),
  };
}

/**
 * Upserts the shared reference data by slug. Safe to run repeatedly; it never touches
 * user-owned rows. Runs as the migration role (bypasses RLS).
 *
 * Everything happens in one transaction (a savepoint when the caller already holds one): the
 * rows rebuilt from the manifests (options, requirement groups, assumptions, combination members,
 * demonstrations) are deleted and inserted again, and a request reading between the two used to
 * find an exercise with no equipment at all. Now it sees the old rows or the new, never neither,
 * and a failure part-way leaves the old ones in place.
 */
export async function seedReferenceData(
  db: DbOrTx,
  options: ReferenceSeedOptions = {},
): Promise<ReferenceSeedSummary> {
  const manifests = referenceManifests(options);
  return db.transaction(async (tx) => {
    const summary = await seedManifests(tx, manifests);
    await options.beforeCommit?.(tx);
    return summary;
  });
}

async function seedManifests(
  db: DbOrTx,
  manifests: ReturnType<typeof referenceManifests>,
): Promise<ReferenceSeedSummary> {
  await db
    .insert(equipmentTypes)
    .values(
      manifests.types.map((t) => {
        const description = EQUIPMENT_DESCRIPTIONS[t.slug];
        return {
          slug: t.slug,
          name: t.name,
          category: t.category,
          defaultResistanceMode: t.defaultResistanceMode,
          defaultUnit: t.defaultUnit,
          sortOrder: t.sortOrder,
          aliases: manifests.equipmentAliases[t.slug] ?? [],
          purpose: description?.purpose ?? null,
          identification: description?.identification ?? null,
          family: t.family ?? null,
          illustration: EQUIPMENT_ART[t.slug] ? t.slug : null,
        };
      }),
    )
    .onConflictDoUpdate({
      target: equipmentTypes.slug,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        defaultResistanceMode: sql`excluded.default_resistance_mode`,
        defaultUnit: sql`excluded.default_unit`,
        sortOrder: sql`excluded.sort_order`,
        aliases: sql`excluded.aliases`,
        purpose: sql`excluded.purpose`,
        identification: sql`excluded.identification`,
        family: sql`excluded.family`,
        illustration: sql`excluded.illustration`,
      },
    });

  await db
    .insert(warmupProtocols)
    .values(
      WARMUP_PROTOCOLS.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        drills: p.drills,
      })),
    )
    .onConflictDoUpdate({
      target: warmupProtocols.slug,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        drills: sql`excluded.drills`,
      },
    });

  await db
    .insert(exercises)
    .values(
      manifests.exercises.map((e) => ({
        slug: e.slug,
        name: e.name,
        category: e.category,
        modality: e.modality,
        movementPattern: e.movementPattern,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles ?? [],
        loadPortability: e.loadPortability,
        requiresEquipment: e.requiresEquipment ?? true,
        defaultPrescriptionType: e.measure ?? "reps",
        defaultRepMin: e.defaultRepMin ?? null,
        defaultRepMax: e.defaultRepMax ?? null,
        defaultDurationMinSeconds: e.defaultDurationMin ?? null,
        defaultDurationMaxSeconds: e.defaultDurationMax ?? null,
        defaultDistanceMinMeters: e.defaultDistanceMin ?? null,
        defaultDistanceMaxMeters: e.defaultDistanceMax ?? null,
        defaultRir: e.defaultRir ?? null,
        rirNote: e.rirNote ?? null,
        defaultRestSeconds: e.defaultRestSeconds ?? null,
        defaultLoadIncrement: e.defaultLoadIncrement ?? null,
        formNotes: e.formNotes ?? null,
        formUrl: e.formUrl ?? null,
        logNote: e.logNote ?? null,
        aliases: manifests.exerciseAliases[e.slug] ?? [],
        isActive: e.isActive ?? true,
      })),
    )
    .onConflictDoUpdate({
      target: exercises.slug,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        modality: sql`excluded.modality`,
        movementPattern: sql`excluded.movement_pattern`,
        primaryMuscles: sql`excluded.primary_muscles`,
        secondaryMuscles: sql`excluded.secondary_muscles`,
        loadPortability: sql`excluded.load_portability`,
        requiresEquipment: sql`excluded.requires_equipment`,
        defaultPrescriptionType: sql`excluded.default_prescription_type`,
        defaultRepMin: sql`excluded.default_rep_min`,
        defaultRepMax: sql`excluded.default_rep_max`,
        defaultDurationMinSeconds: sql`excluded.default_duration_min_seconds`,
        defaultDurationMaxSeconds: sql`excluded.default_duration_max_seconds`,
        defaultDistanceMinMeters: sql`excluded.default_distance_min_meters`,
        defaultDistanceMaxMeters: sql`excluded.default_distance_max_meters`,
        defaultRir: sql`excluded.default_rir`,
        rirNote: sql`excluded.rir_note`,
        defaultRestSeconds: sql`excluded.default_rest_seconds`,
        defaultLoadIncrement: sql`excluded.default_load_increment`,
        formNotes: sql`excluded.form_notes`,
        formUrl: sql`excluded.form_url`,
        logNote: sql`excluded.log_note`,
        aliases: sql`excluded.aliases`,
        isActive: sql`excluded.is_active`,
        updatedAt: sql`now()`,
      },
    });

  const typeRows = await db
    .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
    .from(equipmentTypes);
  const typeIdBySlug = new Map(typeRows.map((r) => [r.slug, r.id]));
  const typeId = (slug: string, where: string) => {
    const id = typeIdBySlug.get(slug);
    if (!id) throw new Error(`Unknown equipment type "${slug}" in ${where}`);
    return id;
  };

  const exerciseRows = await db
    .select({ id: exercises.id, slug: exercises.slug })
    .from(exercises)
    .where(
      inArray(
        exercises.slug,
        manifests.exercises.map((e) => e.slug),
      ),
    );
  const exerciseIdBySlug = new Map(exerciseRows.map((r) => [r.slug, r.id]));
  const exerciseId = (slug: string) => {
    const id = exerciseIdBySlug.get(slug);
    if (!id) throw new Error(`Unknown exercise "${slug}"`);
    return id;
  };
  const seededExerciseIds = [...exerciseIdBySlug.values()];

  // Requirement groups and the flat options are rebuilt from the manifest, so a corrected or
  // removed mapping disappears too. A user's own rows (preferred machines) are never touched.
  await db
    .delete(exerciseEquipmentRequirements)
    .where(
      and(
        isNull(exerciseEquipmentRequirements.userId),
        inArray(exerciseEquipmentRequirements.exerciseId, seededExerciseIds),
      ),
    );
  await db
    .delete(exerciseEquipmentOptions)
    .where(
      and(
        isNull(exerciseEquipmentOptions.userId),
        inArray(exerciseEquipmentOptions.exerciseId, seededExerciseIds),
      ),
    );

  const requirementRows = manifests.exercises.flatMap((e) =>
    requirementGroups(e).flatMap((group, index) =>
      group.map((slug, position) => ({
        exerciseId: exerciseId(e.slug),
        alternative: index + 1,
        equipmentTypeId: typeId(slug, `exercise "${e.slug}"`),
        isPrimary: position === 0,
      })),
    ),
  );
  if (requirementRows.length > 0)
    await db.insert(exerciseEquipmentRequirements).values(requirementRows);

  // The flat list each alternative's primary type, once, in preference order: what a reader that
  // has not moved to requirement groups still understands.
  const optionRows = manifests.exercises.flatMap((e) => {
    const primaries = [...new Set(requirementGroups(e).map((group) => group[0]!))];
    return primaries.map((slug, index) => ({
      exerciseId: exerciseId(e.slug),
      equipmentTypeId: typeId(slug, `exercise "${e.slug}"`),
      preferenceRank: index + 1,
    }));
  });
  if (optionRows.length > 0) await db.insert(exerciseEquipmentOptions).values(optionRows);

  await db.delete(assumedEquipmentTypes);
  if (manifests.assumed.length > 0)
    await db.insert(assumedEquipmentTypes).values(
      manifests.assumed.map((row) => ({
        gymKind: row.gymKind,
        equipmentTypeId: typeId(row.slug, "the assumed equipment"),
      })),
    );

  const combinationSlugs = manifests.combinations.map((c) => c.slug);
  // A combination dropped from the manifest goes: machines name types, never combinations.
  await db
    .delete(equipmentCombinations)
    .where(
      combinationSlugs.length > 0
        ? notInArray(equipmentCombinations.slug, combinationSlugs)
        : sql`true`,
    );
  if (manifests.combinations.length > 0) {
    const saved = await db
      .insert(equipmentCombinations)
      .values(
        manifests.combinations.map((c) => ({
          slug: c.slug,
          name: c.name,
          aliases: [...c.aliases],
          purpose: c.purpose,
          identification: c.identification,
          illustration: EQUIPMENT_ART[c.slug] ? c.slug : null,
          sortOrder: c.sortOrder,
        })),
      )
      .onConflictDoUpdate({
        target: equipmentCombinations.slug,
        set: {
          name: sql`excluded.name`,
          aliases: sql`excluded.aliases`,
          purpose: sql`excluded.purpose`,
          identification: sql`excluded.identification`,
          illustration: sql`excluded.illustration`,
          sortOrder: sql`excluded.sort_order`,
        },
      })
      .returning({ id: equipmentCombinations.id, slug: equipmentCombinations.slug });
    const combinationId = new Map(saved.map((row) => [row.slug, row.id]));
    await db.delete(equipmentCombinationTypes).where(
      inArray(
        equipmentCombinationTypes.combinationId,
        saved.map((row) => row.id),
      ),
    );
    await db.insert(equipmentCombinationTypes).values(
      manifests.combinations.flatMap((c) =>
        c.types.map((slug, index) => ({
          combinationId: combinationId.get(c.slug)!,
          equipmentTypeId: typeId(slug, `combination "${c.slug}"`),
          position: index + 1,
        })),
      ),
    );
  }

  const presetSlugs = manifests.presets.map((p) => p.slug);
  await db
    .delete(equipmentPresets)
    .where(presetSlugs.length > 0 ? notInArray(equipmentPresets.slug, presetSlugs) : sql`true`);
  if (manifests.presets.length > 0)
    await db
      .insert(equipmentPresets)
      .values(
        manifests.presets.map((p) => ({
          slug: p.slug,
          gymKind: p.gymKind,
          experience: p.experience,
          version: p.version,
          items: [...p.items],
        })),
      )
      .onConflictDoUpdate({
        target: equipmentPresets.slug,
        set: {
          gymKind: sql`excluded.gym_kind`,
          experience: sql`excluded.experience`,
          version: sql`excluded.version`,
          items: sql`excluded.items`,
        },
      });

  // Guides are upserted on their exercise; one taken out of the manifest goes.
  const guideExerciseIds = manifests.guides.map((g) => exerciseId(g.exercise));
  await db
    .delete(exerciseGuides)
    .where(
      guideExerciseIds.length > 0
        ? notInArray(exerciseGuides.exerciseId, guideExerciseIds)
        : sql`true`,
    );
  if (manifests.guides.length > 0)
    await db
      .insert(exerciseGuides)
      .values(
        manifests.guides.map((g) => ({
          exerciseId: exerciseId(g.exercise),
          version: g.version,
          status: g.status,
          setup: g.setup,
          steps: [...g.steps],
          cues: [...g.cues],
          mistakes: [...g.mistakes],
          sources: g.sources.map((s) => ({ ...s })),
          draftedBy: g.draftedBy,
          reviewer: g.reviewer,
          reviewedOn: g.reviewedOn,
        })),
      )
      .onConflictDoUpdate({
        target: exerciseGuides.exerciseId,
        set: {
          version: sql`excluded.version`,
          status: sql`excluded.status`,
          setup: sql`excluded.setup`,
          steps: sql`excluded.steps`,
          cues: sql`excluded.cues`,
          mistakes: sql`excluded.mistakes`,
          sources: sql`excluded.sources`,
          draftedBy: sql`excluded.drafted_by`,
          reviewer: sql`excluded.reviewer`,
          reviewedOn: sql`excluded.reviewed_on`,
          updatedAt: sql`now()`,
        },
      });

  // Nothing points at a demonstration's row, so the links are simply laid down again.
  await db.delete(exerciseMedia);
  if (manifests.media.length > 0) {
    const position = new Map<string, number>();
    await db.insert(exerciseMedia).values(
      manifests.media.map((m) => {
        const next = (position.get(m.exercise) ?? 0) + 1;
        position.set(m.exercise, next);
        return {
          exerciseId: exerciseId(m.exercise),
          provider: m.provider,
          videoId: m.videoId,
          startSeconds: m.startSeconds ?? null,
          title: m.title,
          channel: m.channel,
          url: m.url,
          usageBasis: m.usageBasis,
          checkedOn: m.checkedOn,
          status: m.status,
          position: next,
        };
      }),
    );
  }

  return {
    equipmentTypes: manifests.types.length,
    exercises: manifests.exercises.length,
    equipmentOptions: optionRows.length,
    requirements: requirementRows.length,
    combinations: manifests.combinations.length,
    presets: manifests.presets.length,
    guides: manifests.guides.length,
    media: manifests.media.length,
    warmupProtocols: WARMUP_PROTOCOLS.length,
  };
}
