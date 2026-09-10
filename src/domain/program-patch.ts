import { z } from "zod";

import {
  blueprintExerciseSchema,
  type BlueprintExercise,
  type ProgramBlueprint,
} from "./program-blueprint";

/**
 * A change to the programme itself, rather than to one session.
 *
 * The coach adjusts a session freely, but the programme is immutable once active: a change to
 * it becomes a proposal the athlete approves, and approving writes the next version. This is
 * the shape of that proposal's patch, and `applyProgramPatch` is the whole of what applying
 * one does to the plan. Slots are named by their lineage, which survives a revision, never by
 * a row id, which does not.
 */

const slug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Exercise slugs are lower-case words joined by hyphens");

const reason = z.string().trim().min(1).max(300);
const range = (schema: z.ZodNumber) =>
  z.tuple([schema, schema]).refine(([min, max]) => min <= max, "Range must be low to high");

export const programPatchOperationSchema = z.discriminatedUnion("op", [
  z.object({
    /** Do this movement instead, from now on. */
    op: z.literal("substitute"),
    lineageId: z.uuid(),
    exerciseSlug: slug,
    reason,
  }),
  z.object({
    /** Keep the movement, change what it asks for. Anything omitted stays as it is. */
    op: z.literal("adjust"),
    lineageId: z.uuid(),
    sets: z.number().int().min(1).max(20).optional(),
    reps: range(z.number().int().min(1).max(100)).optional(),
    duration: range(z.number().int().min(1).max(7200)).optional(),
    distance: range(z.number().int().min(1).max(10000)).optional(),
    rir: range(z.number().min(0).max(10)).optional(),
    rest: range(z.number().int().min(0).max(1200)).optional(),
    reason,
  }),
  z.object({ op: z.literal("remove"), lineageId: z.uuid(), reason }),
  z.object({
    op: z.literal("add"),
    dayIndex: z.number().int().min(1).max(31),
    /** Place it after this slot; omitted puts it last on the day. */
    afterLineageId: z.uuid().optional(),
    exercise: blueprintExerciseSchema,
    reason,
  }),
  z.object({
    /** A planned run, by the week and weekday it falls on. */
    op: z.literal("run"),
    weekIndex: z.number().int().min(1).max(52),
    dayOfWeek: z.number().int().min(1).max(7),
    duration: range(z.number().int().min(1).max(600)).optional(),
    rpe: range(z.number().min(0).max(10)).optional(),
    paceNote: z.string().trim().max(300).optional(),
    reason,
  }),
]);

export const programPatchSchema = z.object({
  operations: z.array(programPatchOperationSchema).min(1).max(20),
});

export type ProgramPatchOperation = z.output<typeof programPatchOperationSchema>;
export type ProgramPatch = z.output<typeof programPatchSchema>;

export class ProgramPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgramPatchError";
  }
}

function findSlot(
  blueprint: ProgramBlueprint,
  lineageId: string,
): { dayIndex: number; index: number; exercise: BlueprintExercise } {
  for (const day of blueprint.days) {
    const index = day.exercises.findIndex((exercise) => exercise.lineageId === lineageId);
    if (index >= 0) {
      return { dayIndex: day.dayIndex, index, exercise: day.exercises[index]! };
    }
  }
  throw new ProgramPatchError("That exercise is no longer part of the programme.");
}

function withExercises(
  blueprint: ProgramBlueprint,
  dayIndex: number,
  change: (exercises: BlueprintExercise[]) => BlueprintExercise[],
): ProgramBlueprint {
  return {
    ...blueprint,
    days: blueprint.days.map((day) =>
      day.dayIndex === dayIndex ? { ...day, exercises: change([...day.exercises]) } : day,
    ),
  };
}

/**
 * Applies a patch to a programme's blueprint, returning a new one. Pure: the caller writes the
 * result out as the next version. Throws when an operation names something the programme does
 * not have, which is how a stale proposal is caught before anything is written.
 */
