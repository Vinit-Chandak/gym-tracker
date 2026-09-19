import { z } from "zod";

import { ENDURANCE_SPORTS, SWIM_STROKES } from "./activity";
import type { EnduranceSport } from "./activity";
import {
  DISTANCE_METRES,
  DURATION_MS,
  EFFORT,
  PRESCRIPTION_LIMITS,
  TEXT_LIMITS,
} from "./activity-limits";

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
// A target may legitimately be written from zero — the old programme sheet did — while an
// athlete's own reported effort is always 1–10. These are different questions.
const effortRange = range(z.number().min(0).max(EFFORT.max), "An effort range");

const stepTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("duration"), ms: durationRange }),
  z.object({ kind: z.literal("distance"), metres: distanceRange }),
]);

export const prescriptionStepSchema = z.object({
  kind: z.literal("step"),
  id: stepId,
  phase: z.enum(STEP_PHASES),
  action: z.enum(STEP_ACTIONS),
  /** One primary axis per step: a step is measured by time or by distance, not both. */
  target: stepTargetSchema,
  effort: effortRange.nullable().default(null),
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
        effort: effortRange.nullable().default(null),
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

/** A one-line description for a card: "8 × 50 m" or "30 minutes easy". */
export function describePrescription(prescription: EndurancePrescription): string {
  const block = prescription.nodes.find((node) => node.kind === "repeat");
  if (block && block.kind === "repeat") {
    const [first] = block.steps;
    if (first) {
      const target =
        first.target.kind === "distance"
          ? `${first.target.metres[1]} m`
          : `${Math.round(first.target.ms[1] / 60_000)} min`;
      return `${block.repetitions} × ${target}`;
    }
  }
  const { distanceMetres, durationMs } = prescription.sessionTargets;
  if (distanceMetres) return `${distanceMetres[1] / 1000} km`;
  if (durationMs) return `${Math.round(durationMs[1] / 60_000)} minutes`;
  const totals = prescriptionTotals(prescription);
  if (totals.distanceMetres !== null && totals.distanceMetres > 0)
    return `${totals.distanceMetres} m`;
  if (totals.durationMs !== null && totals.durationMs > 0)
    return `${Math.round(totals.durationMs / 60_000)} minutes`;
  return "Session";
}
