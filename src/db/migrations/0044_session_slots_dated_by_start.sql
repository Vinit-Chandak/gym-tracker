-- A finished session's slot is dated by the day the session started, not the day it finished.
--
-- Finishing a workout recorded its programme slot as completed "today", read at the moment
-- Finish was pressed. A session begun at 23:55 and finished at 00:20 was therefore dated the
-- next morning, and that morning Today said the day had just been done and held back the one
-- that was actually up next. The app now dates it by `started_at`, as the session's own
-- activity and shared stats already are; this puts the rows written before that right.
--
-- Only rows a finished session wrote are touched, and only where the two dates differ, which
-- is only ever a session that ran past midnight in the athlete's time zone. A zone Postgres
-- does not know is left alone rather than failing the deploy: the row keeps the date it has.
-- Safe to run twice: a second run finds nothing that differs.
-- The date is read through the joined zone's own name, so it cannot be worked out for a row
-- before that row has been matched to a zone Postgres knows.
UPDATE "program_slot_events" AS e
SET "occurred_on" = (s."started_at" AT TIME ZONE z."name")::date
FROM "workout_sessions" AS s
JOIN "profiles" AS p ON p."id" = s."user_id"
JOIN (SELECT DISTINCT "name" FROM pg_timezone_names) AS z ON z."name" = p."time_zone"
WHERE e."workout_session_id" = s."id"
  AND e."user_id" = s."user_id"
  AND e."part" = 'session'
  AND e."status" = 'completed'
  AND e."occurred_on" <> (s."started_at" AT TIME ZONE z."name")::date;
