import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { serverWritePolicies, timestamps } from "./common";
import {
  activityOutcomeEnum,
  activitySourceKindEnum,
  activitySportEnum,
  activityStatusEnum,
  cyclingAssistanceEnum,
  cyclingEnvironmentEnum,
  effortStatusEnum,
  lengthUnitEnum,
  runningEnvironmentEnum,
  swimDistanceMethodEnum,
  swimmingEnvironmentEnum,
  swimStrokeEnum,
  timeZoneSourceEnum,
} from "./multisport-enums";
import { activityResources } from "./activity-resources";
import { profiles } from "./profiles";

/**
 * One bout of training, whatever the sport (plan §6.3).
 *
 * The parent holds identity, ownership, when it happened and what it answered for. The
 * measurements live in one typed detail table per sport, so a swim cannot acquire a cadence
 * and a ride cannot acquire a pool. Strength's detail is the existing `workout_sessions` row
 * and its exercises and sets, which are untouched: the parent is added beside them rather
 * than replacing anything.
 *
 * `UNIQUE (user_id, id)` and `UNIQUE (user_id, id, sport)` exist so every relation into this
 * table can carry the owner and the sport in the key itself. That is what makes a foreign
 * activity or a mismatched detail fail in the database, below any code that might forget.
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sport: activitySportEnum("sport").notNull(),
    status: activityStatusEnum("status").notNull().default("completed"),
    outcome: activityOutcomeEnum("outcome").notNull().default("logged"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** The IANA zone the local date below was resolved in. */
    recordedTimeZone: text("recorded_time_zone").notNull(),
    timeZoneSource: timeZoneSourceEnum("time_zone_source").notNull(),
    /** The local date it happened on, frozen at save; a later profile change cannot move it. */
    occurredOn: date("occurred_on").notNull(),
    /** Null only while a strength session is still open. */
    durationMs: integer("duration_ms"),
    effortValue: numeric("effort_value", { precision: 3, scale: 1, mode: "number" }),
    effortStatus: effortStatusEnum("effort_status").notNull().default("unknown"),
    title: text("title"),
    notes: text("notes"),
    /** The occurrence this answers for; null for ad hoc work, and never guessed at. */
    occurrenceId: uuid("occurrence_id"),
    performedRevisionId: uuid("performed_revision_id"),
    /** The immutable coach preparation actually shown, or null for the base prescription. */
    performedPlanId: uuid("performed_plan_id"),
    sourceKind: activitySourceKindEnum("source_kind").notNull().default("manual"),
    sourceReference: text("source_reference"),
    /** Optimistic concurrency: an edit states the revision it read. */
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("activities_owner_id_uq").on(t.userId, t.id),
    uniqueIndex("activities_owner_id_sport_uq").on(t.userId, t.id, t.sport),
    // One actual per occurrence, enforced where two tabs cannot talk to each other.
    uniqueIndex("activities_occurrence_uq")
      .on(t.occurrenceId)
      .where(sql`occurrence_id is not null`),
    index("activities_user_started_idx").on(t.userId, t.startedAt.desc(), t.id.desc()),
    index("activities_user_sport_day_idx").on(t.userId, t.sport, t.occurredOn),
    // 1–5 since migration 0033, which rescaled every stored value in the same statement that
    // narrowed this. `legacy_unconfirmed` stays unbounded: those numbers were rescaled too,
    // but they were never ours to bound, and a row outside the scale is still evidence.
    check(
      "activities_effort_chk",
      sql`(effort_status = 'reported' and effort_value is not null and effort_value between 1 and 5)
        or (effort_status = 'unknown' and effort_value is null)
        or effort_status = 'legacy_unconfirmed'`,
    ),
    // Planned means both halves: an occurrence without the revision it was read at is not a link.
    check(
      "activities_origin_chk",
      sql`(occurrence_id is null and performed_revision_id is null)
        or (occurrence_id is not null and performed_revision_id is not null)`,
    ),
    check(
      "activities_plan_requires_origin_chk",
      sql`performed_plan_id is null or occurrence_id is not null`,
    ),
    check(
      "activities_duration_chk",
      sql`duration_ms is null or (duration_ms > 0 and duration_ms <= 604800000)`,
    ),
    check(
      "activities_endurance_completed_chk",
      sql`sport = 'strength' or (status = 'completed' and duration_ms is not null)`,
    ),
    check("activities_title_chk", sql`title is null or length(title) <= 120`),
    check("activities_revision_chk", sql`revision >= 1`),
    ...serverWritePolicies("activities"),
  ],
).enableRLS();

