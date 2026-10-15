-- A profile's time zone is spelt as the zone database spells it.
--
-- The field was free text, checked only by whether the browser's clock could read it, and kept
-- as typed. "asia/kolkata" reads the same to every clock, but a data migration that matches a
-- profile's zone against Postgres's own list by name, as 0037, 0041 and 0044 do, finds nothing
-- for it and leaves the account out. The field is a list of places now, and a save stores the
-- spelling Postgres gives; this puts right the profiles saved before that.
--
-- Only the case is mended, and only where Postgres knows the zone under another case: the one
-- change that cannot move anyone's clock. An abbreviation or an offset ("EST", "+05:30") is left
-- as it is, since nothing says which place was meant; Edit profile asks for one in its stead.
-- Safe to run twice: a second run finds nothing spelt differently.
UPDATE "profiles" AS p
SET "time_zone" = z."name"
FROM (SELECT DISTINCT "name" FROM pg_timezone_names) AS z
WHERE lower(z."name") = lower(p."time_zone")
  AND z."name" <> p."time_zone";
