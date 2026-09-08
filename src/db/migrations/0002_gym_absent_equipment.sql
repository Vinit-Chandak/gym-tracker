CREATE TABLE "gym_absent_equipment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gym_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym_absent_equipment_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gym_absent_equipment_types" ADD CONSTRAINT "gym_absent_equipment_types_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_absent_equipment_types" ADD CONSTRAINT "gym_absent_equipment_types_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_absent_equipment_types" ADD CONSTRAINT "gym_absent_equipment_types_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gym_absent_equipment_types_gym_type_uq" ON "gym_absent_equipment_types" USING btree ("gym_id","equipment_type_id");--> statement-breakpoint
CREATE POLICY "gym_absent_equipment_types_owner" ON "gym_absent_equipment_types" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));