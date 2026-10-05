-- Two holes the code review found in 0045 (docs/planning/ONBOARDING_EQUIPMENT_TECHNIQUE_PROGRESS.md):
--
-- 1. Requirement groups are the seed's alone. 0045 let a signed-in client add its own rows, which
--    sit beside the shared ones under the same unique keys: the next seed to write that key would
--    fail and stop the deploy. Nothing in the app writes or reads such rows, so clients keep only
--    the read policy.
-- 2. A machine's type rows belong to the machine's owner. 0045 checked only the row's own owner,
--    so someone holding another account's machine id could take the key that machine's own row
--    needs.
--
-- Additive and safe to run twice: no row is changed or removed.
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_instances_user_id_uq" ON "equipment_instances" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "equipment_instance_types" DROP CONSTRAINT IF EXISTS "equipment_instance_types_owner_fk";--> statement-breakpoint
ALTER TABLE "equipment_instance_types" ADD CONSTRAINT "equipment_instance_types_owner_fk" FOREIGN KEY ("user_id","equipment_instance_id") REFERENCES "public"."equipment_instances"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_equipment_requirements_insert" ON "exercise_equipment_requirements";--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_equipment_requirements_update" ON "exercise_equipment_requirements";--> statement-breakpoint
DROP POLICY IF EXISTS "exercise_equipment_requirements_delete" ON "exercise_equipment_requirements";
