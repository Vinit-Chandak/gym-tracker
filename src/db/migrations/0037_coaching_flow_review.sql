-- How a draft stopped being open, and the proposals 0034 left on the old effort scale.
--
-- `closed_as` tells a decline ("not this") from a request for revisions ("this, reworked"),
-- a discarded manual draft, a proposal a newer review replaced, and a proposal closed here
-- for being outdated. `rejected` alone could not: the coach read a decline and a revision as
-- the same thing, and nothing stopped a declined change coming straight back.
ALTER TABLE "program_drafts" ADD COLUMN IF NOT EXISTS "closed_as" text;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD COLUMN IF NOT EXISTS "revision_note_id" uuid;--> statement-breakpoint

-- 0034 moved `program_runs` effort onto five steps and left every stored blueprint where it
-- was. A draft is read against its base programme's rows, so each old draft now "changed"
-- every run week's effort — 1–2 → 3–4 — when nobody changed anything; and approving one of
-- them would have written an easy run as a hard one (3–4 of 5). The same halving 0034 used,
-- to every draft and every retained "programme before" written before it shipped. Zero stays
-- zero: it is "nothing asked", not an effort.
UPDATE "program_drafts" AS draft
SET "blueprint" = jsonb_set(
  draft."blueprint",
  '{runs}',
  (
    SELECT coalesce(
      jsonb_agg(
        CASE
          WHEN jsonb_typeof(run -> 'rpe') = 'array' THEN jsonb_set(
            run,
            '{rpe}',
            jsonb_build_array(
              CASE WHEN (run -> 'rpe' ->> 0)::numeric = 0 THEN 0
                ELSE greatest(1, floor((run -> 'rpe' ->> 0)::numeric / 2)) END,
              CASE WHEN (run -> 'rpe' ->> 1)::numeric = 0 THEN 0
                ELSE greatest(1, floor((run -> 'rpe' ->> 1)::numeric / 2)) END
            )
          )
          ELSE run
        END
        ORDER BY position
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(draft."blueprint" -> 'runs') WITH ORDINALITY AS runs (run, position)
  )
)
WHERE draft."created_at" < '2026-09-21T20:00:00Z'
  AND jsonb_typeof(draft."blueprint" -> 'runs') = 'array'
  AND jsonb_array_length(draft."blueprint" -> 'runs') > 0;--> statement-breakpoint

UPDATE "coach_change_records" AS record
SET "program_before" = jsonb_set(
  record."program_before",
  '{runs}',
  (
    SELECT coalesce(
      jsonb_agg(
        CASE
          WHEN jsonb_typeof(run -> 'rpe') = 'array' THEN jsonb_set(
            run,
            '{rpe}',
            jsonb_build_array(
              CASE WHEN (run -> 'rpe' ->> 0)::numeric = 0 THEN 0
                ELSE greatest(1, floor((run -> 'rpe' ->> 0)::numeric / 2)) END,
              CASE WHEN (run -> 'rpe' ->> 1)::numeric = 0 THEN 0
                ELSE greatest(1, floor((run -> 'rpe' ->> 1)::numeric / 2)) END
            )
          )
          ELSE run
        END
        ORDER BY position
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(record."program_before" -> 'runs') WITH ORDINALITY AS runs (run, position)
  )
)
WHERE record."created_at" < '2026-09-21T20:00:00Z'
  AND record."program_before" IS NOT NULL
  AND jsonb_typeof(record."program_before" -> 'runs') = 'array'
  AND jsonb_array_length(record."program_before" -> 'runs') > 0;--> statement-breakpoint

-- A coach proposal still waiting from before 0034 was written against a programme that has
-- since changed scale under it, and it was one of two written side by side without knowing
-- about each other. It is closed unanswered — never declined, the athlete said nothing — and
-- every ask it carried goes back to the coach, which writes one proposal again at the next
-- daily run, now on the scale the athlete answers in. Asking for that review is recorded the
-- way any waiting ask records it, so a proposal nobody asked for is looked at again too.
WITH closed AS (
  UPDATE "program_drafts"
  SET "status" = 'superseded', "closed_as" = 'outdated', "closed_at" = now(), "updated_at" = now()
  WHERE "status" IN ('editing', 'ready')
    AND "source" = 'weekly'
    AND "created_at" < '2026-09-21T20:00:00Z'
  RETURNING "id", "user_id"
),
reopened AS (
  UPDATE "coach_program_requests" AS request
  SET "state" = 'waiting',
      "detail" = '',
      "draft_id" = NULL,
      "change_refs" = '[]'::jsonb,
      "resolved_at" = NULL,
      "updated_at" = now()
  FROM closed
  WHERE request."draft_id" = closed."id"
    AND request."user_id" = closed."user_id"
    AND request."state" = 'proposed'
  RETURNING request."id", request."user_id"
),
noted AS (
  INSERT INTO "coach_request_decisions" ("user_id", "request_id", "state", "detail")
  SELECT "user_id", "id", 'waiting',
    'Its proposal predated run effort moving to five steps and was closed unanswered, so it is back for the next review.'
  FROM reopened
  RETURNING "user_id"
)
UPDATE "coach_preferences" AS preference
SET "review_requested_at" = now()
WHERE preference."user_id" IN (SELECT "user_id" FROM closed);
