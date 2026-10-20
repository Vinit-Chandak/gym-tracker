import { PRESCRIBED_EFFORT } from "@/domain/activity-limits";
import { formatPaceSeconds, pacePerUnit } from "@/domain/activity-metrics";
import {
  durationTargetParts,
  type EndurancePrescription,
  type PrescriptionStep,
} from "@/domain/activity-prescription";
import { zoneRangeBeats, zoneRangeLabel, type HeartRateZone } from "@/domain/heart-rate";
import { formatSportDistance, type SportUnits } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures } from "@/lib/facts";

/**
 * A structured session as a plan reads it (ADR 0059): one line per step and one per repeated
 * block, never one per repetition. "6 × 800 m @ 4:05–4:15 /km, 2 min jog" is the session; the
 * same twelve lines written out, rep by rep, were a list to count rather than a session to read.
 *
 * Pace is said per the athlete's own unit, and a heart-rate zone in their own beats when their
 * zones are known: zone 2 is a number on a watch, not a word.
 */

export const PHASE_WORDS = {
  warmup: "Warm-up",
  work: "Work",
  recovery: "Recovery",
  cooldown: "Cool-down",
} as const;

/** "4:05–4:15 /km": a pace range in the athlete's unit, fastest first. */
export function paceRangeLine(
  [fast, slow]: readonly [number, number],
  units: Pick<SportUnits, "distanceUnit">,
): string {
  const unit = units.distanceUnit;
  const [from, to] = [fast, slow].map((seconds) => formatPaceSeconds(pacePerUnit(seconds, unit)));
  return `${from === to ? to : `${from}–${to}`}\u00a0/${unit}`;
}

/** "Zone 2 (114–132 bpm)", or "Zone 2" where the athlete's zones are not known. */
export function zoneLine(
  zones: readonly [number, number],
  heartRateZones: readonly HeartRateZone[] | null,
): string {
  const beats = heartRateZones ? zoneRangeBeats(zones, heartRateZones) : null;
  return beats
    ? `${zoneRangeLabel(zones)} (${beats[0]}–${beats[1]}\u00a0bpm)`
    : zoneRangeLabel(zones);
}

function targetLine(
  step: PrescriptionStep,
  sport: EndurancePrescription["sport"],
  units: SportUnits,
) {
  if (step.target.kind === "distance") return formatSportDistance(step.target.metres, sport, units);
  const { figure, unit } = durationTargetParts(step.target.ms);
  return `${figure}\u00a0${unit}`;
}

/** A recovery run is a jog, and says so; everything else is named by what it is. */
function actionWord(step: PrescriptionStep): string {
  if (step.action === "rest") return "Rest";
  if (step.action === "walk") return "Walk";
  if (step.action === "run") return step.phase === "recovery" ? "Jog" : "Run";
  return step.action === "ride" ? "Ride" : "Swim";
}

/** "800 m @ 4:05–4:15 /km · Zone 4": one step's how much and how hard. */
export function stepTargetLine(
  step: PrescriptionStep,
  sport: EndurancePrescription["sport"],
  units: SportUnits,
  heartRateZones: readonly HeartRateZone[] | null = null,
): string {
  let line = targetLine(step, sport, units);
  if (step.paceSecondsPerKm) line += ` @ ${paceRangeLine(step.paceSecondsPerKm, units)}`;
  const parts = [holdFigures(line)];
  if (step.heartRateZones) parts.push(zoneLine(step.heartRateZones, heartRateZones));
  if (step.effort) {
    const [low, high] = step.effort;
    parts.push(
      holdFigures(
        `Effort ${low === high ? high : `${low}–${high}`} of\u00a0${PRESCRIBED_EFFORT.max}`,
      ),
    );
  }
  if (step.stroke && step.stroke !== "unspecified") parts.push(step.stroke);
  return parts.join(FACT_SEPARATOR);
}

export type StructureLine = {
  /** "Warm-up", "6 ×", "Cool-down": what the line is, in the plan's words. */
  lead: string;
  text: string;
  notes: string[];
};

/**
 * The session's steps, a line each, a repeated block as one line: its repetitions, then each of
 * its steps joined, then the rest between repetitions where the plan gives one.
 */
export function structureLines(
  prescription: EndurancePrescription,
  units: SportUnits,
  heartRateZones: readonly HeartRateZone[] | null = null,
): StructureLine[] {
  return prescription.nodes.map((node) => {
    if (node.kind === "step")
      return {
        lead: PHASE_WORDS[node.phase],
        text: `${actionWord(node)} ${stepTargetLine(node, prescription.sport, units, heartRateZones)}`,
        notes: node.notes ? [node.notes] : [],
      };
    const steps = node.steps.map(
      (step) =>
        `${actionWord(step)} ${stepTargetLine(step, prescription.sport, units, heartRateZones)}`,
    );
    const rest =
      node.restBetweenMs === null || node.restBetweenMs === 0
        ? null
        : (() => {
            const { figure, unit } = durationTargetParts(node.restBetweenMs);
            return `${figure}\u00a0${unit} rest between`;
          })();
    return {
      lead: `${node.repetitions}\u00a0×`,
      text: [steps.join(", "), rest].filter(Boolean).join(FACT_SEPARATOR),
      notes: node.steps.flatMap((step) => (step.notes ? [step.notes] : [])),
    };
  });
}

/** An easy run's whole-session pace and zone, where it has no steps to carry them. */
export function sessionIntensityLine(
  prescription: EndurancePrescription,
  units: SportUnits,
  heartRateZones: readonly HeartRateZone[] | null = null,
): string | null {
  const { paceSecondsPerKm, heartRateZones: zones } = prescription.sessionTargets;
  const parts = [
    paceSecondsPerKm ? holdFigures(`@ ${paceRangeLine(paceSecondsPerKm, units)}`) : null,
    zones ? zoneLine(zones, heartRateZones) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(FACT_SEPARATOR) : null;
}
