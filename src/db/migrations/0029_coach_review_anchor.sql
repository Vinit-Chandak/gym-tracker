-- An account that switched the coach on before the workflow existed has `ai_coach_enabled`
-- true and no `consented_at`: the old switch wrote the profile flag and nothing else. Every
-- place that works out when a review interval starts read `review_anchor_at ?? consented_at`
-- and treated null as "no review", so those accounts were never reviewed at all — the daily
-- run prepared their sessions and wrote their memo, while the programme request they were
-- waiting on sat on a review that was never queued.
--
-- The coach being on is the fact; the missing timestamp is a gap in the record. It is filled
-- from the training a first review would read — when their active programme started — and
-- never later than now, because an interval has to start before the boundary that ends it.
-- Accounts that already carry an anchor, and accounts with the coach off, are left alone.
INSERT INTO "coach_preferences" ("user_id", "mode", "consented_at")
SELECT
  p."id",
  'coach',
  least(coalesce(g."start_date"::timestamptz, g."created_at"), now())
FROM "profiles" p
JOIN "programs" g ON g."user_id" = p."id" AND g."status" = 'active'
WHERE p."ai_coach_enabled" = true
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint
UPDATE "coach_preferences" c
SET
  "consented_at" = least(coalesce(g."start_date"::timestamptz, g."created_at"), now()),
  "updated_at" = now()
FROM "profiles" p
JOIN "programs" g ON g."user_id" = p."id" AND g."status" = 'active'
WHERE c."user_id" = p."id"
  AND p."ai_coach_enabled" = true
  AND c."consented_at" IS NULL
  AND c."review_anchor_at" IS NULL;
