-- A composite SET NULL must clear the optional resource, never its required owner.
ALTER TABLE "cycling_activity_details" DROP CONSTRAINT IF EXISTS "cycling_details_resource_fk";--> statement-breakpoint
ALTER TABLE "cycling_activity_details" ADD CONSTRAINT "cycling_details_resource_fk"
FOREIGN KEY ("user_id", "resource_id") REFERENCES "public"."activity_resources" ("user_id", "id")
ON DELETE SET NULL ("resource_id");--> statement-breakpoint
ALTER TABLE "swimming_activity_details" DROP CONSTRAINT IF EXISTS "swimming_details_resource_fk";--> statement-breakpoint
ALTER TABLE "swimming_activity_details" ADD CONSTRAINT "swimming_details_resource_fk"
FOREIGN KEY ("user_id", "resource_id") REFERENCES "public"."activity_resources" ("user_id", "id")
ON DELETE SET NULL ("resource_id");
