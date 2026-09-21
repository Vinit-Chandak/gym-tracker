import { z } from "zod";

import { ENDURANCE_SPORTS } from "./activity";
import { BLUEPRINT_LIMITS } from "./activity-limits";
import { endurancePrescriptionSchema } from "./activity-prescription";
import { legacyProgramRunToPrescription, legacyPlannedDate } from "./legacy-multisport";
import { blueprintDaySchema, type ProgramBlueprint } from "./program-blueprint";

/**
 * A programme as portable data, once a programme can hold four sports (plan §6.4).
 *
 * Version 1 said a day either lifts or runs, and identified a planned run by its week and
 * weekday. Neither survives contact with what was asked for: two runs can share a Wednesday,
 * a programme can have no strength at all, and a swim that moves must stay the same swim.
 * So v2 keeps the strength cycle exactly as it was — the same ordered slots, the same exercise
 * prescriptions, the same lineage — and puts every endurance session in its own occurrence
 * with its own identity.
 *
 * Conversion from v1 is pure and total: it reads, it does not write, and the original payload
 * travels with the result so nothing has to be reconstructed later.
 */

export const BLUEPRINT_V2_VERSION = 2;

const slug = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slugs are lower-case words joined by hyphens");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates are YYYY-MM-DD");

/** The strength half: unchanged from v1, because nothing about lifting is being redesigned. */
export const strengthCycleSchema = z.object({
  startDayIndex: z.number().int().min(1).max(BLUEPRINT_LIMITS.strengthSlots).default(1),
  slots: z.array(blueprintDaySchema).min(1).max(BLUEPRINT_LIMITS.strengthSlots),
});

/** A recurring endurance role in the programme: "the Wednesday easy run". */
export const enduranceSlotSchema = z.object({
  lineageId: z.uuid(),
  sport: z.enum(ENDURANCE_SPORTS),
  name: z.string().max(80).default(""),
  prescription: endurancePrescriptionSchema,
});

/** One performance of a slot, on one date, with its own identity and order within the day. */
export const blueprintOccurrenceSchema = z.object({
  /** Resolved to a real occurrence id transactionally when the programme is activated. */
  localId: z.string().min(1).max(64),
  slotLineageId: z.uuid(),
  weekIndex: z.number().int().min(1).max(BLUEPRINT_LIMITS.weeks.max),
  /**
   * The slot of the cycle this performance belongs to, 1-based, or null when it belongs to
   * none. Null is a real answer, not a missing one: legacy programmes planned runs by weekday
   * and some of those weekdays never had a running day, and that work is still the athlete's
   * — it simply is not part of any day's sequence, so no day offers it.
   */
  cycleDayIndex: z
    .number()
    .int()
    .min(1)
    .max(BLUEPRINT_LIMITS.strengthSlots)
    .nullable()
    .default(null),
  scheduledOn: isoDate,
  /** Optional; a time of day orders a card, it does not imply live recording. */
  scheduledLocalTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  orderIndex: z.number().int().min(0).max(1000).default(0),
  /** Overrides this one performance without touching the slot's own prescription. */
  prescription: endurancePrescriptionSchema.nullable().default(null),
});

