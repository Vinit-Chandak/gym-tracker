import type { TrainingSport } from "./sport-scope";

/**
 * What an activity is, across every sport (plan §§2.2, 4.2, 6.4).
 *
 * One bout of training has one sport, one owner and one identity. The sport is fixed at the
 * moment it is saved: correcting a swim that was logged as a ride is a deletion and a new
 * log, not a relabelling, because the measurements underneath mean different things (LIFE-04).
 *
 * The canonical sport names differ on purpose from the legacy `workout`/`run` discriminators
 * that the shared tables and the v1 API still use. Old readers keep their old names; the
 * mapping between them is explicit here and nowhere else.
 */

export const ACTIVITY_SPORTS = ["strength", "running", "cycling", "swimming"] as const;
export type ActivitySport = (typeof ACTIVITY_SPORTS)[number];

export const ENDURANCE_SPORTS = ["running", "cycling", "swimming"] as const;
export type EnduranceSport = (typeof ENDURANCE_SPORTS)[number];

export const ACTIVITY_SPORT_LABELS: Record<ActivitySport, string> = {
  strength: "Strength",
  running: "Running",
  cycling: "Cycling",
  swimming: "Swimming",
};

export function isActivitySport(value: unknown): value is ActivitySport {
  return typeof value === "string" && (ACTIVITY_SPORTS as readonly string[]).includes(value);
}

export function isEnduranceSport(sport: ActivitySport): sport is EnduranceSport {
  return sport !== "strength";
}

/** The legacy discriminator for a sport, or null where the old model had no name for it. */
export function legacySportOf(sport: ActivitySport): TrainingSport | null {
  if (sport === "strength") return "workout";
  if (sport === "running") return "run";
  return null;
}

/** The canonical name of a legacy discriminator. Total: the old enum had only two values. */
export function sportOfLegacy(sport: TrainingSport): ActivitySport {
  return sport === "workout" ? "strength" : "running";
}

/** Old social filters still arrive as `workout`/`run`; unknown text is not guessed at. */
export function sportFromParam(value: string | null | undefined): ActivitySport | null {
  if (!value) return null;
  if (isActivitySport(value)) return value;
  if (value === "workout") return "strength";
  if (value === "run") return "running";
  return null;
}

