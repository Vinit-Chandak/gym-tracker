import { z } from "zod";
import { programmeEnduranceSessionSchema, programmeSportSchema } from "./programme-sport";

import { BLUEPRINT_LIMITS, PRESCRIBED_EFFORT } from "./activity-limits";
import { CYCLE_REPEATS, PRESCRIPTION_TYPES } from "./types";

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
    lineageId: z
      .uuid()
      .transform((id) => id.toLowerCase())
      .optional(),
    sets: z.number().int().min(1).max(20),
    /**
     * How the slot is counted: reps, seconds held, or metres covered. Exactly one, because a
     * set answers one question — a carry has no reps and a curl has no distance.
     */
    reps: range(z.number().int().min(1).max(100)).optional(),
    duration: range(z.number().int().min(1).max(7200)).optional(),
    distance: range(z.number().int().min(1).max(10000)).optional(),
    perSide: z.boolean().optional(),
    rir: range(z.number().min(0).max(10)).nullable().default(null),
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
  .refine(
    (e) => [e.reps, e.duration, e.distance].filter((value) => value !== undefined).length === 1,
    { message: "Give exactly one of reps, duration or distance", path: ["reps"] },
  );

export const blueprintDaySchema = z.object({
  /** Position in the cycle, 1-based and contiguous. */
  dayIndex: z.number().int().min(1).max(BLUEPRINT_LIMITS.strengthSlots),
  /** ISO weekday the day usually falls on, 1 = Monday. */
  dayOfWeek: z.number().int().min(1, "Choose the weekday each day falls on.").max(7),
  name: z.string().min(1, "Name every day.").max(80),
  focus: z.string().max(120).default(""),
  timeNote: z.string().max(120).default(""),
  effortNote: z.string().max(120).default(""),
  notes: z.string().max(500).default(""),
  includesLifting: z.boolean(),
  includesRun: z.boolean(),
  /**
   * The shared warm-up this day uses, or "" for none. A programme written by hand is often
   * just the work: the warm-up is a choice, not a thing every day must carry.
   */
  warmupSlug: z.union([slug, z.literal("")]).default(""),
  exercises: z.array(blueprintExerciseSchema).max(30),
});

export const blueprintRunSchema = z.object({
  weekIndex: z.number().int().min(1).max(52),
  dayOfWeek: z.number().int().min(1).max(7),
  // A week of a run day is written a week at a time, so these say which answer is missing
  // rather than reporting the shape of the value that was not a number.
  duration: range(z.number("Give every run week its minutes.").int().min(1).max(600)),
  /**
   * How far, in kilometres. Optional, because a run can be prescribed by time alone — but a
   * block built around "an easy 5k twice a week" is built around the distance, and with only
   * a duration to go on nothing downstream can tell that it was deliberately held flat.
   */
  distanceKm: range(
    z.number("Give both ends of a run's kilometres, or leave them empty to go by time."),
  )
    .pipe(z.tuple([z.number().min(0.1).max(100), z.number().min(0.1).max(100)]))
    .optional(),
  /** Out of five since 0034, matching what the athlete is asked to report. */
  rpe: range(
    z
      .number("Give every run week its effort, out of five.")
      .min(PRESCRIBED_EFFORT.min)
      .max(PRESCRIBED_EFFORT.max),
  ),
  paceNote: z.string().max(300).default(""),
  progressionNote: z.string().max(300).default(""),
  /**
   * When to cut this run short, written for the runner it belongs to: the niggle their own
   * history shows, the effort they are not to exceed, whatever their situation calls for.
   */
  stopRule: z.string().max(300).default(""),
  comment: z.string().max(300).optional(),
});

