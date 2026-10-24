import { formatSportDistance, toMetres, type SportUnits } from "@/lib/distance-units";

import type { EnduranceSport } from "./activity";
import { expandSteps, type EndurancePrescription } from "./activity-prescription";

/**
 * How much a week of endurance sessions asks for, as one distance where it can be (ADR 0063).
 *
 * A running plan is read week by week by its distance, and a timed run that carries a pace has a
 * distance too: its time at the middle of the pace the plan sets for it. That is the plan's own
 * number, not a guess, so a week of timed easy runs and a long run by distance reads "≈ 16 km",
 * said to be approximate, rather than "8 km + 74 min", which nobody can compare with last week's
 * (ADR 0059 kept the two apart). Running the plan gives no pace of its own (a warm-up by zone, a
 * stride) is read at the plan's easiest pace, which undercounts it if anything. A plan with no
 * pace anywhere, and every ride or swim measured by time, still counts time; walks and rests
 * inside a run are no distance, and count only in a week that reads in time.
 *
 * A session with a whole-session distance counts that (its upper end, as a plan's weekly total
 * is read). Otherwise each written step counts the way it is measured, and a session of no steps
 * its whole-session time: the upper end of every time, at the middle of its pace.
 */
export type PlannedVolume = {
  sessions: number;
  /** What is measured by distance. */
  metres: number;
  /** Timed running, at the middle of the pace it was given. */
  pacedMetres: number;
  /** Time with nothing to make it a distance: a run with no pace, a ride or swim by time. */
  timedMs: number;
  /** Walks and rests inside runs: no distance, and time only in a week that reads in time. */
  asideMs: number;
};

type Pace = readonly [number, number];

/** Metres covered in `ms` at the middle of a pace range given in seconds a kilometre. */
function metresAt(ms: number, pace: Pace): number {
  return ms / ((pace[0] + pace[1]) / 2);
}

/**
 * The easiest pace a plan gives anywhere, a session's or a run step's: what its running with no
 * pace of its own is read at. Null when it gives none, and its timed running stays time.
 */
export function planPace(prescriptions: readonly (EndurancePrescription | null)[]): Pace | null {
  let easiest: Pace | null = null;
  for (const prescription of prescriptions) {
    if (!prescription) continue;
    const paces = [
      prescription.sessionTargets.paceSecondsPerKm,
      ...expandSteps(prescription).map((step) =>
        step.action === "run" ? step.paceSecondsPerKm : undefined,
      ),
    ];
    for (const pace of paces)
      if (pace && (!easiest || pace[0] + pace[1] > easiest[0] + easiest[1])) easiest = pace;
  }
  return easiest;
}

/** `planPace` reads the whole plan's sessions, so every week of it reads the same way. */
export function plannedVolume(
  prescriptions: readonly (EndurancePrescription | null)[],
  planEasyPace: Pace | null = planPace(prescriptions),
): PlannedVolume {
  const volume: PlannedVolume = {
    sessions: prescriptions.length,
    metres: 0,
    pacedMetres: 0,
    timedMs: 0,
    asideMs: 0,
  };
  for (const prescription of prescriptions) {
    if (!prescription) continue;
    const targets = prescription.sessionTargets;
    if (targets.distanceMetres) {
      volume.metres += targets.distanceMetres[1];
      continue;
    }
    const running = prescription.sport === "running";
    if (prescription.nodes.length === 0) {
      const ms = targets.durationMs?.[1] ?? 0;
      const pace = targets.paceSecondsPerKm ?? (running ? planEasyPace : null);
      if (pace) volume.pacedMetres += metresAt(ms, pace);
      else volume.timedMs += ms;
      continue;
    }
    for (const step of expandSteps(prescription)) {
      if (step.target.kind === "distance") {
        volume.metres += step.target.metres[1];
        continue;
      }
      const ms = step.target.ms[1];
      if (step.action === "walk" || step.action === "rest") {
        volume.asideMs += ms;
        continue;
      }
      // A stride or a warm-up with no pace of its own: the session's, else the plan's easiest.
      const pace =
        step.action === "run"
          ? (step.paceSecondsPerKm ?? targets.paceSecondsPerKm ?? planEasyPace)
          : null;
      if (pace) volume.pacedMetres += metresAt(ms, pace);
      else volume.timedMs += ms;
    }
  }
  return volume;
}

/**
 * "≈ 16 km" where some of it came from a pace, read to the whole kilometre or mile; "18.6 km"
 * where all of it was asked for by distance, to the tenth it is planned to; "+ 40 min" beside
 * either for time that has no distance; and the week's time alone where it has no distance.
 */
export function plannedVolumeLine(
  volume: PlannedVolume,
  sport: EnduranceSport,
  units: SportUnits,
): string | null {
  const reading = sport === "swimming" ? units.poolUnit : units.distanceUnit;
  const distance = volume.metres + volume.pacedMetres;
  const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`;
  if (distance <= 0) {
    const ms = volume.timedMs + volume.asideMs;
    return ms > 0 ? minutes(ms) : null;
  }
  const approximate = volume.pacedMetres > 0;
  // A week by distance is read to a tenth, as it is planned to no finer; from a pace, whole.
  const step = toMetres(
    reading === "km" || reading === "mi" ? (approximate ? 1 : 0.1) : 1,
    reading,
  );
  const figure = formatSportDistance(Math.round(distance / step) * step, sport, units);
  const parts = [
    approximate ? `≈ ${figure}` : figure,
    volume.timedMs > 0 ? minutes(volume.timedMs) : null,
  ].filter((part) => part !== null);
  return parts.join(" + ");
}
