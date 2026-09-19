-- The transaction-local marker the canonical tables' write policies require (plan §6.3).
-- `withUser` sets it after authenticating a mutating request, with `set_config(..., true)` so
-- it dies with the transaction. A read-only transaction never sets it, and nothing exposed to
-- a browser can: a direct table write under the anon key fails even for the row's own owner,
-- which is what keeps an activity, its detail, its resolution and its projection consistent.
CREATE OR REPLACE FUNCTION public.server_write() RETURNS boolean
LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('app.server_write', true), '') = 'on' $$;
--> statement-breakpoint
CREATE TYPE "public"."activity_outcome" AS ENUM('logged', 'ended_early');--> statement-breakpoint
CREATE TYPE "public"."activity_resource_kind" AS ENUM('pool', 'bike', 'trainer', 'venue');--> statement-breakpoint
CREATE TYPE "public"."activity_source_kind" AS ENUM('manual', 'legacy_manual');--> statement-breakpoint
CREATE TYPE "public"."activity_sport" AS ENUM('strength', 'running', 'cycling', 'swimming');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."cycling_assistance" AS ENUM('unknown', 'unassisted', 'assisted');--> statement-breakpoint
CREATE TYPE "public"."cycling_environment" AS ENUM('outdoor', 'indoor');--> statement-breakpoint
CREATE TYPE "public"."effort_status" AS ENUM('reported', 'unknown', 'legacy_unconfirmed');--> statement-breakpoint
CREATE TYPE "public"."length_unit" AS ENUM('m', 'km', 'mi', 'yd');--> statement-breakpoint
CREATE TYPE "public"."occurrence_disposition" AS ENUM('pending', 'skipped', 'cancelled', 'legacy_completed');--> statement-breakpoint
CREATE TYPE "public"."occurrence_event_kind" AS ENUM('created', 'logged', 'log_deleted', 'skipped', 'reopened', 'rescheduled', 'revised', 'cancelled', 'legacy_resolved');--> statement-breakpoint
CREATE TYPE "public"."running_environment" AS ENUM('outdoor', 'treadmill');--> statement-breakpoint
CREATE TYPE "public"."swim_distance_method" AS ENUM('unknown', 'manual', 'lengths');--> statement-breakpoint
CREATE TYPE "public"."swim_stroke" AS ENUM('freestyle', 'backstroke', 'breaststroke', 'butterfly', 'mixed', 'drill', 'unspecified');--> statement-breakpoint
CREATE TYPE "public"."swimming_environment" AS ENUM('pool', 'open_water');--> statement-breakpoint
CREATE TYPE "public"."time_zone_source" AS ENUM('entered', 'profile_at_entry', 'legacy_profile_snapshot');--> statement-breakpoint
CREATE TABLE "activity_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "activity_resource_kind" NOT NULL,
	"name" text NOT NULL,
	"pool_length_native" numeric(14, 6),
	"pool_length_unit" "length_unit",
	"pool_length_metres" numeric(14, 6),
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_resources_name_chk" CHECK (length(name) between 1 and 80),
	CONSTRAINT "activity_resources_pool_chk" CHECK (((pool_length_native is null) = (pool_length_unit is null))
        and ((pool_length_native is null) = (pool_length_metres is null))
        and (pool_length_native is null or (pool_length_native > 0 and pool_length_native <= 1000))
        and (pool_length_native is null or kind = 'pool'))
);
--> statement-breakpoint
ALTER TABLE "activity_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"status" "activity_status" DEFAULT 'completed' NOT NULL,
	"outcome" "activity_outcome" DEFAULT 'logged' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"recorded_time_zone" text NOT NULL,
	"time_zone_source" time_zone_source NOT NULL,
	"occurred_on" date NOT NULL,
	"duration_ms" integer,
	"effort_value" numeric(3, 1),
	"effort_status" "effort_status" DEFAULT 'unknown' NOT NULL,
	"title" text,
	"notes" text,
	"occurrence_id" uuid,
	"performed_revision_id" uuid,
	"performed_plan_id" uuid,
	"source_kind" "activity_source_kind" DEFAULT 'manual' NOT NULL,
	"source_reference" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_effort_chk" CHECK ((effort_status = 'reported' and effort_value is not null and effort_value between 1 and 10)
        or (effort_status = 'unknown' and effort_value is null)
        or effort_status = 'legacy_unconfirmed'),
	CONSTRAINT "activities_origin_chk" CHECK ((occurrence_id is null and performed_revision_id is null)
        or (occurrence_id is not null and performed_revision_id is not null)),
	CONSTRAINT "activities_plan_requires_origin_chk" CHECK (performed_plan_id is null or occurrence_id is not null),
	CONSTRAINT "activities_duration_chk" CHECK (duration_ms is null or (duration_ms > 0 and duration_ms <= 604800000)),
	CONSTRAINT "activities_endurance_completed_chk" CHECK (sport = 'strength' or (status = 'completed' and duration_ms is not null)),
	CONSTRAINT "activities_title_chk" CHECK (title is null or length(title) <= 120),
	CONSTRAINT "activities_revision_chk" CHECK (revision >= 1)
);
--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_submission_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"submission_key" uuid NOT NULL,
	"payload_digest" text NOT NULL,
	"activity_id" uuid,
	"result_status" text NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_receipts_status_chk" CHECK (result_status in ('created', 'updated', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "activity_submission_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cycling_activity_details" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"environment" "cycling_environment" NOT NULL,
	"distance_metres" numeric(14, 6),
	"distance_native_value" numeric(14, 6),
	"distance_native_unit" "length_unit",
	"assistance" "cycling_assistance" DEFAULT 'unknown' NOT NULL,
	"resource_id" uuid,
	"resource_label" text,
	"average_power_watts" numeric(7, 1),
	"average_cadence_rpm" numeric(6, 1),
	"average_heart_rate" integer,
	"max_heart_rate" integer,
	"elevation_gain_metres" numeric(12, 3),
	"legacy_out_of_bounds" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycling_details_sport_chk" CHECK (sport = 'cycling'),
	CONSTRAINT "cycling_details_values_chk" CHECK ((distance_metres is null or distance_metres >= 0)
        and (legacy_out_of_bounds or distance_metres is null or distance_metres <= 10000000)
        and ((distance_metres is null) = (distance_native_value is null))
        and ((distance_metres is null) = (distance_native_unit is null))
        and (average_power_watts is null or average_power_watts between 0 and 5000)
        and (average_cadence_rpm is null or average_cadence_rpm between 0 and 300)
        and (average_heart_rate is null or average_heart_rate between 20 and 300)
        and (max_heart_rate is null or max_heart_rate between 20 and 300)
        and (average_heart_rate is null or max_heart_rate is null or max_heart_rate >= average_heart_rate)
        and (elevation_gain_metres is null or elevation_gain_metres between 0 and 100000)
        and (resource_label is null or length(resource_label) <= 80))
);
--> statement-breakpoint
ALTER TABLE "cycling_activity_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "running_activity_details" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"environment" "running_environment" NOT NULL,
	"distance_metres" numeric(14, 6) NOT NULL,
	"distance_native_value" numeric(14, 6) NOT NULL,
	"distance_native_unit" "length_unit" NOT NULL,
	"surface" text,
	"elevation_gain_metres" numeric(12, 3),
	"treadmill_incline_percent" numeric(6, 3),
	"average_heart_rate" integer,
	"max_heart_rate" integer,
	"cadence_steps_per_minute" numeric(6, 1),
	"legacy_gym_id" uuid,
	"legacy_workout_session_id" uuid,
	"legacy_program_run_id" uuid,
	"legacy_out_of_bounds" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "running_details_sport_chk" CHECK (sport = 'running'),
	CONSTRAINT "running_details_values_chk" CHECK (distance_metres >= 0
        and (legacy_out_of_bounds or distance_metres <= 1000000)
        and (average_heart_rate is null or average_heart_rate between 20 and 300)
        and (max_heart_rate is null or max_heart_rate between 20 and 300)
        and (average_heart_rate is null or max_heart_rate is null or max_heart_rate >= average_heart_rate)
        and (cadence_steps_per_minute is null or cadence_steps_per_minute between 0 and 400)
        and (treadmill_incline_percent is null or treadmill_incline_percent between -100 and 100)
        and (treadmill_incline_percent is null or environment = 'treadmill')
        and (elevation_gain_metres is null or elevation_gain_metres between 0 and 100000)
        and (surface is null or length(surface) <= 80))
);
--> statement-breakpoint
ALTER TABLE "running_activity_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "swimming_activity_details" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"environment" "swimming_environment" NOT NULL,
	"active_ms" integer,
	"distance_method" "swim_distance_method" DEFAULT 'unknown' NOT NULL,
	"distance_metres" numeric(14, 6),
	"distance_native_value" numeric(14, 6),
	"distance_native_unit" "length_unit",
	"pool_length_native" numeric(14, 6),
	"pool_length_unit" "length_unit",
	"pool_length_metres" numeric(14, 6),
	"lengths" integer,
	"stroke" "swim_stroke" DEFAULT 'unspecified' NOT NULL,
	"stroke_count" integer,
	"resource_id" uuid,
	"resource_label" text,
	"average_heart_rate" integer,
	"max_heart_rate" integer,
	"legacy_out_of_bounds" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swimming_details_sport_chk" CHECK (sport = 'swimming'),
	CONSTRAINT "swimming_details_values_chk" CHECK ((active_ms is null or (active_ms > 0 and active_ms <= 604800000))
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
        and (resource_label is null or length(resource_label) <= 80)),
	CONSTRAINT "swimming_details_method_chk" CHECK ((distance_method = 'lengths'
            and environment = 'pool' and lengths is not null and pool_length_native is not null)
        or (distance_method = 'manual' and lengths is null and distance_metres is not null)
        or (distance_method = 'unknown' and lengths is null and distance_metres is null))
);
--> statement-breakpoint
ALTER TABLE "swimming_activity_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_template_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"prescription" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_template_revisions_version_chk" CHECK (version >= 1)
);
--> statement-breakpoint
ALTER TABLE "activity_template_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"current_revision_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_templates_name_chk" CHECK (length(name) between 1 and 120),
	CONSTRAINT "activity_templates_sport_chk" CHECK (sport <> 'strength')
);
--> statement-breakpoint
ALTER TABLE "activity_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "occurrence_edit_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"pinned_revision_id" uuid NOT NULL,
	"draft_token" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "occurrence_edit_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "occurrence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"kind" "occurrence_event_kind" NOT NULL,
	"activity_id" uuid,
	"occurred_on" date,
	"actor" text DEFAULT 'athlete' NOT NULL,
	"source" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_events_actor_chk" CHECK (actor in ('athlete', 'coach', 'migration', 'system'))
);
--> statement-breakpoint
ALTER TABLE "occurrence_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "occurrence_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"program_version_id" uuid,
	"program_day_id" uuid,
	"scheduled_on" date NOT NULL,
	"scheduling_zone" text NOT NULL,
	"scheduled_local_time" time,
	"order_index" integer DEFAULT 0 NOT NULL,
	"prescription_version" integer DEFAULT 1 NOT NULL,
	"prescription" jsonb,
	"template_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_versions_order_chk" CHECK (order_index >= 0)
);
--> statement-breakpoint
ALTER TABLE "occurrence_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "planned_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"family_id" uuid,
	"slot_lineage_id" uuid,
	"cycle_index" integer,
	"disposition" "occurrence_disposition" DEFAULT 'pending' NOT NULL,
	"current_revision_id" uuid,
	"original_week_index" integer,
	"original_scheduled_on" date,
	"legacy_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planned_occurrences_programme_chk" CHECK ((family_id is not null) or (slot_lineage_id is null and cycle_index is null
            and original_week_index is null))
);
--> statement-breakpoint
ALTER TABLE "planned_occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_families" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_families" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_sport_preferences" (
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"distance_unit" "length_unit" DEFAULT 'km' NOT NULL,
	"pool_unit" "length_unit" DEFAULT 'm' NOT NULL,
	"share_stats" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sport_preferences_user_id_sport_pk" PRIMARY KEY("user_id","sport"),
	CONSTRAINT "user_sport_preferences_units_chk" CHECK (distance_unit in ('km', 'mi') and pool_unit in ('m', 'yd'))
);
--> statement-breakpoint
ALTER TABLE "user_sport_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "multisport_migration_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid,
	"related_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "multisport_issues_status_chk" CHECK (status in ('open', 'resolved', 'accepted'))
);
--> statement-breakpoint
ALTER TABLE "multisport_migration_issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "multisport_migration_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version" integer DEFAULT 1 NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "multisport_links_kind_chk" CHECK (length(source_kind) between 1 and 60 and length(target_kind) between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "multisport_migration_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_resources_owner_id_uq" ON "activity_resources" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_resources_owner_kind_name_uq" ON "activity_resources" USING btree ("user_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_owner_id_uq" ON "activities" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_owner_id_sport_uq" ON "activities" USING btree ("user_id","id","sport");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_occurrence_uq" ON "activities" USING btree ("occurrence_id") WHERE occurrence_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_receipts_owner_key_uq" ON "activity_submission_receipts" USING btree ("user_id","submission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_template_revisions_owner_id_uq" ON "activity_template_revisions" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_template_revisions_version_uq" ON "activity_template_revisions" USING btree ("user_id","template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_templates_owner_id_uq" ON "activity_templates" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_templates_owner_id_sport_uq" ON "activity_templates" USING btree ("user_id","id","sport");--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_edit_claims_owner_occurrence_uq" ON "occurrence_edit_claims" USING btree ("user_id","occurrence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_versions_key_uq" ON "occurrence_versions" USING btree ("user_id","occurrence_id","id","sport");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_occurrences_owner_id_uq" ON "planned_occurrences" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_occurrences_owner_id_sport_uq" ON "planned_occurrences" USING btree ("user_id","id","sport");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_occurrences_legacy_source_uq" ON "planned_occurrences" USING btree ("user_id","legacy_source") WHERE legacy_source is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "program_families_owner_id_uq" ON "program_families" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "multisport_issues_uq" ON "multisport_migration_issues" USING btree ("user_id","category","source_kind","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "multisport_links_source_uq" ON "multisport_migration_links" USING btree ("user_id","source_kind","source_id","source_version");--> statement-breakpoint
CREATE UNIQUE INDEX "program_days_owner_id_uq" ON "program_days" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_owner_id_uq" ON "programs" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_owner_id_uq" ON "workout_sessions" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_activity_uq" ON "workout_sessions" USING btree ("activity_id") WHERE activity_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_versions_owner_occurrence_id_uq"
  ON "occurrence_versions" ("user_id","occurrence_id","id");--> statement-breakpoint
ALTER TABLE "activity_resources" ADD CONSTRAINT "activity_resources_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_submission_receipts" ADD CONSTRAINT "activity_submission_receipts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycling_activity_details" ADD CONSTRAINT "cycling_activity_details_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycling_activity_details" ADD CONSTRAINT "cycling_activity_details_activity_fk" FOREIGN KEY ("user_id","activity_id","sport") REFERENCES "public"."activities"("user_id","id","sport") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycling_activity_details" ADD CONSTRAINT "cycling_details_resource_fk" FOREIGN KEY ("user_id","resource_id") REFERENCES "public"."activity_resources"("user_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_activity_details" ADD CONSTRAINT "running_activity_details_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_activity_details" ADD CONSTRAINT "running_activity_details_activity_fk" FOREIGN KEY ("user_id","activity_id","sport") REFERENCES "public"."activities"("user_id","id","sport") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swimming_activity_details" ADD CONSTRAINT "swimming_activity_details_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swimming_activity_details" ADD CONSTRAINT "swimming_activity_details_activity_fk" FOREIGN KEY ("user_id","activity_id","sport") REFERENCES "public"."activities"("user_id","id","sport") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swimming_activity_details" ADD CONSTRAINT "swimming_details_resource_fk" FOREIGN KEY ("user_id","resource_id") REFERENCES "public"."activity_resources"("user_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_template_revisions" ADD CONSTRAINT "activity_template_revisions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_template_revisions" ADD CONSTRAINT "activity_template_revisions_template_fk" FOREIGN KEY ("user_id","template_id","sport") REFERENCES "public"."activity_templates"("user_id","id","sport") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD CONSTRAINT "activity_templates_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_edit_claims" ADD CONSTRAINT "occurrence_edit_claims_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_edit_claims" ADD CONSTRAINT "occurrence_edit_claims_occurrence_fk" FOREIGN KEY ("user_id","occurrence_id") REFERENCES "public"."planned_occurrences"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_events" ADD CONSTRAINT "occurrence_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_events" ADD CONSTRAINT "occurrence_events_occurrence_fk" FOREIGN KEY ("user_id","occurrence_id") REFERENCES "public"."planned_occurrences"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_events" ADD CONSTRAINT "occurrence_events_activity_fk" FOREIGN KEY ("user_id","activity_id") REFERENCES "public"."activities"("user_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_versions" ADD CONSTRAINT "occurrence_versions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_versions" ADD CONSTRAINT "occurrence_versions_occurrence_fk" FOREIGN KEY ("user_id","occurrence_id","sport") REFERENCES "public"."planned_occurrences"("user_id","id","sport") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_versions" ADD CONSTRAINT "occurrence_versions_program_fk" FOREIGN KEY ("user_id","program_version_id") REFERENCES "public"."programs"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_versions" ADD CONSTRAINT "occurrence_versions_program_day_fk" FOREIGN KEY ("user_id","program_day_id") REFERENCES "public"."program_days"("user_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_versions" ADD CONSTRAINT "occurrence_versions_template_fk" FOREIGN KEY ("user_id","template_revision_id") REFERENCES "public"."activity_template_revisions"("user_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_occurrences" ADD CONSTRAINT "planned_occurrences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_occurrences" ADD CONSTRAINT "planned_occurrences_family_fk" FOREIGN KEY ("user_id","family_id") REFERENCES "public"."program_families"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_families" ADD CONSTRAINT "program_families_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sport_preferences" ADD CONSTRAINT "user_sport_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multisport_migration_issues" ADD CONSTRAINT "multisport_migration_issues_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multisport_migration_links" ADD CONSTRAINT "multisport_migration_links_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_resources_owner_kind_idx" ON "activity_resources" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "activities_user_started_idx" ON "activities" USING btree ("user_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_user_sport_day_idx" ON "activities" USING btree ("user_id","sport","occurred_on");--> statement-breakpoint
CREATE INDEX "activity_templates_owner_sport_idx" ON "activity_templates" USING btree ("user_id","sport","archived_at");--> statement-breakpoint
CREATE INDEX "occurrence_events_occurrence_idx" ON "occurrence_events" USING btree ("user_id","occurrence_id","created_at");--> statement-breakpoint
CREATE INDEX "occurrence_versions_schedule_idx" ON "occurrence_versions" USING btree ("user_id","scheduled_on","order_index");--> statement-breakpoint
CREATE INDEX "planned_occurrences_programme_idx" ON "planned_occurrences" USING btree ("user_id","family_id","slot_lineage_id","cycle_index");--> statement-breakpoint
CREATE INDEX "multisport_issues_status_idx" ON "multisport_migration_issues" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "multisport_links_target_idx" ON "multisport_migration_links" USING btree ("user_id","target_kind","target_id");--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_activity_fk" FOREIGN KEY ("user_id","activity_id") REFERENCES "public"."activities"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "activity_resources_select" ON "activity_resources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "activity_resources_insert" ON "activity_resources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_resources_update" ON "activity_resources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_resources_delete" ON "activity_resources" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activities_select" ON "activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "activities_insert" ON "activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activities_update" ON "activities" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activities_delete" ON "activities" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_submission_receipts_select" ON "activity_submission_receipts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "activity_submission_receipts_insert" ON "activity_submission_receipts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_submission_receipts_update" ON "activity_submission_receipts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_submission_receipts_delete" ON "activity_submission_receipts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "cycling_activity_details_select" ON "cycling_activity_details" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "cycling_activity_details_insert" ON "cycling_activity_details" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "cycling_activity_details_update" ON "cycling_activity_details" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "cycling_activity_details_delete" ON "cycling_activity_details" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "running_activity_details_select" ON "running_activity_details" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "running_activity_details_insert" ON "running_activity_details" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "running_activity_details_update" ON "running_activity_details" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "running_activity_details_delete" ON "running_activity_details" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "swimming_activity_details_select" ON "swimming_activity_details" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "swimming_activity_details_insert" ON "swimming_activity_details" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "swimming_activity_details_update" ON "swimming_activity_details" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "swimming_activity_details_delete" ON "swimming_activity_details" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_template_revisions_select" ON "activity_template_revisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "activity_template_revisions_insert" ON "activity_template_revisions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_template_revisions_update" ON "activity_template_revisions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_template_revisions_delete" ON "activity_template_revisions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_templates_select" ON "activity_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "activity_templates_insert" ON "activity_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_templates_update" ON "activity_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "activity_templates_delete" ON "activity_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_edit_claims_select" ON "occurrence_edit_claims" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "occurrence_edit_claims_insert" ON "occurrence_edit_claims" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_edit_claims_update" ON "occurrence_edit_claims" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_edit_claims_delete" ON "occurrence_edit_claims" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_events_select" ON "occurrence_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "occurrence_events_insert" ON "occurrence_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_events_update" ON "occurrence_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_events_delete" ON "occurrence_events" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_versions_select" ON "occurrence_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "occurrence_versions_insert" ON "occurrence_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_versions_update" ON "occurrence_versions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "occurrence_versions_delete" ON "occurrence_versions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "planned_occurrences_select" ON "planned_occurrences" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "planned_occurrences_insert" ON "planned_occurrences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "planned_occurrences_update" ON "planned_occurrences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "planned_occurrences_delete" ON "planned_occurrences" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "program_families_select" ON "program_families" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_families_insert" ON "program_families" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "program_families_update" ON "program_families" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "program_families_delete" ON "program_families" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "user_sport_preferences_select" ON "user_sport_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_sport_preferences_insert" ON "user_sport_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "user_sport_preferences_update" ON "user_sport_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "user_sport_preferences_delete" ON "user_sport_preferences" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "multisport_migration_issues_select" ON "multisport_migration_issues" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "multisport_migration_issues_insert" ON "multisport_migration_issues" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "multisport_migration_issues_update" ON "multisport_migration_issues" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "multisport_migration_issues_delete" ON "multisport_migration_issues" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "multisport_migration_links_select" ON "multisport_migration_links" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "multisport_migration_links_insert" ON "multisport_migration_links" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "multisport_migration_links_update" ON "multisport_migration_links" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
CREATE POLICY "multisport_migration_links_delete" ON "multisport_migration_links" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());
--> statement-breakpoint
-- The key the template reference below points at.
CREATE UNIQUE INDEX "activity_template_revisions_owner_template_id_uq"
  ON "activity_template_revisions" ("user_id","template_id","id");--> statement-breakpoint

-- The occurrence and the revision an activity names must belong to each other, to the same
-- owner and to the same sport. Four columns, because three of them are what a forged payload
-- would otherwise be free to mix (AT-DATA-02).
ALTER TABLE "activities" ADD CONSTRAINT "activities_occurrence_revision_fk"
  FOREIGN KEY ("user_id","occurrence_id","performed_revision_id","sport")
  REFERENCES "public"."occurrence_versions"("user_id","occurrence_id","id","sport")
  ON DELETE restrict;--> statement-breakpoint

-- The revision in force. Deferred, because an occurrence and its first version are written in
-- one transaction and each needs the other to exist.
ALTER TABLE "planned_occurrences" ADD CONSTRAINT "planned_occurrences_current_revision_fk"
  FOREIGN KEY ("user_id","id","current_revision_id")
  REFERENCES "public"."occurrence_versions"("user_id","occurrence_id","id")
  ON DELETE restrict DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint

-- Same for a template and the revision it currently offers.
ALTER TABLE "activity_templates" ADD CONSTRAINT "activity_templates_current_revision_fk"
  FOREIGN KEY ("user_id","id","current_revision_id")
  REFERENCES "public"."activity_template_revisions"("user_id","template_id","id")
  ON DELETE restrict DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint


-- Exactly one typed detail per activity, checked when the transaction ends rather than
-- statement by statement: the parent is written first, its detail immediately after, and
-- between the two there is legitimately no detail yet. Strength's detail is the existing
-- workout session, which is why this looks in four places (AT-DATA-01).
CREATE OR REPLACE FUNCTION public.activity_detail_count(activity uuid, owner uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*) FROM public.running_activity_details d
            WHERE d.activity_id = activity AND d.user_id = owner)
       + (SELECT count(*) FROM public.cycling_activity_details d
            WHERE d.activity_id = activity AND d.user_id = owner)
       + (SELECT count(*) FROM public.swimming_activity_details d
            WHERE d.activity_id = activity AND d.user_id = owner)
       + (SELECT count(*) FROM public.workout_sessions s
            WHERE s.activity_id = activity AND s.user_id = owner)
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.assert_activity_detail() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  owner uuid;
  found integer;
BEGIN
  IF TG_TABLE_NAME = 'activities' THEN
    target := NEW.id;
    owner := NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.activity_id;
    owner := OLD.user_id;
  ELSE
    target := NEW.activity_id;
    owner := NEW.user_id;
  END IF;
  IF target IS NULL THEN
    RETURN NULL;
  END IF;
  -- A parent deleted in this same transaction has nothing left to be consistent about.
  IF NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.id = target AND a.user_id = owner) THEN
    RETURN NULL;
  END IF;
  found := public.activity_detail_count(target, owner);
  IF found <> 1 THEN
    RAISE EXCEPTION 'activity % must have exactly one typed detail, found %', target, found
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER activities_detail_present
  AFTER INSERT OR UPDATE ON public.activities
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_activity_detail();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER running_details_single
  AFTER INSERT OR UPDATE OR DELETE ON public.running_activity_details
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_activity_detail();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER cycling_details_single
  AFTER INSERT OR UPDATE OR DELETE ON public.cycling_activity_details
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_activity_detail();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER swimming_details_single
  AFTER INSERT OR UPDATE OR DELETE ON public.swimming_activity_details
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_activity_detail();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER workout_sessions_activity_detail
  AFTER INSERT OR UPDATE OR DELETE ON public.workout_sessions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_activity_detail();--> statement-breakpoint

-- A strength parent's detail is a workout session and nothing else.
CREATE OR REPLACE FUNCTION public.assert_activity_detail_sport() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_sport public.activity_sport;
BEGIN
  IF NEW.activity_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT a.sport INTO parent_sport FROM public.activities a
    WHERE a.id = NEW.activity_id AND a.user_id = NEW.user_id;
  IF parent_sport IS NOT NULL AND parent_sport <> 'strength' THEN
    RAISE EXCEPTION 'workout session % cannot be the detail of a % activity', NEW.id, parent_sport
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER workout_sessions_activity_sport
  AFTER INSERT OR UPDATE ON public.workout_sessions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_activity_detail_sport();
