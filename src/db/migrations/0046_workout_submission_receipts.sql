-- Receipts for exercises added to a session in one submission (plan:
-- docs/planning/ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md, "Add several exercises in one
-- submission"). The same pattern as 0040's food receipts, in a table of its own beside it.
--
-- Additive and safe to run twice, as 0040 is: the table is created if missing, and each policy
-- dropped if present before it is created.
CREATE TABLE IF NOT EXISTS "workout_submission_receipts" (
  "user_id" uuid NOT NULL CONSTRAINT "workout_submission_receipts_user_id_profiles_id_fk" REFERENCES "public"."profiles" ("id") ON DELETE CASCADE,
  "submission_key" uuid NOT NULL,
  "payload_digest" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workout_submission_receipts_user_id_submission_key_pk" PRIMARY KEY ("user_id", "submission_key")
);--> statement-breakpoint
ALTER TABLE "workout_submission_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "workout_submission_receipts_select" ON "workout_submission_receipts";--> statement-breakpoint
CREATE POLICY "workout_submission_receipts_select" ON "workout_submission_receipts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "workout_submission_receipts_insert" ON "workout_submission_receipts";--> statement-breakpoint
CREATE POLICY "workout_submission_receipts_insert" ON "workout_submission_receipts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
DROP POLICY IF EXISTS "workout_submission_receipts_update" ON "workout_submission_receipts";--> statement-breakpoint
CREATE POLICY "workout_submission_receipts_update" ON "workout_submission_receipts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
DROP POLICY IF EXISTS "workout_submission_receipts_delete" ON "workout_submission_receipts";--> statement-breakpoint
CREATE POLICY "workout_submission_receipts_delete" ON "workout_submission_receipts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());
