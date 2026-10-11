-- The shared tables (0021) are written only through a server write, as the canonical tables are
-- (0026). Their policies checked the owner alone, so a signed-in browser holding its own token
-- and the public key could write its rows through the Data API: a 400 kg bench past the set
-- limits, on every follower's board and Stronger badge, or a records list that is not a list,
-- which makes jsonb_array_length throw for every follower reading the feed or a board.
--
-- Every writer in the app runs in a writing `withUser`, which sets the marker; the backfill and
-- the seeders run as the migration role, which RLS does not apply to. Reads are unchanged.
--
-- Additive and safe to run twice: the existing rows already hold an array and an object, each
-- constraint is dropped if present before it is added, and altering a policy repeats cleanly.
ALTER TABLE "shared_session_stats" DROP CONSTRAINT IF EXISTS "shared_session_stats_records_chk";--> statement-breakpoint
ALTER TABLE "shared_session_stats" ADD CONSTRAINT "shared_session_stats_records_chk" CHECK (jsonb_typeof(records) = 'array');--> statement-breakpoint
ALTER TABLE "shared_session_stats" DROP CONSTRAINT IF EXISTS "shared_session_stats_muscle_sets_chk";--> statement-breakpoint
ALTER TABLE "shared_session_stats" ADD CONSTRAINT "shared_session_stats_muscle_sets_chk" CHECK (jsonb_typeof(muscle_sets) = 'object');--> statement-breakpoint
ALTER POLICY "shared_body_weight_insert" ON "shared_body_weight" TO authenticated WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
ALTER POLICY "shared_body_weight_update" ON "shared_body_weight" TO authenticated USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
ALTER POLICY "shared_body_weight_delete" ON "shared_body_weight" TO authenticated USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
ALTER POLICY "shared_exercise_stats_insert" ON "shared_exercise_stats" TO authenticated WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
ALTER POLICY "shared_exercise_stats_update" ON "shared_exercise_stats" TO authenticated USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
ALTER POLICY "shared_exercise_stats_delete" ON "shared_exercise_stats" TO authenticated USING (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
ALTER POLICY "shared_session_stats_insert" ON "shared_session_stats" TO authenticated WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
ALTER POLICY "shared_session_stats_update" ON "shared_session_stats" TO authenticated USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());--> statement-breakpoint
ALTER POLICY "shared_session_stats_delete" ON "shared_session_stats" TO authenticated USING (user_id = (select auth.uid()) and public.server_write());
