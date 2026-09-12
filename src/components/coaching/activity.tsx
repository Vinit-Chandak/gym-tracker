import { desc, eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { coachWeeklyReviews } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { firstWeeklyReviewPeriod, nextWeeklyReviewPeriod } from "@/domain/coach-cadence";
import { requireProfiledUser } from "@/server/auth";
import { getCoachingPreferences } from "@/server/repositories/coaching-state";
import { listCoachJobs } from "@/server/repositories/coaching-jobs";
import { WeeklyReviewSettings } from "./review-settings";
export async function CoachingActivity({ settings = false }: { settings?: boolean }) {
  if (process.env.COACH_WORKFLOW_ENABLED !== "true") return null;
  const user = await requireProfiledUser();
  const [preference, jobs, reviews] = await withUser(getDb(), user.id, (tx) =>
    Promise.all([
      getCoachingPreferences(tx, user.id),
      listCoachJobs(tx, user.id, 5),
      tx
        .select()
        .from(coachWeeklyReviews)
        .where(eq(coachWeeklyReviews.userId, user.id))
        .orderBy(desc(coachWeeklyReviews.periodEnd))
        .limit(3),
    ]),
  );
  const latest = jobs[0];
  const period =
    preference?.mode === "coach" && preference.reviewWeekday && preference.consentedAt
      ? preference.reviewAnchorAt
        ? nextWeeklyReviewPeriod({
            previousScheduledBoundary: preference.reviewAnchorAt,
            reviewWeekday: preference.reviewWeekday,
          })
        : firstWeeklyReviewPeriod(preference.consentedAt, preference.reviewWeekday)
      : null;
  if (!settings && !latest && !reviews.length) return null;
  return (
    <Card>
      <h2 className="font-medium">Coaching activity</h2>
      <p className="text-sm text-ink-muted">
        Daily preparation runs at 04:00 India time. Logging and finishing workouts do not start AI
        runs.
      </p>
      {latest && (
        <p className="text-sm">
          {latest.kind === "create_program"
            ? "Programme creation"
            : latest.kind === "review_program"
              ? "Programme review"
              : "Session preparation"}
          : {latest.status.replaceAll("_", " ")}
          {latest.error ? ` — ${latest.error}` : ""}
        </p>
      )}
      {reviews.map((review) => (
        <div key={review.id} className="border-t border-line pt-3">
          <p className="text-sm font-medium">
            {review.outcome === "no_change"
              ? "Programme kept unchanged"
              : review.outcome === "automatic"
                ? "Future prescriptions updated"
                : "Programme change ready for review"}
          </p>
          <p className="text-sm text-ink-muted">{review.rationale}</p>
        </div>
      ))}
      {settings && (
        <>
          <WeeklyReviewSettings
            weekday={preference?.reviewWeekday ?? null}
            next={period?.reviewDate ?? null}
          />
          <LinkButton href="/settings/programme/create" variant="secondary">
            Edit goals, availability and reports
          </LinkButton>
        </>
      )}
      <LinkButton href="/settings/programme" variant="ghost">
        View programme and drafts
      </LinkButton>
    </Card>
  );
}
