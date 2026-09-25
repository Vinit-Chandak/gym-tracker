import { ClipboardList, SlidersHorizontal } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { tidyCoachJobsLater } from "@/server/coach-tidy";
import { listCoachJobs, settleCoachJobs } from "@/server/repositories/coaching-jobs";

/**
 * The two places you can change what the coach does, and the one thing it cannot do itself.
 *
 * It used to open by saying when the nightly batch runs and that logging a workout does not
 * start one — a description of the machinery, to somebody who only wants to know whether
 * their programme changed. It then repeated the last three review summaries, which are the
 * same sentences the Changes tab shows beside the changes they describe. Both are gone: what
 * is left is a link to where a review actually lives, and a run that failed, which is the one
 * thing nothing else would tell them.
 */
export async function CoachingActivity({ settings = false }: { settings?: boolean }) {
  if (process.env.COACH_WORKFLOW_ENABLED !== "true") return null;
  const user = await requireProfiledUser();
  const { jobs, expired } = settleCoachJobs(
    await withUser(getDb(), user.id, (tx) => listCoachJobs(tx, user.id, 5), { readOnly: true }),
  );
  if (expired) tidyCoachJobsLater(user.id);
  const failed = jobs.find((job) => job.status === "failed");
  if (!settings && !failed) return null;
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
                href="/profile/programme?view=changes"
                icon={ClipboardList}
                title="Programme changes"
                subtitle="What the coach has changed, proposed or answered"
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
    </>
  );
}
