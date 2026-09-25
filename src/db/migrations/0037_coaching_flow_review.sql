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
WHERE preference."user_id" IN (SELECT "user_id" FROM closed);--> statement-breakpoint

-- 0034 left each scheduled session's own prescription on the old scale on purpose: a version
-- somebody trained against is history, and the next programme revision was to write every
-- future one again. An athlete who has approved nothing since has not had that revision, so an
-- easy run on next week's calendar still reads "Effort 3–4" — now out of five. This is that
-- revision, written the way a programme writes one. Every session still ahead, not logged and
-- not cancelled, whose prescription is on the old scale — written before 0034, or copied
-- unchanged from one that was, as moving a session copies it — gets a new version with 0034's
-- halving applied to every effort in it. The old version stays exactly as it was, and a
-- preparation written against it is withdrawn, as any revision withdraws one.
CREATE FUNCTION pg_temp.effort_out_of_five(effort jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN jsonb_typeof(effort) = 'array' THEN jsonb_build_array(
      CASE WHEN (effort ->> 0)::numeric = 0 THEN 0
        ELSE greatest(1, floor((effort ->> 0)::numeric / 2)) END,
      CASE WHEN (effort ->> 1)::numeric = 0 THEN 0
        ELSE greatest(1, floor((effort ->> 1)::numeric / 2)) END
    )
    ELSE effort
  END
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.prescription_out_of_five(prescription jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN jsonb_typeof(session.targeted -> 'nodes') = 'array' THEN jsonb_set(
      session.targeted,
      '{nodes}',
      (
        SELECT coalesce(
          jsonb_agg(
            CASE
              WHEN node -> 'effort' IS NOT NULL
                THEN jsonb_set(node, '{effort}', pg_temp.effort_out_of_five(node -> 'effort'))
              WHEN jsonb_typeof(node -> 'steps') = 'array' THEN jsonb_set(
                node,
                '{steps}',
                (
                  SELECT coalesce(
                    jsonb_agg(
                      CASE
                        WHEN step -> 'effort' IS NOT NULL THEN jsonb_set(
                          step, '{effort}', pg_temp.effort_out_of_five(step -> 'effort')
                        )
                        ELSE step
                      END
                      ORDER BY step_position
                    ),
                    '[]'::jsonb
                  )
                  FROM jsonb_array_elements(node -> 'steps')
                    WITH ORDINALITY AS steps(step, step_position)
                )
              )
              ELSE node
            END
            ORDER BY node_position
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(session.targeted -> 'nodes')
          WITH ORDINALITY AS nodes(node, node_position)
      )
    )
    ELSE session.targeted
  END
  FROM (
    SELECT CASE
      WHEN prescription -> 'sessionTargets' -> 'effort' IS NOT NULL THEN jsonb_set(
        prescription,
        '{sessionTargets,effort}',
        pg_temp.effort_out_of_five(prescription -> 'sessionTargets' -> 'effort')
      )
      ELSE prescription
    END AS targeted
  ) AS session
$$;--> statement-breakpoint
WITH stale AS (
  SELECT
    occurrence."id" AS "occurrence_id",
    occurrence."user_id",
    version."sport",
    version."program_version_id",
    version."program_day_id",
    version."scheduled_on",
    version."scheduling_zone",
    version."scheduled_local_time",
    version."order_index",
    version."prescription_version",
    version."template_revision_id",
    pg_temp.prescription_out_of_five(version."prescription") AS "prescription",
    version."prescription" AS "before"
  FROM "planned_occurrences" AS occurrence
  JOIN "occurrence_versions" AS version
    ON version."id" = occurrence."current_revision_id"
    AND version."user_id" = occurrence."user_id"
  JOIN "profiles" AS profile ON profile."id" = occurrence."user_id"
  -- A zone Postgres does not know is read as UTC rather than failing the deploy.
  LEFT JOIN pg_timezone_names AS zone ON zone.name = profile."time_zone"
  WHERE occurrence."disposition" IN ('pending', 'skipped')
    AND version."prescription" IS NOT NULL
    AND version."scheduled_on" >= (now() AT TIME ZONE coalesce(zone.name, 'UTC'))::date
    AND NOT EXISTS (
      SELECT 1 FROM "activities" AS activity
      WHERE activity."occurrence_id" = occurrence."id"
        AND activity."user_id" = occurrence."user_id"
    )
    AND EXISTS (
      SELECT 1 FROM "occurrence_versions" AS written
      WHERE written."user_id" = occurrence."user_id"
        AND written."occurrence_id" = occurrence."id"
        AND written."created_at" < '2026-09-21T20:00:00Z'
        AND written."prescription" = version."prescription"
    )
),
revised AS (
  INSERT INTO "occurrence_versions" (
    "occurrence_id", "user_id", "sport", "program_version_id", "program_day_id",
    "scheduled_on", "scheduling_zone", "scheduled_local_time", "order_index",
    "prescription_version", "prescription", "template_revision_id"
  )
  SELECT "occurrence_id", "user_id", "sport", "program_version_id", "program_day_id",
    "scheduled_on", "scheduling_zone", "scheduled_local_time", "order_index",
    "prescription_version", "prescription", "template_revision_id"
  FROM stale
  WHERE "prescription" <> "before"
  RETURNING "id", "occurrence_id", "user_id", "scheduled_on"
),
pointed AS (
  UPDATE "planned_occurrences" AS occurrence
  SET "current_revision_id" = revised."id", "updated_at" = now()
  FROM revised
  WHERE occurrence."id" = revised."occurrence_id"
    AND occurrence."user_id" = revised."user_id"
  RETURNING occurrence."id"
),
withdrawn AS (
  UPDATE "session_plans" AS plan
  SET "status" = 'superseded'
  FROM revised
  WHERE plan."user_id" = revised."user_id"
    AND plan."occurrence_id" = revised."occurrence_id"
    AND plan."status" = 'active'
  RETURNING plan."id"
)
INSERT INTO "occurrence_events" ("user_id", "occurrence_id", "kind", "actor", "source", "occurred_on")
SELECT "user_id", "occurrence_id", 'revised', 'migration', 'migration:0037', "scheduled_on"
FROM revised;--> statement-breakpoint
DROP FUNCTION pg_temp.prescription_out_of_five(jsonb);--> statement-breakpoint
DROP FUNCTION pg_temp.effort_out_of_five(jsonb);