export const programBlueprintV2Schema = z
  .object({
    blueprintVersion: z.literal(BLUEPRINT_V2_VERSION),
    slug,
    name: z.string().min(1, "Name your programme.").max(120),
    notes: z.string().max(2000).default(""),
    startDate: isoDate,
    /** The zone every scheduled date is read in; dates do not move when a profile changes. */
    schedulingTimeZone: z.string().min(1).max(64),
    weeks: z.number().int().min(BLUEPRINT_LIMITS.weeks.min).max(BLUEPRINT_LIMITS.weeks.max),
    /** Null for a programme with no lifting at all, which is now a legitimate programme. */
    strengthCycle: strengthCycleSchema.nullable().default(null),
    enduranceSlots: z.array(enduranceSlotSchema).max(200).default([]),
    occurrences: z
      .array(blueprintOccurrenceSchema)
      .max(BLUEPRINT_LIMITS.enduranceOccurrences)
      .default([]),
    legacy: z
      .object({ sourceVersion: z.string().max(40), payload: z.unknown() })
      .nullable()
      .default(null),
  })
  .superRefine((plan, ctx) => {
    const lineages = new Set(plan.enduranceSlots.map((slot) => slot.lineageId));
    if (lineages.size !== plan.enduranceSlots.length)
      ctx.addIssue({
        code: "custom",
        message: "Endurance slot lineages must be unique",
        path: ["enduranceSlots"],
      });
    const localIds = new Set<string>();
    plan.occurrences.forEach((occurrence, index) => {
      // Identity, not sport and weekday: two runs on one Wednesday are both valid.
      if (localIds.has(occurrence.localId))
        ctx.addIssue({
          code: "custom",
          message: "Occurrence ids must be unique",
          path: ["occurrences", index, "localId"],
        });
      localIds.add(occurrence.localId);
      if (!lineages.has(occurrence.slotLineageId))
        ctx.addIssue({
          code: "custom",
          message: "An occurrence must belong to one of the programme's slots",
          path: ["occurrences", index, "slotLineageId"],
        });
      if (occurrence.weekIndex > plan.weeks)
        ctx.addIssue({
          code: "custom",
          message: `Week ${occurrence.weekIndex} is outside a ${plan.weeks}-week programme`,
          path: ["occurrences", index, "weekIndex"],
        });
      const week = weekOf(plan.startDate, occurrence.scheduledOn);
      if (week !== occurrence.weekIndex)
        ctx.addIssue({
          code: "custom",
          message: "The date and the programme week disagree",
          path: ["occurrences", index, "scheduledOn"],
        });
    });
    if (plan.strengthCycle === null && plan.enduranceSlots.length === 0)
      ctx.addIssue({
        code: "custom",
        message: "A programme needs at least one sport",
        path: ["enduranceSlots"],
      });
    if (JSON.stringify(plan).length > BLUEPRINT_LIMITS.payloadBytes)
      ctx.addIssue({ code: "custom", message: "That programme is too large to store", path: [] });
  });

export type ProgramBlueprintV2 = z.infer<typeof programBlueprintV2Schema>;
export type BlueprintEnduranceSlot = z.infer<typeof enduranceSlotSchema>;
export type BlueprintOccurrence = z.infer<typeof blueprintOccurrenceSchema>;

/** 1-based programme week of a date, counted from the start date like the rest of the app. */
function weekOf(startDate: string, date: string): number {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [dy, dm, dd] = date.split("-").map(Number);
  const start = Date.UTC(sy!, sm! - 1, sd!);
  const at = Date.UTC(dy!, dm! - 1, dd!);
  return Math.floor((at - start) / 86_400_000 / 7) + 1;
}

export type BlueprintConversion = {
  blueprint: ProgramBlueprintV2;
  /** Lineage minted for each weekday the old programme ran on, so revisions keep the role. */
  lineageByWeekday: Map<number, string>;
  /** The cycle slot each of those weekdays resolved to; absent where none carries a run. */
  cycleDayByWeekday: Map<number, number>;
};

/**
 * The slot of the cycle a planned run belongs to, from the weekday the old row named.
 *
 * A v1 run says "week 3, Wednesday", which names a position in the cycle only through the
 * day that runs on that weekday. Only a day carrying endurance can answer for one — a lifting
 * day that happens to share the weekday is not the run's day, and treating it as one is how a
 * 30-minute run came to be offered under a pull-up session. Where two running days share a
 * weekday the earlier slot wins, deterministically, and `runningDaysNeedDistinctWeekdays`
 * refuses that programme before it is ever written.
 */
export function cycleDayForRunWeekday(
  days: readonly { dayIndex: number; dayOfWeek: number; includesRun: boolean }[],
  dayOfWeek: number,
): number | null {
  const matches = days
    .filter((day) => day.includesRun && day.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.dayIndex - b.dayIndex);
  return matches[0]?.dayIndex ?? null;
}

/**
 * Why a programme's endurance half cannot be placed in its cycle, if it cannot.
 *
 * Checked wherever a programme is written rather than in the blueprint schema, because the
 * schema also parses programmes that already exist: a stored block that breaks this has to
 * stay readable so it can be inspected, reviewed and corrected, and a parse that threw would
 * take the coach, the diff and the change screen down with it. New work is held to the rule;
 * old work is diagnosed, never hidden.
 *
 * Both halves matter. A run whose weekday no running day falls on has nowhere in the sequence
 * to live, and a weekday two running days share offers it two places. Only with both settled
 * does `cycleDayForRunWeekday` answer, and answer once.
 */
