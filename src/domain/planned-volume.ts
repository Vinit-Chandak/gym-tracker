import { prescriptionTotals, type EndurancePrescription } from "./activity-prescription";

/**
 * How much a week of endurance sessions asks for (ADR 0059): the distance of the sessions
 * measured by distance, and the time of the ones measured only by time, kept apart. A running
 * plan is read week by week by its distance, and a timed session has no distance to add: it is
 * counted as time rather than converted at a guessed pace.
 *
 * A session's distance is its whole-session target where it gives one (its upper end, as a
 * plan's weekly total is read), otherwise what its steps add up to.
 */
export type PlannedVolume = { sessions: number; metres: number; timedMs: number };

export function plannedDistanceMetres(prescription: EndurancePrescription): number | null {
  const target = prescription.sessionTargets.distanceMetres;
  if (target) return target[1];
  return prescriptionTotals(prescription).distanceMetres;
}

export function plannedVolume(
  prescriptions: readonly (EndurancePrescription | null)[],
): PlannedVolume {
  let metres = 0;
  let timedMs = 0;
  for (const prescription of prescriptions) {
    if (!prescription) continue;
    const distance = plannedDistanceMetres(prescription);
    if (distance !== null) {
      metres += distance;
      continue;
    }
    const duration =
      prescription.sessionTargets.durationMs?.[1] ?? prescriptionTotals(prescription).durationMs;
    if (duration !== null) timedMs += duration;
  }
  return { sessions: prescriptions.length, metres, timedMs };
}
