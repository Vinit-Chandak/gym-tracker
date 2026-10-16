DROP INDEX "coach_weekly_reviews_period_uq";--> statement-breakpoint
ALTER TABLE "coach_weekly_reviews" ADD COLUMN "sport" "activity_sport" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_weekly_reviews_sport_period_uq" ON "coach_weekly_reviews" USING btree ("user_id","sport","period_end");