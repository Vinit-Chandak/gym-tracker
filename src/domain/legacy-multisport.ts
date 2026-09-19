import { toMetres } from "@/lib/distance-units";

import {
  legacyEffort,
  type ActivityOutcome,
  type ActivitySourceKind,
  type Effort,
  type RunningEnvironment,
  type TimeZoneSource,
} from "./activity";
import { endurancePrescriptionSchema, type EndurancePrescription } from "./activity-prescription";
import type { RunningActualV1 } from "./activity-metrics";
import { addDays, isoWeekday, todayInTimeZone } from "./program-calendar";

/**
 * Reading what the old model wrote, without changing what it said (plan §10.2).
 *
 * Every function here is pure and one-directional: it decodes a legacy row into the canonical
 * shape and keeps the original beside it. Nothing is normalised on the way through — an
 * unconfirmed effort stays unconfirmed, a zero distance stays zero, a value past a new bound
 * stays past it, and a run's metres are not re-expressed in a unit nobody recorded. A
 * kilometre formatter in an old screen is not evidence that kilometres were typed.
 */

export type LegacyRunRow = {
  id: string;
  userId: string;
  mode: RunningEnvironment;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number;
  rpe: number | null;
  effortReported: boolean;
  surface: string | null;
  notes: string | null;
  programRunId: string | null;
  workoutSessionId: string | null;
  gymId: string | null;
};

export type CanonicalActivityDraft = {
  id: string;
  userId: string;
  sport: "running";
  status: "completed";
  outcome: ActivityOutcome;
  startedAt: Date;
  recordedTimeZone: string;
  timeZoneSource: TimeZoneSource;
  occurredOn: string;
  durationMs: number;
  effort: Effort;
  title: string | null;
  notes: string | null;
  sourceKind: ActivitySourceKind;
  sourceReference: string;
  details: RunningActualV1;
  /** The legacy links, preserved only where they are owner-consistent. */
  legacyLinks: {
    programRunId: string | null;
    workoutSessionId: string | null;
    gymId: string | null;
  };
};

/**
 * A raw run as a canonical activity.
 *
 * The zone is the account's, and it is labelled as inferred at migration: the app never
 * recorded which zone the athlete was in when they ran, and pretending otherwise would make a
 * guess look like a fact. The entered unit is unknown for the same reason, so only the metres
 * that were actually stored are carried over.
 */
export function legacyRunToActivity(
  run: LegacyRunRow,
  profile: { timeZone: string },
): CanonicalActivityDraft {
  const occurredOn = todayInTimeZone(profile.timeZone, run.startedAt);
  return {
    id: run.id,
    userId: run.userId,
    sport: "running",
    status: "completed",
    outcome: "logged",
    startedAt: run.startedAt,
    recordedTimeZone: profile.timeZone,
    timeZoneSource: "legacy_profile_snapshot",
    occurredOn,
    durationMs: run.durationSeconds * 1000,
    effort: legacyEffort(run.rpe, run.effortReported),
    title: null,
    notes: run.notes,
    sourceKind: "legacy_manual",
    sourceReference: `runs:${run.id}`,
    details: {
      sport: "running",
      environment: run.mode,
      // Metres exactly as stored; the original entry unit was never recorded.
      distance: { value: run.distanceMeters, unit: "m" as const, metres: run.distanceMeters },
      durationMs: run.durationSeconds * 1000,
      surface: run.surface,
      elevationGainMetres: null,
      treadmillInclinePercent: null,
      averageHeartRate: null,
      maxHeartRate: null,
      cadenceStepsPerMinute: null,
    },
    legacyLinks: {
      programRunId: run.programRunId,
      workoutSessionId: run.workoutSessionId,
      gymId: run.gymId,
    },
  };
}

export type LegacyProgramRunRow = {
  id: string;
  programId: string;
  weekIndex: number;
  dayOfWeek: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  distanceMinKm: number | null;
  distanceMaxKm: number | null;
  rpeMin: number | null;
  rpeMax: number | null;
  paceNote: string | null;
  progressionNote: string | null;
  stopRule: string | null;
  comment: string | null;
};

/**
 * A planned run as a prescription.
 *
 * Its structure source is `legacy_summary`: the old row said "25–35 minutes, 4–5 km, RPE 3–5"
 * and nothing about intervals, so no steps are written. The four pieces of running prose keep
 * their own fields rather than being flattened into one note — a pace cue, a progression, a
 * stop rule and a comment are different instructions, and a generic shape that loses three of
 * them is not a conversion (AT-STRUCT-09).
 */
export function legacyProgramRunToPrescription(row: LegacyProgramRunRow): EndurancePrescription {
  const distance =
    row.distanceMinKm !== null && row.distanceMaxKm !== null
      ? ([toMetres(row.distanceMinKm, "km"), toMetres(row.distanceMaxKm, "km")] as [number, number])
      : null;
  const effort =
    row.rpeMin !== null && row.rpeMax !== null
      ? ([row.rpeMin, row.rpeMax] as [number, number])
      : null;
  return endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    structureSource: "legacy_summary",
    sessionTargets: {
      durationMs: [row.durationMinMinutes * 60_000, row.durationMaxMinutes * 60_000],
      distanceMetres: distance,
      effort,
    },
    nodes: [],
    running: {
      paceNote: emptyToNull(row.paceNote),
      progressionNote: emptyToNull(row.progressionNote),
      symptomStopRule: emptyToNull(row.stopRule),
      note: emptyToNull(row.comment),
    },
    legacy: { sourceVersion: "program_runs:v1", payload: row },
  });
}

function emptyToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The date a planned run was meant for.
 *
 * The old row said "week 3, Wednesday", which is only a date once the programme's start is
 * known. Weeks run from the start date, as the rest of the calendar maths does, so a
 * programme that began on a Tuesday has its first week end the following Monday.
 */
export function legacyPlannedDate(startDate: string, weekIndex: number, dayOfWeek: number): string {
  const weekStart = addDays(startDate, (weekIndex - 1) * 7);
  const offset = (dayOfWeek - isoWeekday(weekStart) + 7) % 7;
  return addDays(weekStart, offset);
}

/**
 * Deterministic identity for a canonical row derived from a legacy source.
 *
 * A run keeps its own UUID wherever that id is free, so stored links, evidence and bookmarks
 * still resolve. When two source tables collide on one id, the target is minted and recorded
 * in the migration ledger; every caller reads the ledger rather than deriving an id again.
 */
export function canonicalActivityId(source: {
  kind: "runs" | "workout_sessions";
  id: string;
  collides: boolean;
}): { id: string; minted: boolean } {
  if (!source.collides) return { id: source.id, minted: false };
  return { id: crypto.randomUUID(), minted: true };
}

/** `run:<uuid>` evidence keeps resolving through the ledger; the string is never rewritten. */
export function legacyRunEvidenceId(runId: string): string {
  return `run:${runId}`;
}
