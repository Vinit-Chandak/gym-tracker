CREATE TYPE "public"."slot_part" AS ENUM('session', 'run');--> statement-breakpoint
ALTER TYPE "public"."prescription_type" ADD VALUE 'distance';--> statement-breakpoint
ALTER TABLE "set_logs" DROP CONSTRAINT "set_logs_values_chk";--> statement-breakpoint
DROP INDEX "program_slot_events_slot_uq";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_prescription_type" "prescription_type" DEFAULT 'reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_duration_min_seconds" integer;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_duration_max_seconds" integer;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_distance_min_meters" integer;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_distance_max_meters" integer;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "rir_note" text;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD COLUMN "distance_min_meters" integer;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD COLUMN "distance_max_meters" integer;--> statement-breakpoint
ALTER TABLE "program_slot_events" ADD COLUMN "part" "slot_part" DEFAULT 'session' NOT NULL;--> statement-breakpoint
ALTER TABLE "program_slot_events" ADD COLUMN "run_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "program_slot_events_slot_uq" ON "program_slot_events" USING btree ("program_id","cycle_index","day_index","part");--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_distance_chk" CHECK ((distance_min_meters is null or distance_min_meters >= 0)
        and (distance_max_meters is null or distance_max_meters >= 0)
        and (distance_min_meters is null or distance_max_meters is null
          or distance_min_meters <= distance_max_meters));--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_values_chk" CHECK ((reps is null or reps >= 0)
        and (rir is null or rir >= 0)
        and (duration_seconds is null or duration_seconds >= 0)
        and (distance_meters is null or distance_meters >= 0)
        and (technique_rating is null or technique_rating between 1 and 5));--> statement-breakpoint
-- Backfill: before this migration one event answered for a whole day, runs included. Days that
-- also ran therefore have a `session` event and no `run` one, and without this the sequence
-- would walk backwards into every run it used to consider settled. Give each such day a `run`
-- event of the same standing, pointing at the run that was logged against that week and weekday
-- when there was one.
INSERT INTO "program_slot_events" (
  "user_id", "program_id", "cycle_index", "day_index", "part", "status", "run_id", "occurred_on", "note"
)
SELECT
  e."user_id",
  e."program_id",
  e."cycle_index",
  e."day_index",
  'run'::"public"."slot_part",
  e."status",
  (
    SELECT r."id"
    FROM "runs" r
    JOIN "program_runs" pr ON pr."id" = r."program_run_id"
    WHERE r."user_id" = e."user_id"
      AND pr."program_id" = e."program_id"
      AND pr."week_index" = e."cycle_index"
      AND pr."day_of_week" = d."day_of_week"
    ORDER BY r."started_at"
    LIMIT 1
  ),
  e."occurred_on",
  'Recorded before the run was its own task'
FROM "program_slot_events" e
JOIN "program_days" d
  ON d."program_id" = e."program_id" AND d."day_index" = e."day_index"
WHERE e."part" = 'session' AND d."includes_run"
ON CONFLICT DO NOTHING;
