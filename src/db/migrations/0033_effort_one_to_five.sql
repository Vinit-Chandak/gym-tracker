-- Reported effort stops pretending to ten steps and asks for five.
--
-- `effort_value` has been 1–10 since 0026. Ten steps asked for a precision an athlete does
-- not have: the same run is honestly a 6 or a 7 depending on the hour it is logged, so the
-- extra resolution was noise with a number on it. The picker now offers 1–5, and "Not sure"
-- stays exactly what it was — its own answer, never a zero and never a default.
--
-- Everything already stored is on the old scale, so it is halved here, once, in the same
-- transaction that narrows the constraint. Leaving it would be worse than rewriting it: a
-- column holding a 7 that means "out of ten" beside a 3 that means "out of five" reads as
-- one number and is two, and every average, chart and coach payload over it would be wrong
-- with no way to tell which rows were which. §10.2 preserves a value a *bound* moved past;
-- a scale change is not a bound change, and a number whose denominator silently changed is
-- not preserved evidence.
--
-- The map is floor(x / 2), with 1 held at 1: 1→1, 2–3→1, 4–5→2, 6–7→3, 8–9→4, 10→5. Halving
-- alone sends 1 to 0, and 0 is not on the scale — it would fail the check below and, worse,
-- would turn the athlete's "very easy" into a number the picker cannot show.
--
-- `legacy_unconfirmed` rows are rescaled too. They are not the athlete's word and never
-- become it, but they were written in the same tens as everything else, and a screen that
-- reads them "7/5 (unconfirmed)" is not preserving them, it is mangling them. Their branch
-- of the check stays unbounded, so one that sat above ten keeps its place above the scale,
-- halved. Only they could ever have sat below 1 — the reported branch never allowed it —
-- and the floor takes those to 1 along with a reported 1, because a number the picker
-- cannot show is no more readable than one out of the wrong ten.
--
-- One-way on purpose. 2 and 3 both become 1, so this cannot be reversed; the old numbers are
-- gone once it runs. That is the change that was asked for, and the legacy `runs.rpe` column
-- still holds the original tens for every run that came through the 0026 backfill.

ALTER TABLE "activities" DROP CONSTRAINT "activities_effort_chk";--> statement-breakpoint
UPDATE "activities"
SET "effort_value" = greatest(1, floor("effort_value" / 2)),
    "updated_at" = now()
WHERE "effort_value" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_effort_chk" CHECK ((effort_status = 'reported' and effort_value is not null and effort_value between 1 and 5)
        or (effort_status = 'unknown' and effort_value is null)
        or effort_status = 'legacy_unconfirmed');
