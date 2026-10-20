-- Running laps, run types and heart-rate zones (ADR 0059).
--
-- A run could say how far and how long, and nothing about how: an interval session logged as
-- one distance and one time, with no reps, no splits and no word for what kind of run it was.
-- Each running detail now carries the kind of run (`run_type`, null when nobody said) and its
-- laps, in order, as a JSON list the application checks before every write as it checks the rest
-- of a run's measurements; the database keeps the list a list and no longer than a hundred.
--
-- The profile carries the heart-rate settings the zones are read from: a maximum the athlete
-- entered or a run recorded, where it came from and when, whether a higher reading may raise it,
-- an optional resting rate for zones of the reserve, and five floors of their own. Every column
-- is null or defaulted, so nothing existing changes: an account with no maximum reads the
-- estimate for its age and the highest of its year's runs, exactly as before it read nothing.
--
-- Written by hand from what Drizzle generated, and safe to run twice like 0042 to 0055: the types
-- are created only if missing, the columns added only if missing, and the checks replaced.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'heart_rate_zone_method' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."heart_rate_zone_method" AS ENUM('max', 'reserve', 'custom');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'max_heart_rate_source' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."max_heart_rate_source" AS ENUM('entered', 'observed');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'run_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."run_type" AS ENUM('easy', 'recovery', 'long', 'tempo', 'intervals', 'hills', 'fartlek', 'progression', 'race_pace', 'sprints', 'time_trial', 'race', 'run_walk');
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "max_heart_rate" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "max_heart_rate_source" "max_heart_rate_source";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "max_heart_rate_on" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "max_heart_rate_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "resting_heart_rate" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "heart_rate_zone_method" "heart_rate_zone_method" DEFAULT 'max' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "heart_rate_zone_floors" integer[];--> statement-breakpoint
ALTER TABLE "running_activity_details" ADD COLUMN IF NOT EXISTS "run_type" "run_type";--> statement-breakpoint
ALTER TABLE "running_activity_details" ADD COLUMN IF NOT EXISTS "laps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_heart_rate_chk";--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_heart_rate_chk" CHECK ((max_heart_rate is null or max_heart_rate between 100 and 230)
        and ((max_heart_rate is null) = (max_heart_rate_source is null))
        and (resting_heart_rate is null or resting_heart_rate between 25 and 120)
        and (heart_rate_zone_floors is null or cardinality(heart_rate_zone_floors) = 5));--> statement-breakpoint
ALTER TABLE "running_activity_details" DROP CONSTRAINT IF EXISTS "running_details_values_chk";--> statement-breakpoint
ALTER TABLE "running_activity_details" ADD CONSTRAINT "running_details_values_chk" CHECK (distance_metres >= 0
        and (legacy_out_of_bounds or distance_metres <= 1000000)
        and (average_heart_rate is null or average_heart_rate between 20 and 300)
        and (max_heart_rate is null or max_heart_rate between 20 and 300)
        and (average_heart_rate is null or max_heart_rate is null or max_heart_rate >= average_heart_rate)
        and (cadence_steps_per_minute is null or cadence_steps_per_minute between 0 and 400)
        and (treadmill_incline_percent is null or treadmill_incline_percent between -100 and 100)
        and (treadmill_incline_percent is null or environment = 'treadmill')
        and (elevation_gain_metres is null or elevation_gain_metres between 0 and 100000)
        and (surface is null or length(surface) <= 80)
        and jsonb_typeof(laps) = 'array' and jsonb_array_length(laps) <= 100);
