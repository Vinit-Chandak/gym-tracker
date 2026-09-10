import { z } from "zod";

import { PRESCRIPTION_TYPES } from "./types";

/**
 * A programme described as portable data instead of database rows.
 *
 * Every programme a user trains on is materialised from one of these: the built-in templates
 * ship as blueprints, and anything that later generates or rewrites a plan — a coach, an import,
 * an AI given the exercise library — only has to produce this shape. Exercises, equipment and
 * warm-ups are named by their shared slug, never by a database id, so a blueprint stays valid
 * across accounts and databases.
 *
 * `blueprintVersion` is the contract number. Bump it when the shape changes in a way older
 * producers could not satisfy, and keep parsing the older number until nothing emits it.
 */
export const BLUEPRINT_VERSION = 1;

const progressionRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("double_progression"),
    loadIncrement: z.number().positive().nullable(),
  }),
  z.object({
    kind: z.literal("conservative_strength"),
    loadIncrement: z.number().positive(),
    repsRequired: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("time_first") }),
]);

const range = (schema: z.ZodNumber) =>
  z.tuple([schema, schema]).refine(([min, max]) => min <= max, "Range must be low to high");

const slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slugs are lower-case words joined by hyphens");

/** Equipment types are slugged with underscores, e.g. `leg_press_45`. */
const equipmentSlug = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:_[a-z0-9]+)*$/,
    "Equipment slugs are lower-case words joined by underscores",
  );

export const blueprintFallbackSchema = z.object({
  exerciseSlug: slug,
  equipmentTypeSlug: equipmentSlug.optional(),
  rank: z.number().int().min(1),
  notes: z.string().max(500).optional(),
});

export const blueprintExerciseSchema = z
  .object({
    exerciseSlug: slug,
    /**
     * The slot's identity across versions of one programme. A fresh plan leaves it out and
     * the write mints one; a revision carries the old slot's lineage over, so history logged
     * against the previous version still counts as this slot's.
     */
    lineageId: z.uuid().optional(),
    sets: z.number().int().min(1).max(20),
    /** Reps, or `duration` for timed work. Exactly one of the two is required. */
    reps: range(z.number().int().min(1).max(100)).optional(),
    duration: range(z.number().int().min(1).max(7200)).optional(),
    perSide: z.boolean().optional(),
    rir: range(z.number().min(0).max(10)),
    rest: range(z.number().int().min(0).max(1200)),
    targetLoadNote: z.string().max(300).optional(),
    progressionNotes: z.string().max(500).optional(),
    progressionRule: progressionRuleSchema.optional(),
    keyCue: z.string().max(300).optional(),
    /** Exercises sharing a group are performed back to back. */
    supersetGroup: z.string().max(60).optional(),
    notes: z.string().max(500).optional(),
    fallbacks: z.array(blueprintFallbackSchema).max(10).optional(),
  })
  .refine((e) => (e.reps === undefined) !== (e.duration === undefined), {
    message: "Give either reps or duration, not both",
    path: ["reps"],
  });

export const blueprintDaySchema = z.object({
  /** Position in the cycle, 1-based and contiguous. */
  dayIndex: z.number().int().min(1).max(31),
  /** ISO weekday the day usually falls on, 1 = Monday. */
  dayOfWeek: z.number().int().min(1).max(7),
  name: z.string().min(1).max(80),
  focus: z.string().max(120).default(""),
  timeNote: z.string().max(120).default(""),
  effortNote: z.string().max(120).default(""),
  notes: z.string().max(500).default(""),
  includesLifting: z.boolean(),
  includesRun: z.boolean(),
  warmupSlug: slug,
  exercises: z.array(blueprintExerciseSchema).max(30),
});

export const blueprintRunSchema = z.object({
  weekIndex: z.number().int().min(1).max(52),
  dayOfWeek: z.number().int().min(1).max(7),
  duration: range(z.number().int().min(1).max(600)),
  rpe: range(z.number().min(0).max(10)),
  paceNote: z.string().max(300).default(""),
  progressionNote: z.string().max(300).default(""),
  /** When to stop early, e.g. a niggle that worsens as the run goes on. */
  shinRule: z.string().max(300).default(""),
  comment: z.string().max(300).optional(),
});

export const programBlueprintSchema = z
  .object({
    blueprintVersion: z.literal(BLUEPRINT_VERSION),
    slug: slug.max(60),
    name: z.string().min(1).max(120),
    weeks: z.number().int().min(1).max(52),
    notes: z.string().max(2000).default(""),
    days: z.array(blueprintDaySchema).min(1).max(31),
    runs: z.array(blueprintRunSchema).max(200).default([]),
  })
  .superRefine((plan, ctx) => {
    const indexes = plan.days.map((d) => d.dayIndex);
    if (new Set(indexes).size !== indexes.length) {
      ctx.addIssue({ code: "custom", message: "Day indexes must be unique", path: ["days"] });
    }
    for (const run of plan.runs) {
      if (run.weekIndex > plan.weeks) {
        ctx.addIssue({
          code: "custom",
          message: `Run in week ${run.weekIndex} is outside a ${plan.weeks}-week programme`,
          path: ["runs"],
        });
      }
    }
  });

export type ProgramBlueprint = z.infer<typeof programBlueprintSchema>;
export type BlueprintDay = z.infer<typeof blueprintDaySchema>;
export type BlueprintExercise = z.infer<typeof blueprintExerciseSchema>;
export type BlueprintRun = z.infer<typeof blueprintRunSchema>;

/** Prescription kind implied by an exercise entry, matching the `prescription_type` enum. */
export function prescriptionTypeOf(
  exercise: BlueprintExercise,
): (typeof PRESCRIPTION_TYPES)[number] {
  return exercise.duration ? "duration" : "reps";
}

/** Every exercise slug a blueprint refers to, planned and fallback alike. */
export function blueprintExerciseSlugs(blueprint: ProgramBlueprint): string[] {
  return [
    ...new Set(
      blueprint.days.flatMap((day) =>
        day.exercises.flatMap((exercise) => [
          exercise.exerciseSlug,
          ...(exercise.fallbacks ?? []).map((fallback) => fallback.exerciseSlug),
        ]),
      ),
    ),
  ];
}

/** Parses untrusted input (a template file, an import, a generated plan) into a blueprint. */
export function parseProgramBlueprint(input: unknown): ProgramBlueprint {
  return programBlueprintSchema.parse(input);
}