/** Columns every typed detail carries, so the owner and the sport travel with the key. */
const detailColumns = {
  activityId: uuid("activity_id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  sport: activitySportEnum("sport").notNull(),
};

export const runningActivityDetails = pgTable(
  "running_activity_details",
  {
    ...detailColumns,
    environment: runningEnvironmentEnum("environment").notNull(),
    /** Canonical metres, and the quantity and unit the athlete actually entered. */
    distanceMetres: numeric("distance_metres", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    distanceNativeValue: numeric("distance_native_value", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    distanceNativeUnit: lengthUnitEnum("distance_native_unit").notNull(),
    surface: text("surface"),
    elevationGainMetres: numeric("elevation_gain_metres", {
      precision: 12,
      scale: 3,
      mode: "number",
    }),
    treadmillInclinePercent: numeric("treadmill_incline_percent", {
      precision: 6,
      scale: 3,
      mode: "number",
    }),
    averageHeartRate: integer("average_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
    cadenceStepsPerMinute: numeric("cadence_steps_per_minute", {
      precision: 6,
      scale: 1,
      mode: "number",
    }),
    /** What the legacy run pointed at, kept only where the link is owner-consistent. */
    legacyGymId: uuid("legacy_gym_id"),
    legacyWorkoutSessionId: uuid("legacy_workout_session_id"),
    legacyProgramRunId: uuid("legacy_program_run_id"),
    /** Set when a migrated value falls outside the bounds new entries must satisfy. */
    legacyOutOfBounds: boolean("legacy_out_of_bounds").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // Same owner, same activity, same sport: a running detail cannot sit under a swim.
    foreignKey({
      name: "running_activity_details_activity_fk",
      columns: [t.userId, t.activityId, t.sport],
      foreignColumns: [activities.userId, activities.id, activities.sport],
    }).onDelete("cascade"),
    check("running_details_sport_chk", sql`sport = 'running'`),
    check(
      "running_details_values_chk",
      sql`distance_metres >= 0
        and (legacy_out_of_bounds or distance_metres <= 1000000)
        and (average_heart_rate is null or average_heart_rate between 20 and 300)
        and (max_heart_rate is null or max_heart_rate between 20 and 300)
        and (average_heart_rate is null or max_heart_rate is null or max_heart_rate >= average_heart_rate)
        and (cadence_steps_per_minute is null or cadence_steps_per_minute between 0 and 400)
        and (treadmill_incline_percent is null or treadmill_incline_percent between -100 and 100)
        and (treadmill_incline_percent is null or environment = 'treadmill')
        and (elevation_gain_metres is null or elevation_gain_metres between 0 and 100000)
        and (surface is null or length(surface) <= 80)`,
    ),
    ...serverWritePolicies("running_activity_details"),
  ],
).enableRLS();

export const cyclingActivityDetails = pgTable(
  "cycling_activity_details",
  {
    ...detailColumns,
    environment: cyclingEnvironmentEnum("environment").notNull(),
    /** Null is unknown. Zero is a reported zero, and the two never merge. */
    distanceMetres: numeric("distance_metres", { precision: 14, scale: 6, mode: "number" }),
    distanceNativeValue: numeric("distance_native_value", {
      precision: 14,
      scale: 6,
      mode: "number",
    }),
    distanceNativeUnit: lengthUnitEnum("distance_native_unit"),
    assistance: cyclingAssistanceEnum("assistance").notNull().default("unknown"),
    resourceId: uuid("resource_id"),
    /** What the bike or trainer was called on the day, whatever it is renamed to later. */
    resourceLabel: text("resource_label"),
    averagePowerWatts: numeric("average_power_watts", { precision: 7, scale: 1, mode: "number" }),
    averageCadenceRpm: numeric("average_cadence_rpm", { precision: 6, scale: 1, mode: "number" }),
    averageHeartRate: integer("average_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
    elevationGainMetres: numeric("elevation_gain_metres", {
      precision: 12,
      scale: 3,
      mode: "number",
    }),
    legacyOutOfBounds: boolean("legacy_out_of_bounds").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // Same owner, same activity, same sport: a running detail cannot sit under a swim.
    foreignKey({
      name: "cycling_activity_details_activity_fk",
      columns: [t.userId, t.activityId, t.sport],
      foreignColumns: [activities.userId, activities.id, activities.sport],
    }).onDelete("cascade"),
    foreignKey({
      name: "cycling_details_resource_fk",
      columns: [t.userId, t.resourceId],
      foreignColumns: [activityResources.userId, activityResources.id],
    }).onDelete("set null"),
    check("cycling_details_sport_chk", sql`sport = 'cycling'`),
    check(
      "cycling_details_values_chk",
      sql`(distance_metres is null or distance_metres >= 0)
        and (legacy_out_of_bounds or distance_metres is null or distance_metres <= 10000000)
        and ((distance_metres is null) = (distance_native_value is null))
        and ((distance_metres is null) = (distance_native_unit is null))
        and (average_power_watts is null or average_power_watts between 0 and 5000)
        and (average_cadence_rpm is null or average_cadence_rpm between 0 and 300)
        and (average_heart_rate is null or average_heart_rate between 20 and 300)
        and (max_heart_rate is null or max_heart_rate between 20 and 300)
        and (average_heart_rate is null or max_heart_rate is null or max_heart_rate >= average_heart_rate)
        and (elevation_gain_metres is null or elevation_gain_metres between 0 and 100000)
        and (resource_label is null or length(resource_label) <= 80)`,
    ),
    ...serverWritePolicies("cycling_activity_details"),
  ],
).enableRLS();

export const swimmingActivityDetails = pgTable(
  "swimming_activity_details",
  {
    ...detailColumns,
    environment: swimmingEnvironmentEnum("environment").notNull(),
    /** Swimming time excluding rests. The parent's duration is the elapsed session. */
    activeMs: integer("active_ms"),
    distanceMethod: swimDistanceMethodEnum("distance_method").notNull().default("unknown"),
    distanceMetres: numeric("distance_metres", { precision: 14, scale: 6, mode: "number" }),
    distanceNativeValue: numeric("distance_native_value", {
      precision: 14,
      scale: 6,
      mode: "number",
    }),
    distanceNativeUnit: lengthUnitEnum("distance_native_unit"),
    /** The pool as it was on the day; editing a saved pool later cannot rewrite this. */
    poolLengthNative: numeric("pool_length_native", { precision: 14, scale: 6, mode: "number" }),
    poolLengthUnit: lengthUnitEnum("pool_length_unit"),
    poolLengthMetres: numeric("pool_length_metres", { precision: 14, scale: 6, mode: "number" }),
    lengths: integer("lengths"),
    stroke: swimStrokeEnum("stroke").notNull().default("unspecified"),
    strokeCount: integer("stroke_count"),
    resourceId: uuid("resource_id"),
    resourceLabel: text("resource_label"),
    averageHeartRate: integer("average_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
    legacyOutOfBounds: boolean("legacy_out_of_bounds").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // Same owner, same activity, same sport: a running detail cannot sit under a swim.
    foreignKey({
      name: "swimming_activity_details_activity_fk",
      columns: [t.userId, t.activityId, t.sport],
      foreignColumns: [activities.userId, activities.id, activities.sport],
    }).onDelete("cascade"),
    foreignKey({
      name: "swimming_details_resource_fk",
      columns: [t.userId, t.resourceId],
      foreignColumns: [activityResources.userId, activityResources.id],
    }).onDelete("set null"),
    check("swimming_details_sport_chk", sql`sport = 'swimming'`),
    check(
      "swimming_details_values_chk",
      sql`(active_ms is null or (active_ms > 0 and active_ms <= 604800000))
        and (distance_metres is null or distance_metres >= 0)
        and (legacy_out_of_bounds or distance_metres is null or distance_metres <= 1000000)
        and ((distance_metres is null) = (distance_native_value is null))
        and ((distance_metres is null) = (distance_native_unit is null))
        and (lengths is null or (lengths between 1 and 1000000))
        and (stroke_count is null or stroke_count between 0 and 1000000)
        and (pool_length_native is null or (pool_length_native > 0 and pool_length_native <= 1000))
        and ((pool_length_native is null) = (pool_length_unit is null))
        and ((pool_length_native is null) = (pool_length_metres is null))
        and (average_heart_rate is null or average_heart_rate between 20 and 300)
        and (max_heart_rate is null or max_heart_rate between 20 and 300)
        and (average_heart_rate is null or max_heart_rate is null or max_heart_rate >= average_heart_rate)
        and (resource_label is null or length(resource_label) <= 80)`,
    ),
    // One authoritative method, and open water has no lengths to count.
    check(
      "swimming_details_method_chk",
      sql`(distance_method = 'lengths'
            and environment = 'pool' and lengths is not null and pool_length_native is not null)
        or (distance_method = 'manual' and lengths is null and distance_metres is not null)
        or (distance_method = 'unknown' and lengths is null and distance_metres is null)`,
    ),
    ...serverWritePolicies("swimming_activity_details"),
  ],
).enableRLS();

/**
 * The receipt that makes a retry safe.
 *
 * A save that timed out may already have committed. The client retries with the same key and
 * the same payload digest and is handed the same answer, rather than creating a second
 * activity. A deleted activity leaves its receipt behind marked deleted, so a retry that
 * arrives after the deletion cannot resurrect it. No measurement is stored here.
 */
export const activitySubmissionReceipts = pgTable(
  "activity_submission_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    submissionKey: uuid("submission_key").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    activityId: uuid("activity_id"),
    resultStatus: text("result_status").notNull(),
    deleted: boolean("deleted").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("activity_receipts_owner_key_uq").on(t.userId, t.submissionKey),
    check("activity_receipts_status_chk", sql`result_status in ('created', 'updated', 'deleted')`),
    ...serverWritePolicies("activity_submission_receipts"),
  ],
).enableRLS();
