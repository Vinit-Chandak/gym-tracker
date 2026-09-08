CREATE TYPE "public"."equipment_category" AS ENUM('free_weight', 'machine', 'cable', 'bodyweight', 'cardio', 'accessory');--> statement-breakpoint
CREATE TYPE "public"."exercise_category" AS ENUM('strength', 'hypertrophy', 'cardio', 'mobility');--> statement-breakpoint
CREATE TYPE "public"."exercise_modality" AS ENUM('barbell', 'dumbbell', 'bodyweight', 'cable', 'machine', 'smith_machine', 'cardio', 'mobility');--> statement-breakpoint
CREATE TYPE "public"."gym_kind" AS ENUM('gym', 'outdoor', 'home');--> statement-breakpoint
CREATE TYPE "public"."load_portability" AS ENUM('global', 'equipment_specific', 'context_dependent');--> statement-breakpoint
CREATE TYPE "public"."load_unit" AS ENUM('kg', 'lb', 'plate_count', 'stack_index', 'none');--> statement-breakpoint
CREATE TYPE "public"."prescription_type" AS ENUM('reps', 'duration');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."proposal_source" AS ENUM('manual', 'ai', 'rule_engine');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('proposed', 'approved', 'rejected', 'applied');--> statement-breakpoint
CREATE TYPE "public"."resistance_mode" AS ENUM('free_weight', 'plate_loaded', 'selectorized', 'bodyweight', 'cardio');--> statement-breakpoint
CREATE TYPE "public"."run_mode" AS ENUM('outdoor', 'treadmill');--> statement-breakpoint
CREATE TYPE "public"."set_type" AS ENUM('warmup', 'working', 'backoff', 'drop', 'amrap', 'failure');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"preferred_unit" "load_unit" DEFAULT 'kg' NOT NULL,
	"body_weight_kg" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "equipment_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gym_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text,
	"model" text,
	"resistance_mode" "resistance_mode" NOT NULL,
	"unit" "load_unit" DEFAULT 'kg' NOT NULL,
	"load_increment" numeric(6, 2),
	"pulley_ratio" text,
	"angle_degrees" numeric(5, 2),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equipment_instances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "equipment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "equipment_category" NOT NULL,
	"default_resistance_mode" "resistance_mode" NOT NULL,
	"default_unit" "load_unit" DEFAULT 'kg' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "equipment_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "gym_kind" DEFAULT 'gym' NOT NULL,
	"address" text,
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gyms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercise_equipment_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"exercise_id" uuid NOT NULL,
	"equipment_type_id" uuid,
	"equipment_instance_id" uuid,
	"preference_rank" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_equipment_options_target_chk" CHECK (equipment_type_id is not null or equipment_instance_id is not null)
);
--> statement-breakpoint
ALTER TABLE "exercise_equipment_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "exercise_category" NOT NULL,
	"modality" "exercise_modality" NOT NULL,
	"movement_pattern" text NOT NULL,
	"primary_muscles" text[] DEFAULT '{}'::text[] NOT NULL,
	"secondary_muscles" text[] DEFAULT '{}'::text[] NOT NULL,
	"load_portability" "load_portability" NOT NULL,
	"requires_equipment" boolean DEFAULT true NOT NULL,
	"default_rep_min" integer,
	"default_rep_max" integer,
	"default_rir" numeric(3, 1),
	"default_rest_seconds" integer,
	"default_load_increment" numeric(6, 2),
	"form_notes" text,
	"form_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warmup_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"drills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warmup_protocols_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "warmup_protocols" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"source" "proposal_source" NOT NULL,
	"status" "proposal_status" DEFAULT 'proposed' NOT NULL,
	"summary" text NOT NULL,
	"rationale" text,
	"patch" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied_program_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "program_change_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"day_index" integer NOT NULL,
	"name" text NOT NULL,
	"focus" text,
	"day_of_week" integer,
	"includes_lifting" boolean DEFAULT true NOT NULL,
	"includes_run" boolean DEFAULT false NOT NULL,
	"time_note" text,
	"effort_note" text,
	"notes" text,
	"warmup_protocol_id" uuid,
	"recommended_gym_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_days_day_of_week_chk" CHECK (day_of_week is null or day_of_week between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "program_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_exercise_fallbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_exercise_id" uuid NOT NULL,
	"gym_id" uuid,
	"fallback_exercise_id" uuid NOT NULL,
	"fallback_equipment_type_id" uuid,
	"fallback_equipment_instance_id" uuid,
	"rank" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_exercise_fallbacks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_day_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"sets" integer NOT NULL,
	"prescription_type" "prescription_type" DEFAULT 'reps' NOT NULL,
	"rep_min" integer,
	"rep_max" integer,
	"duration_min_seconds" integer,
	"duration_max_seconds" integer,
	"per_side" boolean DEFAULT false NOT NULL,
	"rir_min" numeric(3, 1),
	"rir_max" numeric(3, 1),
	"rest_min_seconds" integer,
	"rest_max_seconds" integer,
	"target_load_note" text,
	"progression_notes" text,
	"progression_rule" jsonb,
	"key_cue" text,
	"superset_group" text,
	"preferred_equipment_type_id" uuid,
	"preferred_equipment_instance_id" uuid,
	"load_increment" numeric(6, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_exercises_sets_chk" CHECK (sets > 0),
	CONSTRAINT "program_exercises_reps_chk" CHECK (rep_min is null or rep_max is null or rep_min <= rep_max)
);
--> statement-breakpoint
ALTER TABLE "program_exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"week_index" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"duration_min_minutes" integer NOT NULL,
	"duration_max_minutes" integer NOT NULL,
	"rpe_min" numeric(3, 1),
	"rpe_max" numeric(3, 1),
	"pace_note" text,
	"progression_note" text,
	"shin_rule" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "program_status" DEFAULT 'draft' NOT NULL,
	"start_date" date,
	"end_date" date,
	"weeks" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"set_type" "set_type" DEFAULT 'working' NOT NULL,
	"weight" numeric(7, 2),
	"unit" "load_unit" DEFAULT 'kg' NOT NULL,
	"reps" integer,
	"rir" numeric(3, 1),
	"rpe" numeric(3, 1),
	"duration_seconds" integer,
	"distance_meters" numeric(8, 1),
	"technique_rating" integer,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_logs_values_chk" CHECK ((reps is null or reps >= 0)
        and (rir is null or rir >= 0)
        and (technique_rating is null or technique_rating between 1 and 5))
);
--> statement-breakpoint
ALTER TABLE "set_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"equipment_instance_id" uuid,
	"planned_program_exercise_id" uuid,
	"order_index" integer NOT NULL,
	"substitution_reason" text,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid,
	"program_day_id" uuid,
	"gym_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"body_weight_kg" numeric(5, 2),
	"sleep_hours" numeric(4, 2),
	"sleep_quality" integer,
	"energy" integer,
	"fatigue" integer,
	"soreness" integer,
	"back_pain_pre" integer,
	"shin_left_pre" integer,
	"shin_right_pre" integer,
	"warmup_completed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sessions_scales_chk" CHECK ((sleep_quality is null or sleep_quality between 1 and 5)
        and (energy is null or energy between 1 and 5)
        and (fatigue is null or fatigue between 1 and 5)
        and (soreness is null or soreness between 1 and 5)
        and (back_pain_pre is null or back_pain_pre between 0 and 10)
        and (shin_left_pre is null or shin_left_pre between 0 and 10)
        and (shin_right_pre is null or shin_right_pre between 0 and 10))
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_recovery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sleep_hours" numeric(4, 2),
	"sleep_quality" integer,
	"energy" integer,
	"fatigue" integer,
	"soreness" integer,
	"back_pain" integer,
	"shin_left" integer,
	"shin_right" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_recovery_scales_chk" CHECK ((sleep_quality is null or sleep_quality between 1 and 5)
        and (energy is null or energy between 1 and 5)
        and (fatigue is null or fatigue between 1 and 5)
        and (soreness is null or soreness between 1 and 5)
        and (back_pain is null or back_pain between 0 and 10)
        and (shin_left is null or shin_left between 0 and 10)
        and (shin_right is null or shin_right between 0 and 10))
);
--> statement-breakpoint
ALTER TABLE "daily_recovery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_session_id" uuid,
	"gym_id" uuid,
	"program_run_id" uuid,
	"mode" "run_mode" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"distance_meters" numeric(8, 1) NOT NULL,
	"average_pace_seconds_per_km" numeric(7, 1) GENERATED ALWAYS AS (case when distance_meters > 0 then round(duration_seconds * 1000.0 / distance_meters, 1) end) STORED,
	"rpe" numeric(3, 1),
	"shin_left_pre" integer,
	"shin_right_pre" integer,
	"shin_left_during" integer,
	"shin_right_during" integer,
	"shin_left_post" integer,
	"shin_right_post" integer,
	"surface" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_values_chk" CHECK (duration_seconds > 0 and distance_meters >= 0)
);
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "equipment_instances" ADD CONSTRAINT "equipment_instances_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_instances" ADD CONSTRAINT "equipment_instances_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_instances" ADD CONSTRAINT "equipment_instances_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment_options" ADD CONSTRAINT "exercise_equipment_options_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment_options" ADD CONSTRAINT "exercise_equipment_options_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment_options" ADD CONSTRAINT "exercise_equipment_options_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment_options" ADD CONSTRAINT "exercise_equipment_options_equipment_instance_id_equipment_instances_id_fk" FOREIGN KEY ("equipment_instance_id") REFERENCES "public"."equipment_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_change_proposals" ADD CONSTRAINT "program_change_proposals_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_change_proposals" ADD CONSTRAINT "program_change_proposals_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_change_proposals" ADD CONSTRAINT "program_change_proposals_applied_program_id_programs_id_fk" FOREIGN KEY ("applied_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_warmup_protocol_id_warmup_protocols_id_fk" FOREIGN KEY ("warmup_protocol_id") REFERENCES "public"."warmup_protocols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_recommended_gym_id_gyms_id_fk" FOREIGN KEY ("recommended_gym_id") REFERENCES "public"."gyms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercise_fallbacks" ADD CONSTRAINT "program_exercise_fallbacks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercise_fallbacks" ADD CONSTRAINT "program_exercise_fallbacks_program_exercise_id_program_exercises_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercise_fallbacks" ADD CONSTRAINT "program_exercise_fallbacks_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercise_fallbacks" ADD CONSTRAINT "program_exercise_fallbacks_fallback_exercise_id_exercises_id_fk" FOREIGN KEY ("fallback_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercise_fallbacks" ADD CONSTRAINT "program_exercise_fallbacks_fallback_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("fallback_equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercise_fallbacks" ADD CONSTRAINT "program_exercise_fallbacks_fallback_equipment_instance_id_equipment_instances_id_fk" FOREIGN KEY ("fallback_equipment_instance_id") REFERENCES "public"."equipment_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_program_day_id_program_days_id_fk" FOREIGN KEY ("program_day_id") REFERENCES "public"."program_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_preferred_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("preferred_equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_preferred_equipment_instance_id_equipment_instances_id_fk" FOREIGN KEY ("preferred_equipment_instance_id") REFERENCES "public"."equipment_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_workout_exercise_id_workout_exercises_id_fk" FOREIGN KEY ("workout_exercise_id") REFERENCES "public"."workout_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_equipment_instance_id_equipment_instances_id_fk" FOREIGN KEY ("equipment_instance_id") REFERENCES "public"."equipment_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_planned_program_exercise_id_program_exercises_id_fk" FOREIGN KEY ("planned_program_exercise_id") REFERENCES "public"."program_exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_program_day_id_program_days_id_fk" FOREIGN KEY ("program_day_id") REFERENCES "public"."program_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_recovery" ADD CONSTRAINT "daily_recovery_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_program_run_id_program_runs_id_fk" FOREIGN KEY ("program_run_id") REFERENCES "public"."program_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_instances_gym_name_uq" ON "equipment_instances" USING btree ("gym_id","name");--> statement-breakpoint
CREATE INDEX "equipment_instances_user_gym_idx" ON "equipment_instances" USING btree ("user_id","gym_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_user_slug_uq" ON "gyms" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_one_default_per_user_uq" ON "gyms" USING btree ("user_id") WHERE is_default = true;--> statement-breakpoint
CREATE INDEX "gyms_user_idx" ON "gyms" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exercise_equipment_options_exercise_idx" ON "exercise_equipment_options" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "exercises_user_idx" ON "exercises" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "program_change_proposals_program_idx" ON "program_change_proposals" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_days_program_day_uq" ON "program_days" USING btree ("program_id","day_index");--> statement-breakpoint
CREATE INDEX "program_exercise_fallbacks_pe_idx" ON "program_exercise_fallbacks" USING btree ("program_exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_exercises_day_order_uq" ON "program_exercises" USING btree ("program_day_id","order_index");--> statement-breakpoint
CREATE INDEX "program_exercises_exercise_idx" ON "program_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_runs_program_week_day_uq" ON "program_runs" USING btree ("program_id","week_index","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_user_slug_version_uq" ON "programs" USING btree ("user_id","slug","version");--> statement-breakpoint
CREATE INDEX "programs_user_status_idx" ON "programs" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "set_logs_exercise_set_uq" ON "set_logs" USING btree ("workout_exercise_id","set_index");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_exercises_session_order_uq" ON "workout_exercises" USING btree ("workout_session_id","order_index");--> statement-breakpoint
CREATE INDEX "workout_exercises_history_idx" ON "workout_exercises" USING btree ("user_id","exercise_id","equipment_instance_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_started_idx" ON "workout_sessions" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "daily_recovery_user_date_uq" ON "daily_recovery" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "runs_user_started_idx" ON "runs" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "profiles_owner" ON "profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "equipment_instances_owner" ON "equipment_instances" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "equipment_types_read" ON "equipment_types" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "gyms_owner" ON "gyms" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercise_equipment_options_select" ON "exercise_equipment_options" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id is null or user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercise_equipment_options_insert" ON "exercise_equipment_options" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercise_equipment_options_update" ON "exercise_equipment_options" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercise_equipment_options_delete" ON "exercise_equipment_options" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_select" ON "exercises" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id is null or user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_insert" ON "exercises" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_update" ON "exercises" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_delete" ON "exercises" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "warmup_protocols_read" ON "warmup_protocols" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "program_change_proposals_owner" ON "program_change_proposals" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_days_owner" ON "program_days" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_exercise_fallbacks_owner" ON "program_exercise_fallbacks" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_exercises_owner" ON "program_exercises" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_runs_owner" ON "program_runs" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "programs_owner" ON "programs" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "set_logs_owner" ON "set_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "workout_exercises_owner" ON "workout_exercises" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "workout_sessions_owner" ON "workout_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "daily_recovery_owner" ON "daily_recovery" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "runs_owner" ON "runs" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));