export function enduranceCycleIssues(blueprint: ProgramBlueprint): string[] {
  const issues: string[] = [];
  const runningDays = blueprint.days.filter((day) => day.includesRun);
  const weekdays = new Set(runningDays.map((day) => day.dayOfWeek));
  if (weekdays.size !== runningDays.length) issues.push("Running days need distinct weekdays.");
  for (const dayOfWeek of new Set(blueprint.runs.map((run) => run.dayOfWeek)))
    if (!weekdays.has(dayOfWeek))
      issues.push("A running prescription needs a matching running day.");
  return [...new Set(issues)];
}

/**
 * A v1 blueprint read as v2.
 *
 * The strength cycle is carried over as it stands, rest slots and `startDayIndex` included —
 * a day that only ran becomes a rest position in the strength sequence rather than being
 * deleted, which would silently shorten the cycle (§7). Each weekday that had planned runs
 * becomes one endurance slot, and each planned week becomes one occurrence on a real date.
 */
export function blueprintV1ToV2(
  blueprint: ProgramBlueprint,
  context: { startDate: string; schedulingTimeZone: string },
): BlueprintConversion {
  const lineageByWeekday = new Map<number, string>();
  for (const run of blueprint.runs) {
    if (!lineageByWeekday.has(run.dayOfWeek))
      lineageByWeekday.set(run.dayOfWeek, crypto.randomUUID());
  }

  const enduranceSlots = [...lineageByWeekday.entries()].map(([dayOfWeek, lineageId]) => {
    const first = blueprint.runs.find((run) => run.dayOfWeek === dayOfWeek)!;
    return {
      lineageId,
      sport: "running" as const,
      name: "Easy run",
      prescription: prescriptionForRun(first),
    };
  });

  const cycleDayByWeekday = new Map<number, number>();
  for (const dayOfWeek of lineageByWeekday.keys()) {
    const dayIndex = cycleDayForRunWeekday(blueprint.days, dayOfWeek);
    if (dayIndex !== null) cycleDayByWeekday.set(dayOfWeek, dayIndex);
  }

  const occurrences = blueprint.runs.map((run, index) => ({
    localId: `run-${run.weekIndex}-${run.dayOfWeek}-${index}`,
    slotLineageId: lineageByWeekday.get(run.dayOfWeek)!,
    weekIndex: run.weekIndex,
    cycleDayIndex: cycleDayByWeekday.get(run.dayOfWeek) ?? null,
    scheduledOn: legacyPlannedDate(context.startDate, run.weekIndex, run.dayOfWeek),
    scheduledLocalTime: null,
    orderIndex: 0,
    prescription: prescriptionForRun(run),
  }));

  const hasStrength = blueprint.days.some((day) => day.includesLifting);
  const parsed = programBlueprintV2Schema.parse({
    blueprintVersion: BLUEPRINT_V2_VERSION,
    slug: blueprint.slug,
    name: blueprint.name,
    notes: blueprint.notes,
    startDate: context.startDate,
    schedulingTimeZone: context.schedulingTimeZone,
    weeks: blueprint.weeks,
    strengthCycle: hasStrength ? { startDayIndex: 1, slots: blueprint.days } : null,
    enduranceSlots,
    occurrences,
    legacy: { sourceVersion: "blueprint:v1", payload: blueprint },
  });
  return { blueprint: parsed, lineageByWeekday, cycleDayByWeekday };
}

function prescriptionForRun(run: ProgramBlueprint["runs"][number]) {
  return legacyProgramRunToPrescription({
    id: `${run.weekIndex}:${run.dayOfWeek}`,
    programId: "",
    weekIndex: run.weekIndex,
    dayOfWeek: run.dayOfWeek,
    durationMinMinutes: run.duration[0],
    durationMaxMinutes: run.duration[1],
    distanceMinKm: run.distanceKm?.[0] ?? null,
    distanceMaxKm: run.distanceKm?.[1] ?? null,
    rpeMin: run.rpe[0],
    rpeMax: run.rpe[1],
    paceNote: run.paceNote,
    progressionNote: run.progressionNote,
    stopRule: run.stopRule,
    comment: run.comment ?? null,
  });
}

export function parseBlueprintV2(input: unknown): ProgramBlueprintV2 {
  return programBlueprintV2Schema.parse(input);
}
