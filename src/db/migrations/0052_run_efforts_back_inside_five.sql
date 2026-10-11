-- A programme run whose effort is above five, put back on the five steps (0034).
--
-- 0034 moved every planned effort onto the athlete's five steps, and the blueprint's bound came
-- down with it. A coach's run proposal still accepted an effort out of ten until October 2026,
-- and applying one wrote it straight into `program_runs`: the next read of the programme failed
-- its parse and took Today, the programme and the coach down with it. Proposals are now bounded
-- and checked before they are applied (program-revisions.ts); this repairs what got through.
--
-- A row above five was written on the old scale at both ends, so both ends are halved together
-- with 0034's map (6–7→3, 8–9→4, 10→5; 0 stays "nothing asked"), which also keeps the low end
-- under the high one. Safe to run twice: nothing is left above five for it to touch.
UPDATE "program_runs"
SET "rpe_min" = case when "rpe_min" = 0 then 0 else greatest(1, floor("rpe_min" / 2)) end,
    "rpe_max" = case when "rpe_max" = 0 then 0 else greatest(1, floor("rpe_max" / 2)) end
WHERE "rpe_min" > 5 OR "rpe_max" > 5;
