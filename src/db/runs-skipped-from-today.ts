import { sql } from "drizzle-orm";

import type { DbOrTx } from "./types";

/**
 * The statement of migration 0054 (`runs_skipped_from_today`, ADR 0051), as the migration
 * writes it: each pending run with no activity behind it whose day has a run skip recorded on
 * the day becomes skipped, with the event a skip from Today writes, unless the athlete took it
 * up again after the skip. The migration file says why each rule is there; a test holds the two
 * to the same text.
 */
export const RUNS_SKIPPED_FROM_TODAY = `WITH "day_skips" AS (
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
        AND later."kind" IN ('reopened', 'logged', 'log_deleted')
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
JOIN "skipped" ON "skipped"."id" = "owed"."id"
RETURNING "occurrence_id";`;

/**
 * Carries any run skip still recorded on the day onto the day's runs, as the migration did, and
 * says how many runs it skipped. Run by every deploy after the migrations and the occurrence
 * repair, because a skip on the day can still turn up after the migration ran:
 *
 * - the deployment being replaced keeps serving while this one builds, and its "Pick up from
 *   today" and Today's skip write the run's skip on the day alone;
 * - a programme first given its runs' occurrences by the repair (`materialiseMissingOccurrences`)
 *   recorded its run skips on its days, where they had to go.
 *
 * Left on the day, either reads as a run still owed once the day's skip gives way to it
 * (`withDerivedRunEvents`), and the programme goes back to it. Safe to run on every deploy: it
 * writes nothing once nothing pending is left to skip, and a run the athlete put back, or logged
 * and deleted the log of, since the skip is never skipped again.
 */
export async function carryDaySkipsOntoRuns(db: DbOrTx): Promise<number> {
  const result = await db.execute(sql.raw(RUNS_SKIPPED_FROM_TODAY));
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return rows.length;
}
