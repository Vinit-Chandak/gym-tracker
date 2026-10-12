-- A run skipped from Today is skipped on its sessions, as it is on the day (ADR 0051, owner,
-- 12 October 2026).
--
-- Today's skip and "Pick up from today" answered a day's run on the day alone, a `run` row in
-- `program_slot_events`, and left the run's own occurrences pending. The programme read the
-- run as Skipped from the day; the coach's adherence reads the occurrence, and counted it as
-- not done. Both now skip the occurrences themselves (`skipSlotPart`); this does the same for
-- the skips already recorded.
--
-- An occurrence is skipped here when the day it belongs to (its programme family, cycle and day
-- of the cycle, as the occurrence itself names them) has a run skip recorded on a version of
-- that programme whose day runs, and it is still pending with no activity behind it. Nothing
-- logged, skipped, cancelled or completed before occurrences existed is touched. Nor is a run
-- the athlete did something with after its day was skipped: put back, logged and its log
-- deleted, or moved to another date. That says they meant to do it, so it stays owed, and the
-- day's skip gives way to it (`withDerivedRunEvents`). A revision copies a day's rows onto the
-- new version, so the skip is read from its first copy, the one written when it happened.
--
-- Each run skipped gets the event a skip from Today now writes, by the migration, naming the
-- day's row it came from, dated the day it was skipped and with the reason given. Data only,
-- and safe to run twice: a second run finds nothing pending to skip.
WITH "day_skips" AS (
  SELECT DISTINCT ON (p."user_id", p."family_id", e."cycle_index", e."day_index")
         p."user_id", p."family_id", e."cycle_index", e."day_index",
         e."id", e."occurred_on", e."note", e."created_at"
  FROM "program_slot_events" AS e
  JOIN "programs" AS p ON p."id" = e."program_id" AND p."user_id" = e."user_id"
  JOIN "program_days" AS d
    ON d."program_id" = p."id" AND d."day_index" = e."day_index" AND d."includes_run"
  WHERE e."part" = 'run' AND e."status" = 'skipped'
  ORDER BY p."user_id", p."family_id", e."cycle_index", e."day_index", e."created_at", p."version"
),
"owed" AS (
  SELECT o."id", o."user_id", s."id" AS "event_id", s."occurred_on", s."note"
  FROM "planned_occurrences" AS o
  JOIN "day_skips" AS s
    ON s."user_id" = o."user_id"
   AND s."family_id" = o."family_id"
   AND s."cycle_index" = o."cycle_index"
   AND s."day_index" = o."cycle_day_index"
  WHERE o."disposition" = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM "activities" AS a
      WHERE a."user_id" = o."user_id" AND a."occurrence_id" = o."id"
    )
    AND NOT EXISTS (
      SELECT 1 FROM "occurrence_events" AS later
      WHERE later."user_id" = o."user_id"
        AND later."occurrence_id" = o."id"
        AND later."kind" IN ('reopened', 'logged', 'log_deleted', 'rescheduled')
        AND later."created_at" > s."created_at"
    )
),
"skipped" AS (
  UPDATE "planned_occurrences" AS o
  SET "disposition" = 'skipped', "updated_at" = now()
  FROM "owed"
  WHERE o."id" = "owed"."id" AND o."disposition" = 'pending'
  RETURNING o."id"
)
INSERT INTO "occurrence_events" ("user_id", "occurrence_id", "kind", "actor", "source", "occurred_on", "detail")
SELECT "owed"."user_id", "owed"."id", 'skipped', 'migration',
       'program_slot_events:' || "owed"."event_id", "owed"."occurred_on",
       jsonb_build_object('via', 'today')
         || CASE WHEN "owed"."note" IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('note', "owed"."note") END
FROM "owed"
JOIN "skipped" ON "skipped"."id" = "owed"."id";