/** A parent exists while a strength session is open; endurance is only ever saved complete. */
export const ACTIVITY_STATUSES = ["in_progress", "completed"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Saving closes the occurrence either way. Whether the targets were met is a separate fact. */
export const ACTIVITY_OUTCOMES = ["logged", "ended_early"] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const ACTIVITY_SOURCE_KINDS = ["manual", "legacy_manual"] as const;
export type ActivitySourceKind = (typeof ACTIVITY_SOURCE_KINDS)[number];

/** Where the stored zone came from, because "inferred at migration" is not "known then". */
export const TIME_ZONE_SOURCES = [
  "entered",
  "profile_at_entry",
  "legacy_profile_snapshot",
] as const;
export type TimeZoneSource = (typeof TIME_ZONE_SOURCES)[number];

export const RUNNING_ENVIRONMENTS = ["outdoor", "treadmill"] as const;
export type RunningEnvironment = (typeof RUNNING_ENVIRONMENTS)[number];

export const CYCLING_ENVIRONMENTS = ["outdoor", "indoor"] as const;
export type CyclingEnvironment = (typeof CYCLING_ENVIRONMENTS)[number];

export const SWIMMING_ENVIRONMENTS = ["pool", "open_water"] as const;
export type SwimmingEnvironment = (typeof SWIMMING_ENVIRONMENTS)[number];

/** Unknown is an answer. It is never quietly read as "unassisted" (CYCLE-01). */
export const CYCLING_ASSISTANCE = ["unknown", "unassisted", "assisted"] as const;
export type CyclingAssistance = (typeof CYCLING_ASSISTANCE)[number];

export const SWIM_STROKES = [
  "freestyle",
  "backstroke",
  "breaststroke",
  "butterfly",
  "mixed",
  "drill",
  "unspecified",
] as const;
export type SwimStroke = (typeof SWIM_STROKES)[number];

/** How a swim's distance was arrived at. One method is authoritative at a time (SWIM-01). */
export const SWIM_DISTANCE_METHODS = ["unknown", "manual", "lengths"] as const;
export type SwimDistanceMethod = (typeof SWIM_DISTANCE_METHODS)[number];

export const ACTIVITY_RESOURCE_KINDS = ["pool", "bike", "trainer", "venue"] as const;
export type ActivityResourceKind = (typeof ACTIVITY_RESOURCE_KINDS)[number];

/**
 * Effort, and how much the number can be trusted.
 *
 * A new endurance log answers 1–10 or "Not sure"; there is no third option and no default.
 * `legacy_unconfirmed` is the third state history left behind: a number that may have been a
 * coach's target rather than the athlete's report. It is preserved, shown as unconfirmed, and
 * never promoted to reported without somebody actually saying so (LOG-03).
 */
export const EFFORT_STATUSES = ["reported", "unknown", "legacy_unconfirmed"] as const;
export type EffortStatus = (typeof EFFORT_STATUSES)[number];

export type Effort =
  | { status: "reported"; value: number }
  | { status: "unknown"; value: null }
  | { status: "legacy_unconfirmed"; value: number | null };

export const UNKNOWN_EFFORT: Effort = { status: "unknown", value: null };

export function reportedEffort(value: number): Effort {
  return { status: "reported", value };
}

/** The provenance of a stored pair, from the columns that hold it. */
export function effortFromStorage(value: number | null, status: EffortStatus): Effort {
  if (status === "reported" && value !== null) return { status: "reported", value };
  if (status === "legacy_unconfirmed") return { status: "legacy_unconfirmed", value };
  return UNKNOWN_EFFORT;
}

/** A run's `rpe` and `effort_reported` pair, read without changing what it means. */
export function legacyEffort(value: number | null, reported: boolean): Effort {
  if (value === null) return UNKNOWN_EFFORT;
  return reported ? { status: "reported", value } : { status: "legacy_unconfirmed", value };
}

/** Only a reported number may be used as evidence of how hard the session actually was. */
export function isConfirmedEffort(effort: Effort): effort is { status: "reported"; value: number } {
  return effort.status === "reported";
}

export function describeEffort(effort: Effort): string {
  if (effort.status === "reported") return `${effort.value}/10`;
  if (effort.status === "legacy_unconfirmed")
    return effort.value === null ? "Not recorded" : `${effort.value}/10 (unconfirmed)`;
  return "Not sure";
}

/**
 * What a log answers for. Ad hoc work stays ad hoc: there is no nearest-date matching and no
 * suggestion to link one afterwards (LINK-01). A planned log names the exact occurrence and
 * the exact prescription revision that was on screen when it was written.
 */
export type LogOrigin =
  | { kind: "ad_hoc"; occurrenceId: null; performedRevisionId: null; performedPlanId: null }
  | {
      kind: "planned";
      occurrenceId: string;
      performedRevisionId: string;
      /** The coach preparation actually shown, or null when the base prescription was used. */
      performedPlanId: string | null;
    };

export const AD_HOC_ORIGIN: LogOrigin = {
  kind: "ad_hoc",
  occurrenceId: null,
  performedRevisionId: null,
  performedPlanId: null,
};

export function plannedOrigin(
  occurrenceId: string,
  performedRevisionId: string,
  performedPlanId: string | null = null,
): LogOrigin {
  return { kind: "planned", occurrenceId, performedRevisionId, performedPlanId };
}

/** The stored columns as an origin. A half-set pair is a bug, not a third kind of log. */
export function originFromStorage(row: {
  occurrenceId: string | null;
  performedRevisionId: string | null;
  performedPlanId: string | null;
}): LogOrigin {
  if (row.occurrenceId === null || row.performedRevisionId === null) return AD_HOC_ORIGIN;
  return plannedOrigin(row.occurrenceId, row.performedRevisionId, row.performedPlanId);
}

/**
 * Evidence and memory refer to activities by a stable string. The old ones say `run:<uuid>`
 * and are resolved through the migration map rather than rewritten, so a report written a
 * year ago still points at the activity it was about (COACH-09).
 */
export function activityEvidenceId(activityId: string): string {
  return `activity:${activityId}`;
}

export type EvidenceRef =
  | { kind: "activity"; id: string }
  | { kind: "legacy_run"; id: string }
  | { kind: "legacy_run_weekday"; weekday: string }
  | { kind: "unknown"; raw: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads an evidence identifier without inventing a meaning for one it does not know. */
export function parseEvidenceId(raw: string): EvidenceRef {
  const [prefix, ...rest] = raw.split(":");
  const value = rest.join(":");
  if (prefix === "activity" && UUID.test(value)) return { kind: "activity", id: value };
  if (prefix === "run" && UUID.test(value)) return { kind: "legacy_run", id: value };
  // `run:wednesday` was a guardrail's scope, not an activity: it names a slot, not a record.
  if (prefix === "run" && value.length > 0) return { kind: "legacy_run_weekday", weekday: value };
  return { kind: "unknown", raw };
}
