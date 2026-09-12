import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { programDrafts } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { getCoachJob, reconcileCoachJobs } from "@/server/repositories/coaching-jobs";
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
  const data = await withUser(getDb(), user.id, async (tx) => {
    await reconcileCoachJobs(tx, user.id);
    const job = await getCoachJob(tx, user.id, id);
    const [draft] = await tx
      .select({ id: programDrafts.id })
      .from(programDrafts)
      .where(and(eq(programDrafts.userId, user.id), eq(programDrafts.jobId, id)));
    return { job, draftId: draft?.id ?? null };
  });
  if (!data.job) notFound();
  const base = onboarding ? "/welcome/programme" : "/settings/programme";
  return (
    <>
      <PageHeader title="Programme request" backHref={base} />
      <PageContent>
        <CoachJobStatus job={data.job} draftId={data.draftId} base={base} />
      </PageContent>
    </>
  );
}
