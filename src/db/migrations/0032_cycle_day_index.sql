-- Endurance work stops being joined to the cycle by the weekday it usually falls on.
--
-- `slot_lineage_id` was derived from the programme family and an ISO weekday, by activation,
-- by the backfill and by every reader. A weekday is not an identity here: the cycle is an
-- ordered sequence of day slots that shifts when a day is missed, `day_of_week` is only a
-- note about when each usually falls, a cycle longer than a week must repeat weekdays, and
-- nothing ever required a lifting day's weekday to differ from a running day's. Where two
-- days shared one, the run of the day that runs was handed to the day that does not — Today
-- offered a 30-minute easy run beside a pull-up session, and the sequence could never accept
-- an answer for it, because a day that carries no endurance asks for none.
--
-- The slot is written down now, in `cycle_day_index`, and every reader reads it. This fills
-- it in for work that already exists, and re-keys the lineage to match.

ALTER TABLE "planned_occurrences" DROP CONSTRAINT "planned_occurrences_programme_chk";--> statement-breakpoint
ALTER TABLE "planned_occurrences" ADD COLUMN "cycle_day_index" integer;--> statement-breakpoint
CREATE INDEX "planned_occurrences_cycle_slot_idx" ON "planned_occurrences" USING btree ("user_id","family_id","cycle_index","cycle_day_index");--> statement-breakpoint
ALTER TABLE "planned_occurrences" ADD CONSTRAINT "planned_occurrences_programme_chk" CHECK ((family_id is not null) or (slot_lineage_id is null and cycle_index is null
            and cycle_day_index is null and original_week_index is null));--> statement-breakpoint
-- The derivation both keys use, so the backfill below reads an existing row exactly as the
-- application wrote it and writes the new one exactly as the application now expects. The
-- salt is what distinguishes them: 7919 per ISO weekday was the old key and remains the key
-- of endurance work that belongs to no slot at all; 39193 per cycle day is the new one.
CREATE FUNCTION "occurrence_lineage_0032"("family_id" uuid, "salt" integer)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4) || '-' ||
    substr(h, 17, 4) || '-' || substr(h, 21, 8) ||
    lpad(to_hex(((('x' || right(h, 4))::bit(16)::int) # salt) & 65535), 4, '0')
  )::uuid
  FROM (SELECT replace(family_id::text, '-', '')) AS s(h)
$$;--> statement-breakpoint
WITH fam AS (
  SELECT DISTINCT o."user_id", o."family_id"
  FROM "planned_occurrences" o
  WHERE o."family_id" IS NOT NULL AND o."slot_lineage_id" IS NOT NULL
),
-- The shape of the block the athlete is on: a family's newest version is the cycle the
-- sequence projects, so it is the one whose day slots an occurrence has to answer to.
prog AS (
  SELECT DISTINCT ON (g."user_id", g."family_id")
    g."user_id", g."family_id", g."id" AS "program_id"
  FROM "programs" g
  JOIN fam ON fam."user_id" = g."user_id" AND fam."family_id" = g."family_id"
  ORDER BY g."user_id", g."family_id", g."version" DESC, g."created_at" DESC
),
-- Every lineage the weekday derivation could have produced for this family, and the weekday
-- behind it. Reversing the key this way needs no guess: it is the same arithmetic.
weekday AS (
  SELECT fam."user_id", fam."family_id", d AS "day_of_week",
    "occurrence_lineage_0032"(fam."family_id", d * 7919) AS "lineage"
  FROM fam, generate_series(1, 7) AS d
),
-- Only a day that actually carries endurance can answer for a run. A lifting day sharing the
-- weekday is not the run's day, which is the whole of the defect. Where a programme has two
-- running days on one weekday the earlier slot takes it, deterministically; a weekday with no
-- running day at all resolves to nothing and its work stays unattached.
slot AS (
  SELECT w."user_id", w."family_id", w."lineage", min(pd."day_index") AS "cycle_day_index"
  FROM weekday w
  JOIN prog ON prog."user_id" = w."user_id" AND prog."family_id" = w."family_id"
  JOIN "program_days" pd
    ON pd."program_id" = prog."program_id"
   AND pd."day_of_week" = w."day_of_week"
   AND pd."includes_run" = true
  GROUP BY w."user_id", w."family_id", w."lineage"
)
UPDATE "planned_occurrences" o
SET "cycle_day_index" = slot."cycle_day_index",
    "slot_lineage_id" = "occurrence_lineage_0032"(o."family_id", slot."cycle_day_index" * 39193),
    "updated_at" = now()
FROM slot
WHERE slot."user_id" = o."user_id"
  AND slot."family_id" = o."family_id"
  AND slot."lineage" = o."slot_lineage_id";--> statement-breakpoint
-- Anything left with no `cycle_day_index` belongs to no slot of the current cycle: a legacy
-- run planned on a weekday no running day falls on, and work a revision left behind. It keeps
-- its row, its history and its old weekday lineage, so a later revision still recognises it
-- and withdraws it rather than writing a second copy. No day offers it in the meantime.
DROP FUNCTION "occurrence_lineage_0032"(uuid, integer);
