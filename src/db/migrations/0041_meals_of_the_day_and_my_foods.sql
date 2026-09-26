-- Meals of the day and My foods (ADR 0033).
--
-- A day's food is now six fixed meals (breakfast, morning snack, lunch, afternoon snack, dinner,
-- evening snack) holding entries, and every food logged is kept in `foods` to be logged again at
-- any portion. An entry is a copy of its food and how much of it was eaten, so correcting a food
-- never rewrites a day. Saved meals keep their table; their items gain portions and amounts.
--
-- Written by hand from what Drizzle generated, in the ways 0038 was:
--   * Safe to run twice: tables and indexes are created if missing, keys and policies are dropped
--     if present before they are created, and every copy below skips what is already there.
--   * The `(user_id, id)` unique index on `foods` comes before the key that references it.
--   * `food_entries_food_fk` sets only `food_id` to null when a food is deleted. A bare
--     `set null` on a key that includes the owner would null `user_id` too.
--
-- The freely named meals and their foods (`meals`, `meal_items`) are copied into `food_entries`
-- and left in place. The build that applies this migration runs while the previous deployment
-- still serves requests, and that deployment reads them; a later migration drops them.
CREATE TABLE IF NOT EXISTS "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"portion_amount" numeric(7, 2) NOT NULL,
	"unit" text NOT NULL,
	"kcal" numeric(6, 1) NOT NULL,
	"carbs_g" numeric(5, 1),
	"fat_g" numeric(5, 1),
	"protein_g" numeric(5, 1),
	"last_logged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_values_chk" CHECK (char_length(name) between 1 and 80
        and portion_amount > 0 and portion_amount <= 10000
        and unit in ('g', 'kg', 'ml', 'l', 'oz', 'cup', 'tbsp', 'tsp', 'piece', 'slice', 'scoop', 'serving')
        and kcal between 0 and 10000
        and (carbs_g is null or carbs_g between 0 and 1000)
        and (fat_g is null or fat_g between 0 and 1000)
        and (protein_g is null or protein_g between 0 and 1000))
);
--> statement-breakpoint
ALTER TABLE "foods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "foods_owner_id_uq" ON "foods" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "foods_owner_name_uq" ON "foods" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"eaten_on" date NOT NULL,
	"meal" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"food_id" uuid,
	"name" text NOT NULL,
	"portion_amount" numeric(7, 2) NOT NULL,
	"unit" text NOT NULL,
	"kcal" numeric(6, 1) NOT NULL,
	"carbs_g" numeric(5, 1),
	"fat_g" numeric(5, 1),
	"protein_g" numeric(5, 1),
	"amount" numeric(7, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_entries_values_chk" CHECK (meal in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'evening_snack')
        and position >= 0
        and amount > 0 and amount <= 10000
        and char_length(name) between 1 and 80
        and portion_amount > 0 and portion_amount <= 10000
        and unit in ('g', 'kg', 'ml', 'l', 'oz', 'cup', 'tbsp', 'tsp', 'piece', 'slice', 'scoop', 'serving')
        and kcal between 0 and 10000
        and (carbs_g is null or carbs_g between 0 and 1000)
        and (fat_g is null or fat_g between 0 and 1000)
        and (protein_g is null or protein_g between 0 and 1000))
);
--> statement-breakpoint
ALTER TABLE "food_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_entries_user_day_idx" ON "food_entries" USING btree ("user_id","eaten_on");--> statement-breakpoint
ALTER TABLE "foods" DROP CONSTRAINT IF EXISTS "foods_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_entries" DROP CONSTRAINT IF EXISTS "food_entries_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_entries" DROP CONSTRAINT IF EXISTS "food_entries_food_fk";--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_food_fk" FOREIGN KEY ("user_id","food_id") REFERENCES "public"."foods"("user_id","id") ON DELETE SET NULL ("food_id") ON UPDATE no action;--> statement-breakpoint
DROP POLICY IF EXISTS "foods_owner" ON "foods";--> statement-breakpoint
CREATE POLICY "foods_owner" ON "foods" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "food_entries_owner" ON "food_entries";--> statement-breakpoint
CREATE POLICY "food_entries_owner" ON "food_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
-- Every named food ever logged becomes one of the account's foods, one per name whatever its
-- capitals, with the figures it was most lately logged with. The old meals had no portions, so
-- each is one serving of exactly what was entered.
INSERT INTO "foods" ("user_id", "name", "portion_amount", "unit", "kcal", "carbs_g", "fat_g", "protein_g", "last_logged_at", "created_at", "updated_at")
SELECT DISTINCT ON (i."user_id", lower(btrim(i."name")))
  i."user_id", btrim(i."name"), 1, 'serving', i."kcal", i."carbs_g", i."fat_g", i."protein_g",
  i."created_at", i."created_at", i."created_at"
