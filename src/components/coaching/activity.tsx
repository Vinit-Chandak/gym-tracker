import { Glyph } from "@/components/ui/glyphs";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { tidyCoachJobsLater } from "@/server/coach-tidy";
import { listCoachJobs, settleCoachJobs } from "@/server/repositories/coaching-jobs";

/**
 * The one thing the coach cannot tell you any other way: a run of its that failed.
 *
 * It used to open by saying when the nightly batch runs and that logging a workout does not
 * start one — a description of the machinery, to somebody who only wants to know whether
 * their programme changed. It then repeated the last three review summaries, which are the
 * same sentences the Changes tab shows beside the changes they describe. Both are gone, and
 * the links to where a review lives are behind the AI coach's More (board AI coach).
 */
export async function CoachingActivity() {
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
  if (!failed) return null;
  return (
    <section aria-labelledby="coach-attention">
      <h2 id="coach-attention" className="caption-head mt-4.5">
        Needs attention
      </h2>
      <div className="request-card mt-1">
        <p className="flex items-start gap-2 type-meta font-semibold">
          <Glyph name="warn" className="mt-px glyph-18 shrink-0" />
          <span className="min-w-0">
            {failed.kind === "create_program"
              ? "Your programme could not be created. You can ask again."
              : failed.kind === "review_program"
                ? "The coach could not finish reviewing your programme."
                : "The coach could not prepare your next session. Your programme's own targets apply."}
          </span>
        </p>
        {/* What went wrong, in the coach's words, for whoever runs the coach: folded, because
            it is written for them and not for the athlete. */}
        {failed.error && (
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center type-meta-small font-bold">
              Details
            </summary>
            <p className="type-meta-small [overflow-wrap:anywhere] text-ink-2">{failed.error}</p>
          </details>
        )}
      </div>
    </section>
  );
}
