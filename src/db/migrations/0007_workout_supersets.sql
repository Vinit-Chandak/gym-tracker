ALTER TABLE "workout_exercises" ADD COLUMN "superset_group" text;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_superset_group_chk" CHECK (superset_group is null or (length(superset_group) between 1 and 60));--> statement-breakpoint
-- Workouts that already ran under a programme grouping keep it, so history shows the
-- supersets that actually applied on the day and an unfinished session starts from its
-- plan. After this the column is the only source: a session with no groups means the user
-- removed them, not that the programme has nothing to say.
UPDATE "workout_exercises" we
SET "superset_group" = pe."superset_group"
FROM "program_exercises" pe
WHERE pe."id" = we."planned_program_exercise_id"
  AND pe."superset_group" IS NOT NULL
  AND we."superset_group" IS NULL;
