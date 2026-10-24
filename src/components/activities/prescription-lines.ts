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

/**
 * Whether `text` already says `part`, read as `readsAs` reads text: the joiners and fixed spaces
 * that hold figures together set aside, case aside. A line under a name leaves out what the name
 * says ("Long run 4.5 mi" over "45 min", never over "Long run · 4.5 mi").
 */
export function alreadySays(text: string | null | undefined, part: string): boolean {
  const read = (value: string) =>
    value
      .replace(/\u2060/g, "")
      .replace(/\s+/gu, " ")
      .trim()
      .toLocaleLowerCase();
  const said = read(part);
  return said !== "" && read(text ?? "").includes(said);
}

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
  // Each range held at its dash where the line wraps: never "(122–" over "148 bpm)".
  return holdFigures(
    beats ? `${zoneRangeLabel(zones)} (${beats[0]}–${beats[1]}\u00a0bpm)` : zoneRangeLabel(zones),
  );
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
  kind: "step" | "repeat";
  /** "Warm-up", "6 ×", "Cool-down": what the line is, in the plan's words. */
  lead: string;
  /** What each step of the line asks, with its own note: one for a step, a block's in turn. */
  parts: { text: string; note: string | null }[];
  /** The rest between a block's repetitions, where the plan gives one. */
  rest: string | null;
  /** The line as one, for a list with room for a line a step. */
  text: string;
  notes: string[];
};

/** What a screen already says of the whole session over its steps. */
export type SaidTargets = Pick<
  EndurancePrescription["sessionTargets"],
  "effort" | "paceSecondsPerKm" | "heartRateZones"
>;

const sameRange = (
  a: readonly number[] | null | undefined,
  b: readonly number[] | null | undefined,
) => Boolean(a && b && a[0] === b[0] && a[1] === b[1]);

/** A step without the pace, zone or effort the session's own line already says (ADR 0063). */
function unsaid(step: PrescriptionStep, said: SaidTargets | null): PrescriptionStep {
  if (!said) return step;
  return {
    ...step,
    effort: sameRange(step.effort, said.effort) ? null : step.effort,
    paceSecondsPerKm: sameRange(step.paceSecondsPerKm, said.paceSecondsPerKm)
      ? undefined
      : step.paceSecondsPerKm,
    heartRateZones: sameRange(step.heartRateZones, said.heartRateZones)
      ? undefined
      : step.heartRateZones,
  };
}

/**
 * The session's steps, a line each, a repeated block as one line: its repetitions, then each of
 * its steps joined, then the rest between repetitions where the plan gives one. A screen that
 * says the session's own pace, zone and effort above its steps passes them as `said`, and a step
 * asking the same says it once, there ("Run 24–28 min", not "Run 24–28 min @ 7:30–8:50 /km ·
 * Effort 1–2 of 5" under "Effort 1–2 of 5 @ 7:30–8:50 /km").
 */
export function structureLines(
  prescription: EndurancePrescription,
  units: SportUnits,
  heartRateZones: readonly HeartRateZone[] | null = null,
  said: SaidTargets | null = null,
): StructureLine[] {
  const part = (written: PrescriptionStep) => {
    const step = unsaid(written, said);
    return {
      text: `${actionWord(step)} ${stepTargetLine(step, prescription.sport, units, heartRateZones)}`,
      note: step.notes,
    };
  };
  return prescription.nodes.map((node) => {
    if (node.kind === "step") {
      const only = part(node);
      return {
        kind: "step",
        lead: PHASE_WORDS[node.phase],
        parts: [only],
        rest: null,
        text: only.text,
        notes: node.notes ? [node.notes] : [],
      };
    }
    const parts = node.steps.map(part);
    const rest =
      node.restBetweenMs === null || node.restBetweenMs === 0
        ? null
        : (() => {
            const { figure, unit } = durationTargetParts(node.restBetweenMs);
            return `${figure}\u00a0${unit} rest between`;
          })();
    return {
      kind: "repeat",
      lead: `${node.repetitions}\u00a0×`,
      parts,
      rest,
      text: [parts.map((entry) => entry.text).join(", "), rest]
        .filter(Boolean)
        .join(FACT_SEPARATOR),
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