export function applyProgramPatch(
  blueprint: ProgramBlueprint,
  patch: ProgramPatch,
): ProgramBlueprint {
  let result = blueprint;
  for (const operation of patch.operations) {
    switch (operation.op) {
      case "substitute": {
        const found = findSlot(result, operation.lineageId);
        result = withExercises(result, found.dayIndex, (exercises) => {
          exercises[found.index] = {
            ...found.exercise,
            exerciseSlug: operation.exerciseSlug,
            notes: operation.reason,
          };
          return exercises;
        });
        break;
      }
      case "adjust": {
        const found = findSlot(result, operation.lineageId);
        const next: BlueprintExercise = { ...found.exercise, notes: operation.reason };
        if (operation.sets !== undefined) next.sets = operation.sets;
        if (operation.rir !== undefined) next.rir = operation.rir;
        if (operation.rest !== undefined) next.rest = operation.rest;
        // A slot is counted one way. Setting the measure clears whichever it replaces, which
        // is what the blueprint's "exactly one of reps, duration or distance" requires.
        if (operation.reps !== undefined) {
          next.reps = operation.reps;
          delete next.duration;
          delete next.distance;
        }
        if (operation.duration !== undefined) {
          next.duration = operation.duration;
          delete next.reps;
          delete next.distance;
        }
        if (operation.distance !== undefined) {
          next.distance = operation.distance;
          delete next.reps;
          delete next.duration;
        }
        result = withExercises(result, found.dayIndex, (exercises) => {
          exercises[found.index] = next;
          return exercises;
        });
        break;
      }
      case "remove": {
        const found = findSlot(result, operation.lineageId);
        result = withExercises(result, found.dayIndex, (exercises) => {
          exercises.splice(found.index, 1);
          return exercises;
        });
        break;
      }
      case "add": {
        const day = result.days.find((entry) => entry.dayIndex === operation.dayIndex);
        if (!day) throw new ProgramPatchError("That day is not part of the programme.");
        // A new slot has no lineage of its own yet; the write gives it one.
        const added: BlueprintExercise = { ...operation.exercise, lineageId: undefined };
        const at = operation.afterLineageId
          ? findSlot(result, operation.afterLineageId).index + 1
          : day.exercises.length;
        result = withExercises(result, operation.dayIndex, (exercises) => {
          exercises.splice(at, 0, added);
          return exercises;
        });
        break;
      }
      case "run": {
        const index = result.runs.findIndex(
          (run) => run.weekIndex === operation.weekIndex && run.dayOfWeek === operation.dayOfWeek,
        );
        if (index < 0) throw new ProgramPatchError("That planned run is not in the programme.");
        const runs = [...result.runs];
        const current = runs[index]!;
        runs[index] = {
          ...current,
          duration: operation.duration ?? current.duration,
          rpe: operation.rpe ?? current.rpe,
          paceNote: operation.paceNote ?? current.paceNote,
          comment: operation.reason,
        };
        result = { ...result, runs };
        break;
      }
    }
  }
  if (result.days.every((day) => day.exercises.length === 0)) {
    throw new ProgramPatchError("That would leave the programme with nothing to do.");
  }
  return result;
}

/** One line per operation, for the approval screen. */
export function describePatch(patch: ProgramPatch): string[] {
  return patch.operations.map((operation) => {
    switch (operation.op) {
      case "substitute":
        return `Swap in ${operation.exerciseSlug.replace(/-/g, " ")}. ${operation.reason}`;
      case "adjust": {
        const parts = [
          operation.sets === undefined ? null : `${operation.sets} sets`,
          operation.reps === undefined ? null : `${operation.reps[0]}–${operation.reps[1]} reps`,
          operation.duration === undefined
            ? null
            : `${operation.duration[0]}–${operation.duration[1]} s`,
          operation.distance === undefined
            ? null
            : `${operation.distance[0]}–${operation.distance[1]} m`,
          operation.rir === undefined ? null : `${operation.rir[0]}–${operation.rir[1]} RIR`,
          operation.rest === undefined ? null : `${operation.rest[0]}–${operation.rest[1]} s rest`,
        ].filter(Boolean);
        return `Change to ${parts.join(", ")}. ${operation.reason}`;
      }
      case "remove":
        return `Drop an exercise. ${operation.reason}`;
      case "add":
        return `Add ${operation.exercise.exerciseSlug.replace(/-/g, " ")} to day ${operation.dayIndex}. ${operation.reason}`;
      case "run":
        return `Change the week ${operation.weekIndex} run. ${operation.reason}`;
    }
  });
}
