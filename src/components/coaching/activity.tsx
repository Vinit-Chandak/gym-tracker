import { ClipboardList, SlidersHorizontal } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
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
export async function CoachingActivity({
  settings = false,
  waiting = 0,
}: {
  settings?: boolean;
  /** What waits on the athlete — changes to answer, questions — as the Changes tab counts it. */
  waiting?: number;
}) {
  if (process.env.COACH_WORKFLOW_ENABLED !== "true") return null;
  const user = await requireProfiledUser();
  const { jobs, expired } = settleCoachJobs(
    await withUser(getDb(), user.id, (tx) => listCoachJobs(tx, user.id, 8), { readOnly: true }),
  );
  if (expired) tidyCoachJobsLater(user.id);
  // Only a failure that is still the latest word on that kind of work: once a later attempt at
  // the same thing has succeeded, the old failure is history, not something that needs you.
  const latest = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) if (!latest.has(job.kind)) latest.set(job.kind, job);
  const failed = [...latest.values()].find((job) => job.status === "failed");
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
                title="Programme changes and requests"
                meta={waiting > 0 ? `${waiting}` : undefined}
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
                ? "Your programme could not be created. You can ask again."
                : failed.kind === "review_program"
                  ? "The coach could not finish reviewing your programme."
                  : "The coach could not prepare your next session. Your programme's own targets apply."}
            </p>
            {/* What went wrong, in the coach's words, for whoever runs the coach: folded, because
                it is written for them and not for the athlete. */}
            {failed.error && (
              <Disclosure summary="Details" variant="footer">
                <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">{failed.error}</p>
              </Disclosure>
            )}
          </Card>
        </Section>
      )}
    </>
  );
}
