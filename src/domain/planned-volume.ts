import { formatSportDistance, toMetres, type SportUnits } from "@/lib/distance-units";

import type { EnduranceSport } from "./activity";
import { expandSteps, type EndurancePrescription } from "./activity-prescription";

/**
 * How much a week of endurance sessions asks for (ADR 0059): the distance of what is measured by
 * distance and the time of what is measured only by time, kept apart. A running plan is read
 * week by week by its distance, and a timed run has no distance to add: it is counted as time
 * rather than converted at a guessed pace.
 *
 * A session with a whole-session distance counts that (its upper end, as a plan's weekly total
 * is read). Otherwise each written step counts the way it is measured — a tempo's warm-up
 * kilometres as distance and its twenty minutes as time — and a session of no steps its time.
 */
export type PlannedVolume = { sessions: number; metres: number; timedMs: number };

export function plannedVolume(
  prescriptions: readonly (EndurancePrescription | null)[],
): PlannedVolume {
  let metres = 0;
  let timedMs = 0;
  for (const prescription of prescriptions) {
    if (!prescription) continue;
    const targets = prescription.sessionTargets;
    if (targets.distanceMetres) {
      metres += targets.distanceMetres[1];
      continue;
    }
    if (prescription.nodes.length === 0) {
      timedMs += targets.durationMs?.[1] ?? 0;
      continue;
    }
    for (const step of expandSteps(prescription)) {
      if (step.target.kind === "distance") metres += step.target.metres[1];
      else timedMs += step.target.ms[1];
    }
  }
  return { sessions: prescriptions.length, metres, timedMs };
}

/** "18.6 km + 70 min": the distance and the time, either alone where it is all there is. */
export function plannedVolumeLine(
  volume: PlannedVolume,
  sport: EnduranceSport,
  units: SportUnits,
): string | null {
  // A week is read to a tenth of a kilometre or mile, as its distance is planned to no finer.
  const reading = sport === "swimming" ? units.poolUnit : units.distanceUnit;
  const step = toMetres(reading === "km" || reading === "mi" ? 0.1 : 1, reading);
  const parts = [
    volume.metres > 0
      ? formatSportDistance(Math.round(volume.metres / step) * step, sport, units)
      : null,
    volume.timedMs > 0 ? `${Math.round(volume.timedMs / 60_000)} min` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" + ") : null;
}
