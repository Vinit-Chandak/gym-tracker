-- The foods and saved meals eaten most come first (owner, 8 October 2026).
--
-- A food's count is its entries, which keep `food_id`, so it needs only an index to be counted
-- cheaply. A saved meal's entries are copies with no link back to it, so a saved meal keeps its
-- own count, raised each time it is added to a meal, and when it was last added.
--
-- Nothing recorded which meals came from a saved meal before this, so each saved meal starts
-- from the meals of a day that held exactly its foods (any amounts; a quick add beside them does
-- not count against it), when it was last so, and nothing more. A saved meal whose foods have
-- since been deleted from My foods starts at none.
--
-- Written by hand from what Drizzle generated, and safe to run twice like 0036 to 0043: the
-- columns and index are added only if missing, and only a meal never counted is counted. The
-- previous deployment neither reads nor writes the new columns, and their defaults hold for the
-- meals it saves meanwhile.
ALTER TABLE "saved_meals" ADD COLUMN IF NOT EXISTS "times_logged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_meals" ADD COLUMN IF NOT EXISTS "last_logged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_entries_user_food_idx" ON "food_entries" USING btree ("user_id","food_id");--> statement-breakpoint
WITH meal_foods AS (
  SELECT saved.id, saved.user_id,
         array_agg(DISTINCT (item ->> 'foodId')::uuid ORDER BY (item ->> 'foodId')::uuid) AS foods
  FROM "saved_meals" AS saved, jsonb_array_elements(saved.items) AS item
  WHERE item ->> 'foodId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  GROUP BY saved.id, saved.user_id
),
day_meals AS (
  SELECT user_id, eaten_on, meal, max(created_at) AS logged_at,
         array_agg(DISTINCT food_id ORDER BY food_id) AS foods
  FROM "food_entries"
  WHERE food_id IS NOT NULL
  GROUP BY user_id, eaten_on, meal
),
matched AS (
  SELECT meal_foods.id, count(*)::integer AS times, max(day_meals.logged_at) AS last_logged_at
  FROM meal_foods
  JOIN day_meals ON day_meals.user_id = meal_foods.user_id AND day_meals.foods = meal_foods.foods
  GROUP BY meal_foods.id
)
UPDATE "saved_meals"
SET "times_logged" = matched.times, "last_logged_at" = matched.last_logged_at
FROM matched
WHERE "saved_meals".id = matched.id
  AND "saved_meals"."times_logged" = 0
  AND "saved_meals"."last_logged_at" IS NULL;
