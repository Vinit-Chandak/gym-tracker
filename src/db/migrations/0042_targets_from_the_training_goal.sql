-- Targets from the training goal (ADR 0035).
--
-- Fat becomes a share of the day's target that the account sets, where it was a fixed quarter,
-- and a new set of targets starts from a split the profile's training goal chooses rather than
-- one stored here. Every account on the fixed 55 / 25 / 20 split moves to protein per kilogram,
-- worked out from its own target and newest body weight, so its protein stays within rounding of
-- what it was: 20% of the target. From then on it follows the account's weigh-ins. An account
-- with no body weight is left as it is; its protein is the goal's share of the target until it
-- has one, which for every goal but losing fat is the same 20%.
--
-- Written by hand from what Drizzle generated, and safe to run twice like 0036 to 0041: the
-- column is added if missing, the check is dropped if present before it is added, and the
-- conversion only reads rows still on the fixed split, which it moves off it.
--
-- `macro_split` stays. The build that applies this runs while the previous deployment still
-- serves requests, and that deployment reads it. It gives an account moved to `body_weight` here
-- the same protein as this deployment does, and fat stays the quarter it always gave, since every
-- row starts at 25%. A later migration can drop the column.
ALTER TABLE "nutrition_targets" ADD COLUMN IF NOT EXISTS "fat_percent" smallint DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "nutrition_targets" DROP CONSTRAINT IF EXISTS "nutrition_targets_values_chk";--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_values_chk" CHECK (daily_kcal between 500 and 10000
        and protein_per_kg between 0.5 and 4
        and fat_percent between 5 and 80
        and macro_split in ('body_weight', 'fixed_55_25_20'));--> statement-breakpoint
UPDATE "nutrition_targets" AS t
SET
	"protein_per_kg" = least(4, greatest(0.5, round(t.daily_kcal * 0.2 / 4 / p.body_weight_kg, 1))),
	"macro_split" = 'body_weight',
	"updated_at" = now()
FROM "profiles" AS p
WHERE p.id = t.user_id
	AND t.macro_split = 'fixed_55_25_20'
	AND p.body_weight_kg IS NOT NULL;
