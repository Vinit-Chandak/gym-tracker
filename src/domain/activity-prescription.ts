import { z } from "zod";

import { LENGTH_UNITS, roundTo, sportDistanceParts, type SportUnits } from "@/lib/distance-units";

import { ENDURANCE_SPORTS, SWIM_STROKES } from "./activity";
import type { EnduranceSport } from "./activity";
import {
  DISTANCE_METRES,
  DURATION_MS,
  HEART_RATE_ZONE_TARGET,
  PACE_TARGET_SECONDS_PER_KM,
  PRESCRIBED_EFFORT,
  PRESCRIPTION_LIMITS,
  TEXT_LIMITS,
} from "./activity-limits";
import { RUN_TYPES } from "./run-types";

/**
 * What an endurance session asks for (plan §5.1).
 *
 * Structure enough to write "8 × 50 m with 20 seconds between", and no more: ordered steps
 * and one level of repeats. A repeat cannot contain a repeat, because the moment it can, the
 * editor, the display and the totals all have to handle a tree nobody asked for.
 *
 * A prescription is a target. It is never an actual: the totals below are what was asked for,
 * the prescribed rests are what was asked for, and neither becomes a measurement because the
 * athlete pressed save. Sessions imported from the old programme keep `legacy_summary`
 * structure — their ranges and prose survive exactly as written, and nothing parses that prose
 * into intervals somebody never wrote.
 */

export const PRESCRIPTION_VERSION = 1;

export const STEP_PHASES = ["warmup", "work", "recovery", "cooldown"] as const;
export type StepPhase = (typeof STEP_PHASES)[number];

/** What is done in a step. Walking inside a run is a step, not a separate sport (§2.1). */
export const STEP_ACTIONS = ["run", "walk", "ride", "swim", "rest"] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];

const ACTIONS_BY_SPORT: Record<EnduranceSport, readonly StepAction[]> = {
  running: ["run", "walk", "rest"],
  cycling: ["ride", "rest"],
  swimming: ["swim", "rest"],
};

const stepId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Step ids are letters, digits, dashes and underscores");

const range = (schema: z.ZodNumber, label: string) =>
  z
    .tuple([schema, schema])
    .refine(([min, max]) => min <= max, `${label} must read low to high`)
    .refine(([, max]) => max > 0, `${label} must ask for something`);

const durationRange = range(z.number().int().min(0).max(DURATION_MS.max), "A duration range");
const distanceRange = range(z.number().min(0).max(DISTANCE_METRES.cycling.max), "A distance range");
// A target may legitimately be written from zero — the old programme sheet did — while the
// athlete's own report starts at 1. Both are out of five since 0034; they differ only at the
// bottom, so they keep different bounds: see `PRESCRIBED_EFFORT`.
const effortRange = range(
  z.number().min(PRESCRIBED_EFFORT.min).max(PRESCRIBED_EFFORT.max),
  "An effort range",
);

/**
 * How fast and how hard, beside how much (ADR 0059). A pace reads fastest first, as every range
 * reads low to high: 4:05–4:15 per kilometre is [245, 255]. Zones are the athlete's own five, so
 * "zone 2" means their zone 2 whatever their maximum is, and is shown in their own beats.
 *
 * Both are optional rather than null by default, unlike the fields above, and on purpose: a
 * prescription stored before they existed is read back without them and must still compare
 * equal to itself once parsed, or every saved session would look changed to the next edit
 * (`jsonEqual` reads a null as a value and an absent key as nothing).
 */
/**
 * A pace is kept to a tenth of a second a kilometre, which is what lets one typed per mile come
 * back as it was typed: a second a mile is 0.62 of one a kilometre, so whole seconds would turn
 * 9:00 a mile into 9:01.
 */
const paceSeconds = z
  .number()
  .min(PACE_TARGET_SECONDS_PER_KM.min)
  .max(PACE_TARGET_SECONDS_PER_KM.max)
  .refine(
    (value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-6,
    "A pace is kept to a tenth of a second",
  );
const paceRange = z
  .tuple([paceSeconds, paceSeconds])
  .refine(([fast, slow]) => fast <= slow, "A pace range reads fastest first");
const zoneRange = z
  .tuple([
    z.number().int().min(HEART_RATE_ZONE_TARGET.min).max(HEART_RATE_ZONE_TARGET.max),
    z.number().int().min(HEART_RATE_ZONE_TARGET.min).max(HEART_RATE_ZONE_TARGET.max),
  ])
  .refine(([low, high]) => low <= high, "A zone range reads low to high");

/**
 * The unit a distance was written in, so an editor can give it back as it was typed. Only that:
 * every screen reads a target in the athlete's own unit, and the metres are what is compared.
 */
const writtenIn = z.enum(LENGTH_UNITS).optional();

const stepTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("duration"), ms: durationRange }),
  z.object({ kind: z.literal("distance"), metres: distanceRange, unit: writtenIn }),
]);

