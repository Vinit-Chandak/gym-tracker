-- Food tracking (ADR 0032): daily targets, meals and their foods, and starred meals.
--
-- Built behind `FOOD_TRACKING_ENABLED`. These tables are created on every database the
-- migrations reach and stay empty until the switch is on for an account: nothing else reads or
-- writes them, so this migration changes nothing that is already here.
--
-- Written by hand from what Drizzle generated, in three ways:
--   * Safe to run twice, like 0036 and 0037: tables and indexes are created if missing, and each
--     key and policy is dropped if present before it is created. A database that recorded an
--     earlier migration as its last is brought forward through every later one again.
--   * The `(user_id, id)` unique indexes come before the keys that reference them, which Drizzle
--     writes the other way round (as in 0026).
--   * `meals_saved_meal_fk` sets only `saved_meal_id` to null when a starred meal is deleted. A
--     bare `set null` on a key that includes the owner would null `user_id` too, and fail on its
--     not-null constraint.
CREATE TABLE IF NOT EXISTS "saved_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_meals_values_chk" CHECK (char_length(name) between 1 and 80
        and jsonb_typeof(items) = 'array'
        and jsonb_array_length(items) between 1 and 30)
);
--> statement-breakpoint
ALTER TABLE "saved_meals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"eaten_on" date NOT NULL,
	"name" text NOT NULL,
	"saved_meal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meals_name_chk" CHECK (char_length(name) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "meals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text,
	"kcal" numeric(6, 1) NOT NULL,
	"carbs_g" numeric(5, 1),
	"fat_g" numeric(5, 1),
	"protein_g" numeric(5, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_items_values_chk" CHECK (position >= 0
        and (name is null or char_length(name) between 1 and 80)
        and kcal between 0 and 10000
        and (carbs_g is null or carbs_g between 0 and 1000)
        and (fat_g is null or fat_g between 0 and 1000)
        and (protein_g is null or protein_g between 0 and 1000))
);
--> statement-breakpoint
ALTER TABLE "meal_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nutrition_targets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"daily_kcal" integer NOT NULL,
	"protein_per_kg" numeric(3, 1) DEFAULT 1.8 NOT NULL,
	"macro_split" text DEFAULT 'body_weight' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_targets_values_chk" CHECK (daily_kcal between 500 and 10000
        and protein_per_kg between 0.5 and 4
        and macro_split in ('body_weight', 'fixed_55_25_20'))
);
--> statement-breakpoint
ALTER TABLE "nutrition_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saved_meals_owner_id_uq" ON "saved_meals" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meals_owner_id_uq" ON "meals" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meals_user_day_idx" ON "meals" USING btree ("user_id","eaten_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meal_items_meal_position_uq" ON "meal_items" USING btree ("meal_id","position");--> statement-breakpoint
ALTER TABLE "saved_meals" DROP CONSTRAINT IF EXISTS "saved_meals_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" DROP CONSTRAINT IF EXISTS "meals_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" DROP CONSTRAINT IF EXISTS "meals_saved_meal_fk";--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_saved_meal_fk" FOREIGN KEY ("user_id","saved_meal_id") REFERENCES "public"."saved_meals"("user_id","id") ON DELETE SET NULL ("saved_meal_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" DROP CONSTRAINT IF EXISTS "meal_items_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" DROP CONSTRAINT IF EXISTS "meal_items_meal_fk";--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_fk" FOREIGN KEY ("user_id","meal_id") REFERENCES "public"."meals"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" DROP CONSTRAINT IF EXISTS "nutrition_targets_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP POLICY IF EXISTS "saved_meals_owner" ON "saved_meals";--> statement-breakpoint
CREATE POLICY "saved_meals_owner" ON "saved_meals" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "meals_owner" ON "meals";--> statement-breakpoint
CREATE POLICY "meals_owner" ON "meals" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "meal_items_owner" ON "meal_items";--> statement-breakpoint
CREATE POLICY "meal_items_owner" ON "meal_items" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "nutrition_targets_owner" ON "nutrition_targets";--> statement-breakpoint
CREATE POLICY "nutrition_targets_owner" ON "nutrition_targets" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
