import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { programDrafts } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { tidyCoachJobsLater } from "@/server/coach-tidy";
import { asReconciledJob, getCoachJob, isExpiredClaim } from "@/server/repositories/coaching-jobs";
import { CoachJobStatus } from "./job-status";
export async function ProgrammeJobPage({
  id,
  onboarding = false,
}: {
  id: string;
  onboarding?: boolean;
}) {
  const user = await requireProfiledUser();
  if (!z.uuid().safeParse(id).success) notFound();
  // Read-only: this page is polled while the coach works, and a poll must not queue behind the
  // coach's own write that finishes the job. A lapsed attempt is shown as it will be recorded.
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const job = await getCoachJob(tx, user.id, id);
      const [draft] = await tx
        .select({ id: programDrafts.id })
        .from(programDrafts)
        .where(and(eq(programDrafts.userId, user.id), eq(programDrafts.jobId, id)));
      return { job, draftId: draft?.id ?? null };
    },
    { readOnly: true },
  );
  if (!data.job) notFound();
  if (isExpiredClaim(data.job)) tidyCoachJobsLater(user.id);
  const job = asReconciledJob(data.job);
  const base = onboarding ? "/welcome/programme" : "/profile/programme";
  return (
    <>
      <PageHeader title="Programme request" backHref={base} />
      <PageContent>
        <CoachJobStatus job={job} draftId={data.draftId} base={base} />
      </PageContent>
    </>
  );
}