export const programBlueprintSchema = z
  .object({
    blueprintVersion: z.literal(BLUEPRINT_VERSION),
    /** Absent only on historical combined blueprints; new authoring always selects a sport. */
    sport: programmeSportSchema.optional(),
    enduranceSessions: z.array(programmeEnduranceSessionSchema).max(730).optional(),
    /**
     * The date the author meant day offset 0 to be (ADR 0059). An endurance programme is dated
     * from its start, so a marathon built to finish on race day finishes there only if it starts
     * when its author counted from: the review screen offers this date first, and the athlete
     * still chooses. Absent, the review starts from today, as it always has.
     */
    startsOn: z.iso.date().optional(),
    slug: slug.max(60),
    // These four are what someone typing a programme in by hand leaves blank, so they say
    // what to do rather than reporting the shape of the value that was missing.
    name: z.string().min(1, "Name your programme.").max(120),
    weeks: z.number().int().min(1, "Set how many weeks it runs.").max(52),
    /**
     * How the cycle repeats (`cycle-repeat.ts`). Absent means not chosen: a new programme
     * takes the one its days suggest, and a later version keeps the one before it — which, for
     * a programme that predates the choice, is none.
     */
    repeats: z.enum(CYCLE_REPEATS).optional(),
    notes: z.string().max(2000).default(""),
    days: z.array(blueprintDaySchema).max(BLUEPRINT_LIMITS.strengthSlots),
    runs: z.array(blueprintRunSchema).max(200).default([]),
  })
  .superRefine((plan, ctx) => {
    if ((!plan.sport || plan.sport === "strength") && plan.days.length === 0)
      ctx.addIssue({ code: "custom", message: "Add at least one day.", path: ["days"] });
    if (
      plan.sport === "strength" &&
      (plan.runs.length ||
        plan.days.some((day) => day.includesRun) ||
        plan.enduranceSessions?.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Keep endurance sessions in their own sport programme.",
        path: ["days"],
      });
    if (plan.sport && plan.sport !== "strength") {
      if (plan.days.length || plan.runs.length)
        ctx.addIssue({
          code: "custom",
          message: "An endurance programme uses its own dated sessions.",
          path: ["days"],
        });
      if (!plan.enduranceSessions?.length)
        ctx.addIssue({
          code: "custom",
          message: "Add at least one scheduled session.",
          path: ["enduranceSessions"],
        });
      plan.enduranceSessions?.forEach((session, index) => {
        if (session.prescription.sport !== plan.sport || session.weekIndex > plan.weeks)
          ctx.addIssue({
            code: "custom",
            message: "Each session must belong to this sport and programme week.",
            path: ["enduranceSessions", index],
          });
      });
    }
    const indexes = plan.days.map((d) => d.dayIndex);
    if (new Set(indexes).size !== indexes.length) {
      ctx.addIssue({ code: "custom", message: "Day indexes must be unique", path: ["days"] });
    }
    const lineage = new Set<string>();
    plan.days.forEach((day, dayIndex) => {
      day.exercises.forEach((exercise, exerciseIndex) => {
        if (exercise.lineageId === undefined) return;
        if (lineage.has(exercise.lineageId))
          ctx.addIssue({
            code: "custom",
            message: "Slot lineage IDs must be unique within a program version",
            path: ["days", dayIndex, "exercises", exerciseIndex, "lineageId"],
          });
        lineage.add(exercise.lineageId);
      });
    });
    const occurrences = new Set<string>();
    plan.runs.forEach((run, runIndex) => {
      const occurrence = `${run.weekIndex}:${run.dayOfWeek}`;
      if (occurrences.has(occurrence))
        ctx.addIssue({
          code: "custom",
          message: "Run occurrences must be unique within a program version",
          path: ["runs", runIndex],
        });
      occurrences.add(occurrence);
      if (run.weekIndex > plan.weeks) {
        ctx.addIssue({
          code: "custom",
          message: `Run in week ${run.weekIndex} is outside a ${plan.weeks}-week programme`,
          path: ["runs"],
        });
      }
    });
  });

export type ProgramBlueprint = z.infer<typeof programBlueprintSchema>;
export type BlueprintDay = z.infer<typeof blueprintDaySchema>;
export type BlueprintExercise = z.infer<typeof blueprintExerciseSchema>;
export type BlueprintRun = z.infer<typeof blueprintRunSchema>;

/** Prescription kind implied by an exercise entry, matching the `prescription_type` enum. */
export function prescriptionTypeOf(
  exercise: BlueprintExercise,
): (typeof PRESCRIPTION_TYPES)[number] {
  if (exercise.duration) return "duration";
  if (exercise.distance) return "distance";
  return "reps";
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