export const prescriptionStepSchema = z.object({
  kind: z.literal("step"),
  id: stepId,
  phase: z.enum(STEP_PHASES),
  action: z.enum(STEP_ACTIONS),
  /** One primary axis per step: a step is measured by time or by distance, not both. */
  target: stepTargetSchema,
  effort: effortRange.nullable().default(null),
  /** A run step's pace, per kilometre; read per mile by an athlete in miles. */
  paceSecondsPerKm: paceRange.optional(),
  heartRateZones: zoneRange.optional(),
  stroke: z.enum(SWIM_STROKES).nullable().default(null),
  notes: z.string().max(TEXT_LIMITS.stepNotes).nullable().default(null),
});

export const prescriptionRepeatSchema = z.object({
  kind: z.literal("repeat"),
  id: stepId,
  repetitions: z.number().int().min(2).max(PRESCRIPTION_LIMITS.repetitionsPerBlock),
  steps: z.array(prescriptionStepSchema).min(1),
  /** Rest between repetitions; it happens n − 1 times. A rest after the block is its own step. */
  restBetweenMs: z.number().int().min(0).max(DURATION_MS.max).nullable().default(null),
});

export const prescriptionNodeSchema = z.discriminatedUnion("kind", [
  prescriptionStepSchema,
  prescriptionRepeatSchema,
]);

/** The running-specific instructions the old programme wrote, kept as their own fields. */
export const runningInstructionsSchema = z.object({
  /** What kind of run it is: easy, long, tempo, intervals… (`run-types.ts`). */
  sessionType: z.enum(RUN_TYPES).optional(),
  paceNote: z.string().max(300).nullable().default(null),
  progressionNote: z.string().max(300).nullable().default(null),
  /** When to cut the run short, in this runner's own terms. */
  symptomStopRule: z.string().max(300).nullable().default(null),
  note: z.string().max(300).nullable().default(null),
});

export const endurancePrescriptionSchema = z
  .object({
    prescriptionVersion: z.literal(PRESCRIPTION_VERSION),
    sport: z.enum(ENDURANCE_SPORTS),
    /** `legacy_summary` means the source had no steps, and none were invented for it. */
    structureSource: z.enum(["authored", "legacy_summary"]).default("authored"),
    title: z.string().max(TEXT_LIMITS.title).nullable().default(null),
    /** Overall goals, kept beside the steps rather than derived from them. */
    sessionTargets: z
      .object({
        durationMs: durationRange.nullable().default(null),
        distanceMetres: distanceRange.nullable().default(null),
        distanceUnit: writtenIn,
        effort: effortRange.nullable().default(null),
        /** An easy run's whole pace or zone, where it has no steps to carry one. */
        paceSecondsPerKm: paceRange.optional(),
        heartRateZones: zoneRange.optional(),
      })
      .default({ durationMs: null, distanceMetres: null, effort: null }),
    nodes: z.array(prescriptionNodeSchema).default([]),
    running: runningInstructionsSchema.nullable().default(null),
    /** A cycling or swimming instruction. It never inherits running's stop rule. */
    instructions: z.string().max(300).nullable().default(null),
    notes: z.string().max(TEXT_LIMITS.prescriptionNotes).nullable().default(null),
    /** The original payload a conversion read, kept so nothing is lost to a new shape. */
    legacy: z
      .object({ sourceVersion: z.string().max(40), payload: z.unknown() })
      .nullable()
      .default(null),
  })
  .superRefine((value, ctx) => {
    const allowed = ACTIONS_BY_SPORT[value.sport];
    const ids = new Set<string>();
    let authored = 0;
    let expanded = 0;

    const checkStep = (step: z.infer<typeof prescriptionStepSchema>, path: (string | number)[]) => {
      authored++;
      if (ids.has(step.id))
        ctx.addIssue({ code: "custom", message: "Step ids must be unique", path });
      ids.add(step.id);
      if (!allowed.includes(step.action))
        ctx.addIssue({
          code: "custom",
          message: `A ${value.sport} step cannot be "${step.action}"`,
          path: [...path, "action"],
        });
      if (step.stroke !== null && value.sport !== "swimming")
        ctx.addIssue({
          code: "custom",
          message: "Only a swim step has a stroke",
          path: [...path, "stroke"],
        });
      if (step.paceSecondsPerKm && (value.sport !== "running" || step.action === "rest"))
        ctx.addIssue({
          code: "custom",
          message: "Only a run or walk step has a pace target",
          path: [...path, "paceSecondsPerKm"],
        });
      if (
        step.target.kind === "distance" &&
        step.target.metres[1] > DISTANCE_METRES[value.sport].max
      )
        ctx.addIssue({
          code: "custom",
          message: "That distance is beyond what this sport allows",
          path: [...path, "target"],
        });
      // A zero-distance recovery is real — jog on the spot, tread water — but a zero-distance
      // work step asks for nothing at all.
      if (
        step.target.kind === "distance" &&
        step.target.metres[0] === 0 &&
        step.phase !== "recovery"
      )
        ctx.addIssue({
          code: "custom",
          message: "Only a recovery step may ask for no distance",
          path: [...path, "target"],
        });
    };

    value.nodes.forEach((node, index) => {
      if (node.kind === "step") {
        checkStep(node, ["nodes", index]);
        expanded += 1;
        return;
      }
      authored++;
      if (ids.has(node.id))
        ctx.addIssue({
          code: "custom",
          message: "Step ids must be unique",
          path: ["nodes", index],
        });
      ids.add(node.id);
      node.steps.forEach((step, stepIndex) =>
        checkStep(step, ["nodes", index, "steps", stepIndex]),
      );
      expanded += node.repetitions * node.steps.length;
    });

    if (authored > PRESCRIPTION_LIMITS.authoredNodes)
      ctx.addIssue({
        code: "custom",
        message: `Keep a session under ${PRESCRIPTION_LIMITS.authoredNodes} written steps`,
        path: ["nodes"],
      });
    if (expanded > PRESCRIPTION_LIMITS.expandedSteps)
      ctx.addIssue({
        code: "custom",
        message: `Repeats expand to more than ${PRESCRIPTION_LIMITS.expandedSteps} steps`,
        path: ["nodes"],
      });
    if (value.structureSource === "authored" && value.nodes.length === 0) {
      const { durationMs, distanceMetres } = value.sessionTargets;
      if (durationMs === null && distanceMetres === null)
        ctx.addIssue({
          code: "custom",
          message: "Give the session a target, or write out its steps",
          path: ["sessionTargets"],
        });
    }
    if (value.running !== null && value.sport !== "running")
      ctx.addIssue({
        code: "custom",
        message: "Only a running prescription carries running instructions",
        path: ["running"],
      });
    if (value.sessionTargets.paceSecondsPerKm && value.sport !== "running")
      ctx.addIssue({
        code: "custom",
        message: "Only a run has a pace target",
        path: ["sessionTargets", "paceSecondsPerKm"],
      });
    if (JSON.stringify(value).length > PRESCRIPTION_LIMITS.payloadBytes)
      ctx.addIssue({ code: "custom", message: "That session is too large to store", path: [] });
  });

