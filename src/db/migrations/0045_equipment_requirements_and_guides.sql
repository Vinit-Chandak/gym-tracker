-- Equipment the way gyms have it, and how to do each exercise (plan:
-- docs/planning/ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md, step 1).
--
-- Additive only. New shared reference tables (assumed types per kind of location, requirement
-- groups, combination machines, the machines step's presets, guides and demonstrations), new
-- columns with defaults, the profile's answer to "Which sounds like you?", and the table of each
-- machine's types. Nothing a user owns is rewritten: every existing machine gets one row there,
-- its own type, and keeps `equipment_type_id` as its display type.
--
-- Written by hand from what Drizzle generated, in the ways 0038 and 0041 were: safe to run twice
-- (the type and tables are created if missing, columns added if missing, keys and policies
-- dropped if present before they are created, and the backfill skips what is already there).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'training_experience' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."training_experience" AS ENUM('new', 'experienced');
  END IF;
END
$$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assumed_equipment_types" (
	"gym_kind" "gym_kind" NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	CONSTRAINT "assumed_equipment_types_gym_kind_equipment_type_id_pk" PRIMARY KEY("gym_kind","equipment_type_id")
);
--> statement-breakpoint
ALTER TABLE "assumed_equipment_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_combination_types" (
	"combination_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "equipment_combination_types_combination_id_equipment_type_id_pk" PRIMARY KEY("combination_id","equipment_type_id")
);
--> statement-breakpoint
ALTER TABLE "equipment_combination_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_combinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"purpose" text,
	"identification" text,
	"illustration" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_combinations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "equipment_combinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_instance_types" (
	"equipment_instance_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_instance_types_equipment_instance_id_equipment_type_id_pk" PRIMARY KEY("equipment_instance_id","equipment_type_id")
);
--> statement-breakpoint
ALTER TABLE "equipment_instance_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"gym_kind" "gym_kind" NOT NULL,
	"experience" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_presets_slug_unique" UNIQUE("slug"),
	CONSTRAINT "equipment_presets_experience_chk" CHECK (experience in ('new', 'experienced', 'any'))
);
--> statement-breakpoint
ALTER TABLE "equipment_presets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercise_equipment_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"exercise_id" uuid NOT NULL,
	"alternative" integer NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "exercise_equipment_requirements_alternative_chk" CHECK (alternative >= 1)
);
--> statement-breakpoint
ALTER TABLE "exercise_equipment_requirements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercise_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"setup" text NOT NULL,
	"steps" jsonb NOT NULL,
	"cues" jsonb NOT NULL,
	"mistakes" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"drafted_by" text,
	"reviewer" text,
	"reviewed_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_guides_exercise_id_unique" UNIQUE("exercise_id"),
	CONSTRAINT "exercise_guides_status_chk" CHECK (status in ('draft', 'published'))
);
--> statement-breakpoint
ALTER TABLE "exercise_guides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercise_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"video_id" text NOT NULL,
	"start_seconds" integer,
	"title" text NOT NULL,
	"channel" text NOT NULL,
	"url" text NOT NULL,
	"usage_basis" text NOT NULL,
	"checked_on" date NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "exercise_media_provider_chk" CHECK (provider in ('youtube')),
	CONSTRAINT "exercise_media_status_chk" CHECK (status in ('candidate', 'approved'))
);
--> statement-breakpoint
ALTER TABLE "exercise_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "training_experience" "training_experience";--> statement-breakpoint
ALTER TABLE "equipment_types" ADD COLUMN IF NOT EXISTS "aliases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment_types" ADD COLUMN IF NOT EXISTS "purpose" text;--> statement-breakpoint
ALTER TABLE "equipment_types" ADD COLUMN IF NOT EXISTS "identification" text;--> statement-breakpoint
ALTER TABLE "equipment_types" ADD COLUMN IF NOT EXISTS "family" text;--> statement-breakpoint
ALTER TABLE "equipment_types" ADD COLUMN IF NOT EXISTS "illustration" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "log_note" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "aliases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "assumed_equipment_types" DROP CONSTRAINT IF EXISTS "assumed_equipment_types_equipment_type_id_equipment_types_id_fk";--> statement-breakpoint
ALTER TABLE "assumed_equipment_types" ADD CONSTRAINT "assumed_equipment_types_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_combination_types" DROP CONSTRAINT IF EXISTS "equipment_combination_types_combination_id_equipment_combinations_id_fk";--> statement-breakpoint
ALTER TABLE "equipment_combination_types" ADD CONSTRAINT "equipment_combination_types_combination_id_equipment_combinations_id_fk" FOREIGN KEY ("combination_id") REFERENCES "public"."equipment_combinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_combination_types" DROP CONSTRAINT IF EXISTS "equipment_combination_types_equipment_type_id_equipment_types_id_fk";--> statement-breakpoint
ALTER TABLE "equipment_combination_types" ADD CONSTRAINT "equipment_combination_types_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_instance_types" DROP CONSTRAINT IF EXISTS "equipment_instance_types_equipment_instance_id_equipment_instances_id_fk";--> statement-breakpoint
ALTER TABLE "equipment_instance_types" ADD CONSTRAINT "equipment_instance_types_equipment_instance_id_equipment_instances_id_fk" FOREIGN KEY ("equipment_instance_id") REFERENCES "public"."equipment_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_instance_types" DROP CONSTRAINT IF EXISTS "equipment_instance_types_equipment_type_id_equipment_types_id_fk";--> statement-breakpoint
ALTER TABLE "equipment_instance_types" ADD CONSTRAINT "equipment_instance_types_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_instance_types" DROP CONSTRAINT IF EXISTS "equipment_instance_types_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "equipment_instance_types" ADD CONSTRAINT "equipment_instance_types_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment_requirements" DROP CONSTRAINT IF EXISTS "exercise_equipment_requirements_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "exercise_equipment_requirements" ADD CONSTRAINT "exercise_equipment_requirements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment_requirements" DROP CONSTRAINT IF EXISTS "exercise_equipment_requirements_exercise_id_exercises_id_fk";--> statement-breakpoint
ALTER TABLE "exercise_equipment_requirements" ADD CONSTRAINT "exercise_equipment_requirements_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment_requirements" DROP CONSTRAINT IF EXISTS "exercise_equipment_requirements_equipment_type_id_equipment_types_id_fk";--> statement-breakpoint
ALTER TABLE "exercise_equipment_requirements" ADD CONSTRAINT "exercise_equipment_requirements_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_guides" DROP CONSTRAINT IF EXISTS "exercise_guides_exercise_id_exercises_id_fk";--> statement-breakpoint
ALTER TABLE "exercise_guides" ADD CONSTRAINT "exercise_guides_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_media" DROP CONSTRAINT IF EXISTS "exercise_media_exercise_id_exercises_id_fk";--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_instance_types_user_idx" ON "equipment_instance_types" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_equipment_requirements_uq" ON "exercise_equipment_requirements" USING btree ("exercise_id","alternative","equipment_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_equipment_requirements_primary_uq" ON "exercise_equipment_requirements" USING btree ("exercise_id","alternative") WHERE is_primary;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_media_exercise_video_uq" ON "exercise_media" USING btree ("exercise_id","provider","video_id");--> statement-breakpoint
DROP POLICY IF EXISTS "assumed_equipment_types_read" ON "assumed_equipment_types";--> statement-breakpoint
CREATE POLICY "assumed_equipment_types_read" ON "assumed_equipment_types" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "equipment_combination_types_read" ON "equipment_combination_types";--> statement-breakpoint
CREATE POLICY "equipment_combination_types_read" ON "equipment_combination_types" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "equipment_combinations_read" ON "equipment_combinations";--> statement-breakpoint
CREATE POLICY "equipment_combinations_read" ON "equipment_combinations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "equipment_instance_types_owner" ON "equipment_instance_types";--> statement-breakpoint
CREATE POLICY "equipment_instance_types_owner" ON "equipment_instance_types" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "equipment_presets_read" ON "equipment_presets";--> statement-breakpoint
CREATE POLICY "equipment_presets_read" ON "equipment_presets" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_equipment_requirements_select" ON "exercise_equipment_requirements";--> statement-breakpoint
CREATE POLICY "exercise_equipment_requirements_select" ON "exercise_equipment_requirements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id is null or user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_equipment_requirements_insert" ON "exercise_equipment_requirements";--> statement-breakpoint
CREATE POLICY "exercise_equipment_requirements_insert" ON "exercise_equipment_requirements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_equipment_requirements_update" ON "exercise_equipment_requirements";--> statement-breakpoint
CREATE POLICY "exercise_equipment_requirements_update" ON "exercise_equipment_requirements" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_equipment_requirements_delete" ON "exercise_equipment_requirements";--> statement-breakpoint
CREATE POLICY "exercise_equipment_requirements_delete" ON "exercise_equipment_requirements" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_guides_read" ON "exercise_guides";--> statement-breakpoint
CREATE POLICY "exercise_guides_read" ON "exercise_guides" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_media_read" ON "exercise_media";--> statement-breakpoint
CREATE POLICY "exercise_media_read" ON "exercise_media" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
-- Every machine is at least its display type. A trigger keeps that true for every write path,
-- the app's and the scripts', so no machine can exist without a type to resolve by. Changing a
-- machine's display type replaces that one row; the types added through "Also used for" stay.
-- It runs as its owner, as every trigger function here that touches a table does (0031): it only
-- writes the row being written, for that row's own owner.
CREATE OR REPLACE FUNCTION public.equipment_instance_display_type() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.equipment_type_id IS DISTINCT FROM NEW.equipment_type_id THEN
    DELETE FROM public.equipment_instance_types
     WHERE equipment_instance_id = NEW.id AND equipment_type_id = OLD.equipment_type_id;
  END IF;
  INSERT INTO public.equipment_instance_types (equipment_instance_id, equipment_type_id, user_id)
  VALUES (NEW.id, NEW.equipment_type_id, NEW.user_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS equipment_instance_display_type ON public.equipment_instances;--> statement-breakpoint
CREATE TRIGGER equipment_instance_display_type
AFTER INSERT OR UPDATE OF equipment_type_id ON public.equipment_instances
FOR EACH ROW EXECUTE FUNCTION public.equipment_instance_display_type();--> statement-breakpoint
-- The backfill: one row per machine that already exists, its own type. Safe to run twice.
INSERT INTO "equipment_instance_types" ("equipment_instance_id", "equipment_type_id", "user_id")
SELECT "id", "equipment_type_id", "user_id" FROM "equipment_instances"
ON CONFLICT DO NOTHING;
