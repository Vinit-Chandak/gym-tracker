import type { ActivitySport } from "@/domain/activity";
import { prescriptionTotals, type EndurancePrescription } from "@/domain/activity-prescription";

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

const minutes = (ms: number) => Math.round(ms / 60_000);

/**
 * What a session asks for as one figure and its unit: "25–30" min, "5" km, "8 × 400" m. Null
 * when it asks for nothing measurable, and the row says only its name.
 */
export function enduranceTarget(
  prescription: EndurancePrescription | null,
): { figure: string; unit: string } | null {
  if (!prescription) return null;
  const block = prescription.nodes.find((node) => node.kind === "repeat");
  if (block && block.kind === "repeat" && block.steps[0]) {
    const target = block.steps[0].target;
    return target.kind === "distance"
      ? { figure: `${block.repetitions} × ${target.metres[1]}`, unit: "m" }
      : { figure: `${block.repetitions} × ${minutes(target.ms[1])}`, unit: "min" };
  }
  const { durationMs, distanceMetres } = prescription.sessionTargets;
  if (distanceMetres) {
    const [low, high] = distanceMetres.map((m) => m / 1000);
    return { figure: low === high ? `${high}` : `${low}–${high}`, unit: "km" };
  }
  if (durationMs) {
    const [low, high] = durationMs.map(minutes) as [number, number];
    return { figure: low === high ? `${high}` : `${low}–${high}`, unit: "min" };
  }
  const totals = prescriptionTotals(prescription);
  if (totals.distanceMetres) return { figure: `${totals.distanceMetres}`, unit: "m" };
  if (totals.durationMs) return { figure: `${minutes(totals.durationMs)}`, unit: "min" };
  return null;
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

/** A session's time, for the length of its run's track: the most it asks for. */
export function enduranceMinutes(prescription: EndurancePrescription | null): number | undefined {
  if (!prescription) return undefined;
  const asked = prescription.sessionTargets.durationMs?.[1];
  if (asked) return minutes(asked);
  const total = prescriptionTotals(prescription).durationMs;
  return total ? minutes(total) : undefined;
}