export type PrescriptionStep = z.infer<typeof prescriptionStepSchema>;
export type PrescriptionRepeat = z.infer<typeof prescriptionRepeatSchema>;
export type PrescriptionNode = z.infer<typeof prescriptionNodeSchema>;
export type RunningInstructions = z.infer<typeof runningInstructionsSchema>;
export type EndurancePrescription = z.infer<typeof endurancePrescriptionSchema>;

export type PrescriptionResult =
  | { ok: true; value: EndurancePrescription }
  | { ok: false; problems: readonly { path: string; message: string }[] };

/** Parses a stored or submitted prescription without throwing at a caller who can report. */
export function parsePrescription(input: unknown): PrescriptionResult {
  const result = endurancePrescriptionSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

/** A minimal session with only overall targets, which is what most simple plans are. */
export function simplePrescription(
  sport: EnduranceSport,
  targets: {
    durationMs?: [number, number];
    distanceMetres?: [number, number];
    effort?: [number, number];
  },
): EndurancePrescription {
  return endurancePrescriptionSchema.parse({
    prescriptionVersion: PRESCRIPTION_VERSION,
    sport,
    sessionTargets: {
      durationMs: targets.durationMs ?? null,
      distanceMetres: targets.distanceMetres ?? null,
      effort: targets.effort ?? null,
    },
  });
}

export type ExpandedStep = PrescriptionStep & {
  /** Which repetition of its block this is; 1 for a step written on its own. */
  repetition: number;
  /** The block it came from, or null. */
  repeatId: string | null;
};

/** Every step in the order it is performed. Rests between repetitions are not steps. */
export function expandSteps(prescription: EndurancePrescription): ExpandedStep[] {
  const out: ExpandedStep[] = [];
  for (const node of prescription.nodes) {
    if (node.kind === "step") {
      out.push({ ...node, repetition: 1, repeatId: null });
      continue;
    }
    for (let repetition = 1; repetition <= node.repetitions; repetition++) {
      for (const step of node.steps) out.push({ ...step, repetition, repeatId: node.id });
    }
  }
  return out;
}

export type PrescriptionTotals = {
  /** Null when any step is measured the other way: no pace is invented to bridge them. */
  durationMs: number | null;
  distanceMetres: number | null;
  /** Prescribed rest between repetitions. A target, never a measurement of actual rest. */
  prescribedRestMs: number;
  steps: number;
};

/**
 * What the written session adds up to. A block of 8 × 50 m with 20 s between repetitions is
 * 400 m and 140 seconds of prescribed rest — seven gaps, not eight.
 */
export function prescriptionTotals(prescription: EndurancePrescription): PrescriptionTotals {
  const steps = expandSteps(prescription);
  let durationMs = 0;
  let distanceMetres = 0;
  let durationKnown = steps.length > 0;
  let distanceKnown = steps.length > 0;
  for (const step of steps) {
    if (step.target.kind === "duration") {
      durationMs += step.target.ms[1];
      distanceKnown = false;
    } else {
      distanceMetres += step.target.metres[1];
      durationKnown = false;
    }
  }
  let prescribedRestMs = 0;
  for (const node of prescription.nodes) {
    if (node.kind === "repeat" && node.restBetweenMs !== null)
      prescribedRestMs += node.restBetweenMs * (node.repetitions - 1);
  }
  return {
    durationMs: durationKnown ? durationMs : null,
    distanceMetres: distanceKnown ? distanceMetres : null,
    prescribedRestMs,
    steps: steps.length,
  };
}

/**
 * A duration target as a figure and its unit: "20" s for a stride, "25–30" min for a session.
 * Under a minute it is said in seconds, so twenty seconds never reads as "0 min".
 */
export function durationTargetParts(ms: number | readonly [number, number]): {
  figure: string;
  unit: string;
} {
  const [low, high] = typeof ms === "number" ? [ms, ms] : ms;
  const [scale, unit] = high < 60_000 ? [1000, "s"] : [60_000, "min"];
  const [from, to] = [low, high].map((value) => String(roundTo(value / scale, 1)));
  return { figure: from === to ? to! : `${from}–${to}`, unit };
}

/**
 * What a session asks for as one figure and its unit — "8 × 50" m, "5" km, "25–30" min — with
 * any distance in the reader's own unit for the sport. Null when it asks for nothing measurable.
 *
 * Its main work names it. A repeated block does, unless work written on its own is more of the
 * session (ADR 0059): an easy run with strides is its run, not its strides. Otherwise its overall
 * targets do, distance first; then its one work step, as a tempo is its twenty minutes and a race
 * its distance; and failing those, what its written steps add up to.
 */
export function prescriptionTarget(
  prescription: EndurancePrescription,
  units: SportUnits,
): { figure: string; unit: string } | null {
  const distance = (metres: number | readonly [number, number]) =>
    sportDistanceParts(metres, prescription.sport, units);
  const parts = (target: PrescriptionStep["target"]) =>
    target.kind === "distance" ? distance(target.metres) : durationTargetParts(target.ms);
  const work = prescription.nodes.filter(
    (node): node is PrescriptionStep => node.kind === "step" && node.phase === "work",
  );
  const block = prescription.nodes.find((node) => node.kind === "repeat");
  if (block && block.kind === "repeat" && block.steps[0] && !outweighs(work, block)) {
    const each = parts(block.steps[0].target);
    return { figure: `${block.repetitions} × ${each.figure}`, unit: each.unit };
  }
  const { distanceMetres, durationMs } = prescription.sessionTargets;
  if (distanceMetres) return distance(distanceMetres);
  if (durationMs) return durationTargetParts(durationMs);
  if (work.length === 1) return parts(work[0]!.target);
  const totals = prescriptionTotals(prescription);
  if (totals.distanceMetres) return distance(totals.distanceMetres);
  if (totals.durationMs) return durationTargetParts(totals.durationMs);
  return null;
}

/**
 * Whether work written on its own is more of the session than a block's work: 35 minutes easy
 * beside six 20-second strides, or 8 km beside them. Measured the same way they are compared;
 * measured differently, the work on its own is the session, as strides and drills are written
 * after a run and not instead of it.
 */
function outweighs(work: readonly PrescriptionStep[], block: PrescriptionRepeat): boolean {
  if (work.length === 0) return false;
  const kind = block.steps[0]!.target.kind;
  if (work.some((step) => step.target.kind !== kind)) return true;
  const amount = (step: PrescriptionStep) =>
    step.target.kind === "duration" ? step.target.ms[1] : step.target.metres[1];
  const reps = block.steps.filter((step) => step.phase === "work" && step.target.kind === kind);
  const blockWork = reps.reduce((sum, step) => sum + amount(step), 0) * block.repetitions;
  return work.some((step) => amount(step) > blockWork);
}

/** A one-line description for a card: "8 × 50 m", "25–30 min", "8.05 km". */
export function describePrescription(
  prescription: EndurancePrescription,
  units: SportUnits,
): string {
  const target = prescriptionTarget(prescription, units);
  return target ? `${target.figure} ${target.unit}` : "Session";
}
