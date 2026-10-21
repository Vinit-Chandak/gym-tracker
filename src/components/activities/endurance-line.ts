import type { ActivitySport } from "@/domain/activity";
import { prescriptionTarget, type EndurancePrescription } from "@/domain/activity-prescription";
import { RUN_TYPE_LABELS } from "@/domain/run-types";
import type { SportUnits } from "@/lib/distance-units";
import { readsAs } from "@/lib/facts";

/**
 * An endurance session in a few words, as a list row says it (DESIGN.md, Today): its name as a
 * step names its action, what it asks for as one figure, and its own note on how to do it.
 */

const ENDURANCE_NAMES: Record<Exclude<ActivitySport, "strength">, string> = {
  running: "Run",
  cycling: "Ride",
  swimming: "Swim",
};

/** "Run", "Ride", "Swim": the row's name, as a step names its action. */
export function enduranceName(sport: ActivitySport): string {
  return sport === "strength" ? "Strength" : ENDURANCE_NAMES[sport];
}

/**
 * "Log run", "Log ride", "Log swim": logging a session names its sport, on Today's card and on
 * the session's page alike, so three cards never share a name.
 */
export const LOG_LABEL: Record<Exclude<ActivitySport, "strength">, string> = {
  running: "Log run",
  cycling: "Log ride",
  swimming: "Log swim",
};

/**
 * What a session asks for as one figure and its unit: "25–30" min, "5" km, "8 × 400" m, with
 * distances in the athlete's own unit. Null when it asks for nothing measurable, and the row
 * says only its name. The same reading as `describePrescription`, so a card's figure and its
 * words never disagree.
 */
export function enduranceTarget(
  prescription: EndurancePrescription | null,
  units: SportUnits,
): { figure: string; unit: string } | null {
  return prescription ? prescriptionTarget(prescription, units) : null;
}

/**
 * What a planned session is called wherever it is named (ADR 0059): its own name, else the kind
 * of run it is, else its sport ("Tempo run", "Intervals", "Run"). A name that only repeats its
 * figure ("6 × 800 m") names nothing, so the kind of run does, and the figure stands beside it.
 */
export function plannedName(
  prescription: EndurancePrescription | null,
  sport: ActivitySport,
  units: SportUnits,
): string {
  const title = prescription?.title;
  const target = enduranceTarget(prescription, units);
  if (title && !(target && readsAs(title, `${target.figure} ${target.unit}`))) return title;
  const runType = prescription?.running?.sessionType;
  return runType ? RUN_TYPE_LABELS[runType] : enduranceName(sport);
}

/** The session's own word on how to do it: the pace note, else its notes or instruction. */
export function enduranceNote(prescription: EndurancePrescription | null): string | null {
  if (!prescription) return null;
  return (
    prescription.running?.paceNote ??
    prescription.running?.note ??
    prescription.instructions ??
    prescription.notes ??
    null
  );
}
