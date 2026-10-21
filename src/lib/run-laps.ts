import {
  expandSteps,
  type EndurancePrescription,
  type StepPhase,
} from "@/domain/activity-prescription";
import type { RunningLap } from "@/domain/activity-metrics";
import { fromMetres, roundTo, type DistanceUnit } from "@/lib/distance-units";

/**
 * Laps as the run form posts them and a saved run restores them (ADR 0059): one JSON list in a
 * hidden field, each lap's figures already read from what was typed. The server checks the
 * shape and `validateActual` the bounds, as for every other measurement.
 */
export type LapUnit = "m" | "km" | "mi";

export type PostedLap = {
  phase: StepPhase | null;
  distanceValue: number | null;
  distanceUnit: LapUnit;
  durationMs: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
};

const LAP_UNITS: readonly LapUnit[] = ["m", "km", "mi"];

/** A saved run's laps, in the units they were typed in, for its correction form. */
export function postedLaps(laps: readonly RunningLap[]): PostedLap[] {
  return laps.map((lap) => ({
    phase: lap.phase,
    distanceValue: lap.distance?.value ?? null,
    distanceUnit:
      lap.distance && (LAP_UNITS as readonly string[]).includes(lap.distance.unit)
        ? (lap.distance.unit as LapUnit)
        : "m",
    durationMs: lap.durationMs,
    averageHeartRate: lap.averageHeartRate,
    maxHeartRate: lap.maxHeartRate,
  }));
}

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** The posted list read back leniently, for a form reopening it: anything unreadable is dropped. */
export function readPostedLaps(json: string | undefined): PostedLap[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): PostedLap[] => {
      if (!entry || typeof entry !== "object") return [];
      const lap = entry as Record<string, unknown>;
      return [
        {
          phase:
            lap.phase === "warmup" ||
            lap.phase === "work" ||
            lap.phase === "recovery" ||
            lap.phase === "cooldown"
              ? lap.phase
              : null,
          distanceValue: number(lap.distanceValue),
          distanceUnit: (LAP_UNITS as readonly unknown[]).includes(lap.distanceUnit)
            ? (lap.distanceUnit as LapUnit)
            : "m",
          durationMs: number(lap.durationMs),
          averageHeartRate: number(lap.averageHeartRate),
          maxHeartRate: number(lap.maxHeartRate),
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * What a planned session's laps would be, one per step in the order they are run, the rest
 * between repetitions included: the shape a watch would record. Only the shape — the phase and
 * what each step asks for, to show beside an empty field — and never a figure to save: a
 * prescription is not a performance (ACTUAL-01).
 */
export type PlannedLap = {
  phase: StepPhase;
  /** "800 m", "2:00": the step's own target, said the way the field takes it. */
  asked: { distanceValue: number; distanceUnit: LapUnit } | { durationMs: number };
};

export function plannedLaps(
  prescription: EndurancePrescription | null,
  readIn: DistanceUnit,
): PlannedLap[] {
  if (!prescription || prescription.sport !== "running") return [];
  const laps: PlannedLap[] = [];
  const steps = expandSteps(prescription);
  steps.forEach((step, index) => {
    const asked: PlannedLap["asked"] =
      step.target.kind === "duration"
        ? { durationMs: step.target.ms[1] }
        : step.target.metres[1] < 1000 || step.target.unit === "m"
          ? { distanceValue: roundTo(step.target.metres[1], 1), distanceUnit: "m" }
          : {
              distanceValue: roundTo(fromMetres(step.target.metres[1], readIn), 2),
              distanceUnit: readIn,
            };
    laps.push({ phase: step.phase, asked });
    // The prescribed rest between repetitions is a lap on a watch too, standing still or jogging.
    const next = steps[index + 1];
    const block =
      step.repeatId === null
        ? null
        : prescription.nodes.find((node) => node.kind === "repeat" && node.id === step.repeatId);
    if (
      block &&
      block.kind === "repeat" &&
      block.restBetweenMs &&
      next?.repeatId === step.repeatId &&
      next.repetition !== step.repetition
    )
      laps.push({ phase: "recovery", asked: { durationMs: block.restBetweenMs } });
  });
  return laps;
}
