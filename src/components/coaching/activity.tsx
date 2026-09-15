import { desc, eq } from "drizzle-orm";
import { ClipboardList, SlidersHorizontal } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { coachWeeklyReviews } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { listCoachJobs } from "@/server/repositories/coaching-jobs";

/**
 * What the coach has done for you lately, and the two places you can change what it does.
 *
 * It used to open by saying when the nightly batch runs and that logging a workout does not
 * start one — a description of the machinery, to somebody who only wants to know whether
 * their programme changed. A run that succeeded is not news either: the programme itself is
 * the result. So only two things are said here, a review that reached a conclusion and a run
 * that failed, and neither appears when there is nothing of the kind to report.
 */
export async function CoachingActivity({ settings = false }: { settings?: boolean }) {
  if (process.env.COACH_WORKFLOW_ENABLED !== "true") return null;
  const user = await requireProfiledUser();
  const [jobs, reviews] = await withUser(getDb(), user.id, (tx) =>
    Promise.all([
      listCoachJobs(tx, user.id, 5),
      tx
        .select()
        .from(coachWeeklyReviews)
        .where(eq(coachWeeklyReviews.userId, user.id))
        .orderBy(desc(coachWeeklyReviews.periodEnd))
        .limit(3),
    ]),
  );
  const failed = jobs.find((job) => job.status === "failed");
  if (!settings && !failed && !reviews.length) return null;
  return (
    <>
      {settings && (
        <Section title="Coaching">
          <List>
            <li>
              <LinkRow
                href="/profile/programme/create"
                icon={SlidersHorizontal}
                title="Goals, availability and reports"
              />
            </li>
            <li>
              <LinkRow
                href="/profile/programme"
                icon={ClipboardList}
                title="Programme and drafts"
              />
            </li>
          </List>
        </Section>
      )}
      {failed && (
        <Section title="Needs attention">
          <Card>
            <p className="text-sm">
              {failed.kind === "create_program"
                ? "Your programme could not be created."
                : failed.kind === "review_program"
                  ? "Your programme review could not finish."
                  : "Your next session could not be prepared."}
            </p>
            {failed.error && <p className="text-sm text-ink-muted">{failed.error}</p>}
          </Card>
        </Section>
      )}
      {reviews.length > 0 && (
        <Section title="Recent reviews">
          <Card className="space-y-0 ruled-list">
            {reviews.map((review) => (
              <div key={review.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">
                  {review.outcome === "no_change"
                    ? "Programme kept as it is"
                    : review.outcome === "automatic"
                      ? "Future sessions updated"
                      : "A change is waiting for you"}
                </p>
                <p className="text-sm text-ink-muted">{review.rationale}</p>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}
