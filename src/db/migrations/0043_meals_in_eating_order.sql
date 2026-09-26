-- Meals in eating order, and a late-night snack (ADR 0036).
--
-- An evening snack now comes before dinner, and a late-night snack after it. The order lives in
-- the code; the table only has to accept the new meal. Nothing already logged moves: an entry in
-- `evening_snack` stays there.
--
-- Written by hand from what Drizzle generated, and safe to run twice like 0036 to 0042: the check
-- is dropped if present before it is added. The previous deployment writes only the six meals it
-- knows, which the wider check still accepts.
ALTER TABLE "food_entries" DROP CONSTRAINT IF EXISTS "food_entries_values_chk";--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_values_chk" CHECK (meal in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'evening_snack', 'dinner', 'late_night_snack')
        and position >= 0
        and amount > 0 and amount <= 10000
        and char_length(name) between 1 and 80
        and portion_amount > 0 and portion_amount <= 10000
        and unit in ('g', 'kg', 'ml', 'l', 'oz', 'cup', 'tbsp', 'tsp', 'piece', 'slice', 'scoop', 'serving')
        and kcal between 0 and 10000
        and (carbs_g is null or carbs_g between 0 and 1000)
        and (fat_g is null or fat_g between 0 and 1000)
        and (protein_g is null or protein_g between 0 and 1000));