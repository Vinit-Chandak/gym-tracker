import { pgEnum } from "drizzle-orm/pg-core";

import {
  ACTIVITY_OUTCOMES,
  ACTIVITY_RESOURCE_KINDS,
  ACTIVITY_SOURCE_KINDS,
  ACTIVITY_SPORTS,
  ACTIVITY_STATUSES,
  CYCLING_ASSISTANCE,
  CYCLING_ENVIRONMENTS,
  EFFORT_STATUSES,
  RUNNING_ENVIRONMENTS,
  SWIM_DISTANCE_METHODS,
  SWIM_STROKES,
  SWIMMING_ENVIRONMENTS,
  TIME_ZONE_SOURCES,
} from "../../domain/activity";
import { OCCURRENCE_DISPOSITIONS, OCCURRENCE_EVENT_KINDS } from "../../domain/occurrences";
import { LENGTH_UNITS } from "../../lib/distance-units";

/**
 * The canonical sport names, kept apart from the legacy `training_sport` enum on purpose:
 * old readers keep `workout`/`run`, and the mapping between the two is written once, in
 * `domain/activity.ts` (plan §6.4).
 */
export const activitySportEnum = pgEnum("activity_sport", ACTIVITY_SPORTS);
export const activityStatusEnum = pgEnum("activity_status", ACTIVITY_STATUSES);
export const activityOutcomeEnum = pgEnum("activity_outcome", ACTIVITY_OUTCOMES);
export const activitySourceKindEnum = pgEnum("activity_source_kind", ACTIVITY_SOURCE_KINDS);
export const timeZoneSourceEnum = pgEnum("time_zone_source", TIME_ZONE_SOURCES);
export const effortStatusEnum = pgEnum("effort_status", EFFORT_STATUSES);
export const lengthUnitEnum = pgEnum("length_unit", LENGTH_UNITS);
export const runningEnvironmentEnum = pgEnum("running_environment", RUNNING_ENVIRONMENTS);
export const cyclingEnvironmentEnum = pgEnum("cycling_environment", CYCLING_ENVIRONMENTS);
export const swimmingEnvironmentEnum = pgEnum("swimming_environment", SWIMMING_ENVIRONMENTS);
export const cyclingAssistanceEnum = pgEnum("cycling_assistance", CYCLING_ASSISTANCE);
export const swimStrokeEnum = pgEnum("swim_stroke", SWIM_STROKES);
export const swimDistanceMethodEnum = pgEnum("swim_distance_method", SWIM_DISTANCE_METHODS);
export const activityResourceKindEnum = pgEnum("activity_resource_kind", ACTIVITY_RESOURCE_KINDS);
export const occurrenceDispositionEnum = pgEnum("occurrence_disposition", OCCURRENCE_DISPOSITIONS);
export const occurrenceEventKindEnum = pgEnum("occurrence_event_kind", OCCURRENCE_EVENT_KINDS);
