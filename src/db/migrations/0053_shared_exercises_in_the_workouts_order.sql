-- A friend's shared workout lists its movements in the workout's order, as its owner's finished
-- workout does (ADR 0026).
--
-- The shared rows kept no order of their own, so a follower read a workout's movements A–Z: a
-- session of squats, then bench, then curls read as bench, curls, squats. Each row now holds its
-- place among the session's shared rows, from 0, which the app writes with the rows at Finish,
-- after a change to a finished workout and in the rebuild. A place among the shared rows alone:
-- a movement the owner created, or one left without a working set, has no row and leaves no gap
-- for a follower to count, so nothing leaves the account that the rows did not already say.
--
-- The rows already written are put in order from their workouts, as Finish orders them: each
-- movement at the first of its slots with a working set. A row whose workout no longer has such
-- a slot for it (the workout deleted, or changed since the row was written) goes after the rest,
-- A–Z, as friends have read it until now.
--
-- Written by hand from what Drizzle generated, and safe to run twice: the column is added only
-- if missing, the check is replaced, and a second ranking finds every row already in its place.
-- The previous deployment neither reads nor writes the column; a workout it finishes while this
-- one builds has its rows at 0, which read A–Z as before, until the workout is next changed or
-- `npm run db:backfill:shared-stats` is run once this deployment is serving.
ALTER TABLE "shared_exercise_stats" ADD COLUMN IF NOT EXISTS "order_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_exercise_stats" DROP CONSTRAINT IF EXISTS "shared_exercise_stats_order_chk";--> statement-breakpoint
ALTER TABLE "shared_exercise_stats" ADD CONSTRAINT "shared_exercise_stats_order_chk" CHECK (order_index >= 0);--> statement-breakpoint
UPDATE "shared_exercise_stats" AS s
SET "order_index" = ranked."place"
FROM (
  SELECT r."id",
         (row_number() OVER (
            PARTITION BY r."user_id", r."workout_session_id"
            ORDER BY worked."first_slot" NULLS LAST, e."name", r."exercise_id"
          ) - 1)::integer AS "place"
  FROM "shared_exercise_stats" AS r
  JOIN "exercises" AS e ON e."id" = r."exercise_id"
  LEFT JOIN (
    SELECT we."user_id", we."workout_session_id", we."exercise_id",
           min(we."order_index") AS "first_slot"
    FROM "workout_exercises" AS we
    WHERE EXISTS (
      SELECT 1 FROM "set_logs" AS l
      WHERE l."workout_exercise_id" = we."id" AND l."set_type" <> 'warmup'
    )
    GROUP BY we."user_id", we."workout_session_id", we."exercise_id"
  ) AS worked
    ON worked."user_id" = r."user_id"
   AND worked."workout_session_id" = r."workout_session_id"
   AND worked."exercise_id" = r."exercise_id"
) AS ranked
WHERE s."id" = ranked."id"
  AND s."order_index" <> ranked."place";
