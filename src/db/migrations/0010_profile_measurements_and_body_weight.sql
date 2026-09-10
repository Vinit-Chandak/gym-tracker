CREATE TYPE "public"."sex" AS ENUM('female', 'male', 'other');--> statement-breakpoint
CREATE TYPE "public"."training_goal" AS ENUM('build_muscle', 'lose_fat', 'get_stronger', 'endurance', 'general_fitness');--> statement-breakpoint
CREATE TABLE "body_weight_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"weight_kg" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_weight_logs_weight_chk" CHECK (weight_kg > 0 and weight_kg <= 500)
);
--> statement-breakpoint
ALTER TABLE "body_weight_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "height_cm" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "sex" "sex";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "training_goal" "training_goal";--> statement-breakpoint
ALTER TABLE "body_weight_logs" ADD CONSTRAINT "body_weight_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "body_weight_logs_user_day_uq" ON "body_weight_logs" USING btree ("user_id","measured_on");--> statement-breakpoint
CREATE INDEX "body_weight_logs_user_date_idx" ON "body_weight_logs" USING btree ("user_id","measured_on" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_measurements_chk" CHECK ((body_weight_kg is null or (body_weight_kg > 0 and body_weight_kg <= 500))
        and (height_cm is null or (height_cm >= 50 and height_cm <= 260)));--> statement-breakpoint
CREATE POLICY "body_weight_logs_owner" ON "body_weight_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
-- The three statements below run in this order and depend on it: readings from workouts first,
-- so a day that was trained keeps the weight taken at the gym; then whatever the profile
-- already said; then the profile is re-pointed at whichever of them is newest.
-- Every body weight recorded when a workout was finished becomes the reading for the day it
-- was taken, resolved in the account's own time zone. Two sessions on one day leave the later
-- one, which is the same rule the app applies from here on.
INSERT INTO "body_weight_logs" ("user_id", "measured_on", "weight_kg")
SELECT DISTINCT ON (w."user_id", (w."started_at" AT TIME ZONE p."time_zone")::date)
  w."user_id",
  (w."started_at" AT TIME ZONE p."time_zone")::date,
  w."body_weight_kg"
FROM "workout_sessions" w
JOIN "profiles" p ON p."id" = w."user_id"
WHERE w."body_weight_kg" IS NOT NULL AND w."body_weight_kg" > 0 AND w."body_weight_kg" <= 500
ORDER BY w."user_id", (w."started_at" AT TIME ZONE p."time_zone")::date, w."started_at" DESC
ON CONFLICT ("user_id", "measured_on") DO NOTHING;
--> statement-breakpoint
-- A weight already on a profile is a reading too. Its date is unrecorded, so the day the
-- profile was last written stands in: the most recent day that number is known to have been
-- the account's answer. A day that already carries a reading keeps it.
INSERT INTO "body_weight_logs" ("user_id", "measured_on", "weight_kg")
SELECT p."id", (p."updated_at" AT TIME ZONE p."time_zone")::date, p."body_weight_kg"
FROM "profiles" p
WHERE p."body_weight_kg" IS NOT NULL AND p."body_weight_kg" > 0 AND p."body_weight_kg" <= 500
ON CONFLICT ("user_id", "measured_on") DO NOTHING;
--> statement-breakpoint
-- From here on the profile carries whichever reading is newest; make that true of what is
-- already stored, so the first new reading does not have to reconcile two different answers.
UPDATE "profiles" p SET "body_weight_kg" = newest."weight_kg"
FROM (
  SELECT DISTINCT ON ("user_id") "user_id", "weight_kg"
  FROM "body_weight_logs"
  ORDER BY "user_id", "measured_on" DESC
) newest
WHERE newest."user_id" = p."id" AND p."body_weight_kg" IS DISTINCT FROM newest."weight_kg";
