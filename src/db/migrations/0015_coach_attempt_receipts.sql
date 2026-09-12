CREATE TABLE "coach_job_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text NOT NULL,
	"source_revision" bigint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"result_digest" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "coach_job_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_job_attempts" ADD CONSTRAINT "coach_job_attempts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_job_attempts" ADD CONSTRAINT "coach_job_attempts_job_id_coach_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."coach_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_job_attempts_number_uq" ON "coach_job_attempts" USING btree ("job_id","number");--> statement-breakpoint
CREATE POLICY "coach_job_attempts_owner" ON "coach_job_attempts" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE FUNCTION public.record_coach_job_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'claimed' AND NEW.attempt_id IS NOT NULL AND
    (OLD.attempt_id IS DISTINCT FROM NEW.attempt_id OR OLD.status <> 'claimed') THEN
    INSERT INTO public.coach_job_attempts
      (id, user_id, job_id, number, status, source_revision, started_at, lease_until)
    VALUES (NEW.attempt_id, NEW.user_id, NEW.id, NEW.attempts, 'claimed',
      NEW.source_revision, NEW.updated_at, NEW.lease_until);
  ELSIF OLD.status = 'claimed' AND OLD.attempt_id IS NOT NULL AND NEW.status <> 'claimed' THEN
    UPDATE public.coach_job_attempts SET
      status = CASE WHEN NEW.status = 'queued' THEN 'retry_queued' ELSE NEW.status END,
      finished_at = NEW.updated_at, result_digest = NEW.result_digest, error = NEW.error
    WHERE id = OLD.attempt_id AND job_id = OLD.id AND user_id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER coach_job_attempt_receipt AFTER UPDATE ON public.coach_jobs
FOR EACH ROW EXECUTE FUNCTION public.record_coach_job_attempt();
