-- One pair of distance units an account, on its profile, that starts from the weight unit
-- (owner, 12 October 2026; ADR 0056).
--
-- Each sport's row in `user_sport_preferences` had its own road and pool unit, defaulting to
-- kilometres and metres, and no screen set them: an account in pounds read its runs in
-- kilometres. The profile now holds them, null meaning "as the weight unit says": miles and yard
-- pools for pounds, kilometres and metre pools for kilograms. A unit is stored only where it
-- differs from that.
--
-- So nearly every account starts as null, following its weight unit. Kilometres and metres were
-- defaults nobody could have chosen, and miles or yards beside pounds are what pounds now give.
-- The one thing kept is a unit neither the old default nor the weight unit explains: miles for a
-- run or a ride, or yard pools, on an account in kilograms. Setup's units sheet could have set
-- those since 11 October, and they stay as chosen.
--
-- Written by hand from what Drizzle generated, and safe to run twice like 0042 to 0051: the
-- columns are added only if missing, the check is replaced, and only a profile with no unit yet
-- is given one. The per-sport columns stay: the build that applies this runs while the previous
-- deployment still serves requests, and that deployment reads and writes them. A later migration
-- can drop them.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "distance_unit" "length_unit";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "pool_unit" "length_unit";--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_units_chk";--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_units_chk" CHECK ((distance_unit is null or distance_unit in ('km', 'mi'))
        and (pool_unit is null or pool_unit in ('m', 'yd')));--> statement-breakpoint
UPDATE "profiles" AS p
SET "distance_unit" = 'mi'
WHERE p.distance_unit IS NULL
	AND p.preferred_unit <> 'lb'
	AND EXISTS (
		SELECT 1 FROM "user_sport_preferences" AS s
		WHERE s.user_id = p.id AND s.sport IN ('running', 'cycling') AND s.distance_unit = 'mi'
	);--> statement-breakpoint
UPDATE "profiles" AS p
SET "pool_unit" = 'yd'
WHERE p.pool_unit IS NULL
	AND p.preferred_unit <> 'lb'
	AND EXISTS (
		SELECT 1 FROM "user_sport_preferences" AS s
		WHERE s.user_id = p.id AND s.sport = 'swimming' AND s.pool_unit = 'yd'
	);
