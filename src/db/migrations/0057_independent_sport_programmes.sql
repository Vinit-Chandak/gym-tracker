CREATE TABLE "sport_coach_preferences" (
	"user_id" uuid NOT NULL,
	"sport" "activity_sport" NOT NULL,
	"intake_id" uuid,
	"review_weekday" integer,
	"review_anchor_at" timestamp with time zone,
	"review_requested_at" timestamp with time zone,
	"consented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sport_coach_preferences_user_id_sport_pk" PRIMARY KEY("user_id","sport")
);
--> statement-breakpoint
ALTER TABLE "sport_coach_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "programs_one_active_per_user_uq";--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "sport" "activity_sport" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "blueprint" jsonb;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "split_from_program_id" uuid;--> statement-breakpoint
ALTER TABLE "coach_intakes" ADD COLUMN "sport" "activity_sport" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD COLUMN "sport" "activity_sport" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD COLUMN "standalone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sport_coach_preferences" ADD CONSTRAINT "sport_coach_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sport_coach_preferences" ADD CONSTRAINT "sport_coach_preferences_intake_id_coach_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."coach_intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_split_from_program_id_programs_id_fk" FOREIGN KEY ("split_from_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "programs_one_active_per_sport_uq" ON "programs" USING btree ("user_id","sport") WHERE status = 'active';--> statement-breakpoint
CREATE POLICY "sport_coach_preferences_owner" ON "sport_coach_preferences" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "sport_coach_preferences" TO authenticated;
--> statement-breakpoint
-- Keep every workout, set, activity, prescription revision and completion event intact.
-- Strength retains its programme id, days and exact position. Only the ownership of the
-- separately identified endurance occurrences moves; their original versions still name
-- the combined programme that prescribed them.
DO $$
DECLARE
  original record;
  chosen_sport activity_sport;
  primary_sport activity_sport;
  successor uuid;
  successor_family uuid;
BEGIN
  FOR original IN SELECT p.* FROM programs p WHERE p.status = 'active' LOOP
    IF EXISTS (SELECT 1 FROM program_days d WHERE d.program_id = original.id AND d.includes_lifting) THEN
      primary_sport := 'strength';
    ELSE
      SELECT o.sport INTO primary_sport FROM planned_occurrences o
        WHERE o.user_id = original.user_id AND o.family_id = original.family_id
        ORDER BY o.sport LIMIT 1;
      IF primary_sport IS NULL THEN
        primary_sport := CASE WHEN EXISTS (SELECT 1 FROM program_runs r WHERE r.program_id = original.id)
          THEN 'running'::activity_sport ELSE 'strength'::activity_sport END;
      END IF;
    END IF;
    UPDATE programs SET sport = primary_sport WHERE id = original.id;
    INSERT INTO sport_coach_preferences (user_id, sport, intake_id, review_weekday, review_anchor_at, review_requested_at, consented_at)
      SELECT user_id, primary_sport, intake_id, review_weekday, review_anchor_at, review_requested_at, consented_at
      FROM coach_preferences WHERE user_id = original.user_id ON CONFLICT DO NOTHING;
    FOR chosen_sport IN
      SELECT DISTINCT o.sport FROM planned_occurrences o
        WHERE o.user_id = original.user_id AND o.family_id = original.family_id AND o.sport <> primary_sport
      UNION SELECT 'running'::activity_sport WHERE primary_sport <> 'running'
        AND EXISTS (SELECT 1 FROM program_runs r WHERE r.program_id = original.id)
        AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.user_id = original.user_id AND p.sport = 'running' AND p.split_from_program_id = original.id)
    LOOP
      successor := gen_random_uuid();
      successor_family := gen_random_uuid();
      INSERT INTO program_families (id, user_id) VALUES (successor_family, original.user_id);
      INSERT INTO programs (id, user_id, family_id, sport, slug, name, version, status, start_date, end_date, weeks, start_day_index, repeats, notes, split_from_program_id)
        VALUES (successor, original.user_id, successor_family, chosen_sport,
          left(original.slug, 36) || '-' || chosen_sport::text || '-' || left(successor::text, 8),
          left(initcap(chosen_sport::text) || ' · ' || original.name, 120), 1, 'active',
          original.start_date, original.end_date, original.weeks, 1, 'weekly', original.notes, original.id);
      INSERT INTO occurrence_events (user_id, occurrence_id, kind, actor, source, detail)
        SELECT user_id, id, 'revised', 'migration', 'independent-sport-programmes',
          jsonb_build_object('previousFamilyId', original.family_id, 'familyId', successor_family,
            'sourceProgramId', original.id, 'programId', successor, 'prescriptionUnchanged', true)
        FROM planned_occurrences WHERE user_id = original.user_id AND family_id = original.family_id AND sport = chosen_sport;
      UPDATE planned_occurrences SET family_id = successor_family, cycle_day_index = null
        WHERE user_id = original.user_id AND family_id = original.family_id AND sport = chosen_sport;
      IF chosen_sport = 'running' THEN
        INSERT INTO program_runs (user_id, program_id, week_index, day_of_week, duration_min_minutes,
          duration_max_minutes, distance_min_km, distance_max_km, rpe_min, rpe_max, pace_note, progression_note, stop_rule, comment)
          SELECT user_id, successor, week_index, day_of_week, duration_min_minutes,
            duration_max_minutes, distance_min_km, distance_max_km, rpe_min, rpe_max, pace_note, progression_note, stop_rule, comment
          FROM program_runs WHERE program_id = original.id;
      END IF;
      INSERT INTO sport_coach_preferences (user_id, sport, intake_id, review_weekday, review_requested_at, consented_at)
        SELECT user_id, chosen_sport, intake_id, review_weekday, now(), consented_at
        FROM coach_preferences WHERE user_id = original.user_id ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint
-- Retire in-flight combined-sport preparations. The next dispatch reads explicit targets.
UPDATE coach_jobs SET status = 'superseded', lease_until = null, completed_at = now(),
  error = 'Programmes now progress independently by sport. A fresh preparation will use the separated plans.'
WHERE status IN ('queued', 'claimed');
--> statement-breakpoint
UPDATE coach_intakes SET sport = COALESCE((answers->>'programmeSport')::activity_sport, 'strength');
--> statement-breakpoint
UPDATE program_drafts d SET sport = COALESCE((SELECT p.sport FROM programs p WHERE p.id = d.base_program_id), 'strength');
