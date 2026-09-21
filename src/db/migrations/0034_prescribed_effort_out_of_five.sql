-- What a plan asks for moves onto the scale the answer is given on.
--
-- 0033 put the athlete's own report on five steps. A programme still asked out of ten, so a
-- run card read "RPE 6–7" above a form whose highest answer was 5. Two scales wearing one
-- word is worse than either scale: the athlete cannot tell whether they did what was asked,
-- and neither can the coach.
--
-- This is not optional the way rescaling the report was. `programs.ts` rebuilds a blueprint
-- from these columns on every programme read and parses it, so the moment the blueprint's
-- bound came down to five, every stored programme with a run above RPE 5 would have failed
-- to load. The columns and the bound have to move in the same deploy.
--
-- Same halving as 0033, with one difference at the bottom. Zero is not an effort here, it is
-- "nothing was asked": `programBlueprintFromRows` reads a null `rpe_min` as 0, so a zero has
-- to survive as a zero rather than being lifted to 1 like a reported 1 was. Above zero the
-- map is 0033's exactly — 1→1, 2–3→1, 4–5→2, 6–7→3, 8–9→4, 10→5 — so a target and a report
-- that meant the same thing before still mean the same thing.
--
-- What is deliberately NOT touched: `occurrence_versions.prescription`. Those rows are
-- immutable, a logged activity pins the exact one it was performed against, and
-- `program-occurrences.ts` refuses to revise an occurrence that is logged or in the past
-- precisely so that history keeps saying what was actually prescribed on the day. Rewriting
-- them would make a past run claim it answered a target nobody ever showed it. Future
-- occurrences need no rewriting here either: the blueprint they are re-materialised from now
-- differs from what they hold, so the next revision writes each a new version by the ordinary
-- path, which is the one place a prescription is allowed to change.

UPDATE "program_runs"
SET "rpe_min" = case when "rpe_min" = 0 then 0 else greatest(1, floor("rpe_min" / 2)) end,
    "rpe_max" = case when "rpe_max" = 0 then 0 else greatest(1, floor("rpe_max" / 2)) end
WHERE "rpe_min" IS NOT NULL OR "rpe_max" IS NOT NULL;