FROM "meal_items" i
WHERE btrim(coalesce(i."name", '')) <> ''
ORDER BY i."user_id", lower(btrim(i."name")), i."created_at" DESC, i."id"
ON CONFLICT ("user_id", lower("name")) DO NOTHING;--> statement-breakpoint
-- Every food of every old meal becomes an entry under its own id, so a second run skips it. Its
-- meal is the one the old meal's name says, where it says one, and otherwise the one the hour it
-- was logged falls in on the account's own clock. An unnamed food takes its meal's name.
WITH "zones" AS (SELECT "name" FROM pg_timezone_names)
INSERT INTO "food_entries" ("id", "user_id", "eaten_on", "meal", "position", "food_id", "name", "portion_amount", "unit", "kcal", "carbs_g", "fat_g", "protein_g", "amount", "created_at", "updated_at")
SELECT i."id", i."user_id", m."eaten_on",
  CASE
    WHEN m."name" ~* 'breakfast' THEN 'breakfast'
    WHEN m."name" ~* 'lunch' THEN 'lunch'
    WHEN m."name" ~* 'dinner|supper' THEN 'dinner'
    ELSE CASE
      WHEN h."hour" >= 4 AND h."hour" < 10 THEN 'breakfast'
      WHEN h."hour" >= 10 AND h."hour" < 12 THEN 'morning_snack'
      WHEN h."hour" >= 12 AND h."hour" < 15 THEN 'lunch'
      WHEN h."hour" >= 15 AND h."hour" < 18 THEN 'afternoon_snack'
      WHEN h."hour" >= 18 AND h."hour" < 22 THEN 'dinner'
      ELSE 'evening_snack'
    END
  END,
  i."position", f."id", coalesce(nullif(btrim(i."name"), ''), m."name"),
  1, 'serving', i."kcal", i."carbs_g", i."fat_g", i."protein_g", 1,
  m."created_at", m."updated_at"
FROM "meal_items" i
JOIN "meals" m ON m."user_id" = i."user_id" AND m."id" = i."meal_id"
JOIN "profiles" p ON p."id" = m."user_id"
LEFT JOIN "zones" z ON z."name" = p."time_zone"
CROSS JOIN LATERAL (
  SELECT extract(hour FROM m."created_at" AT TIME ZONE coalesce(z."name", 'UTC'))::int AS "hour"
) h
LEFT JOIN "foods" f ON f."user_id" = i."user_id" AND lower(f."name") = lower(btrim(i."name"))
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Saved meals' foods gain what an entry has: the food they came from, a portion and an amount.
-- The old ones were one serving of what was entered. Items already in this shape are left alone.
UPDATE "saved_meals" s
SET "items" = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'foodId', (
        SELECT f."id" FROM "foods" f
        WHERE f."user_id" = s."user_id" AND lower(f."name") = lower(btrim(e."item"->>'name'))
      ),
      'name', coalesce(nullif(btrim(e."item"->>'name'), ''), s."name"),
      'portionAmount', 1,
      'unit', 'serving',
      'kcal', e."item"->'kcal',
      'carbsG', e."item"->'carbsG',
      'fatG', e."item"->'fatG',
      'proteinG', e."item"->'proteinG',
      'amount', 1
    )
    ORDER BY e."position"
  )
  FROM jsonb_array_elements(s."items") WITH ORDINALITY AS e("item", "position")
)
WHERE NOT (s."items"->0 ? 'amount');
