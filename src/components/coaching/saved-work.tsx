import type { Route } from "next";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { latestIntake } from "@/server/repositories/coach-intakes";
import { listProgramDrafts } from "@/server/repositories/program-drafts";
import { listCoachJobs } from "@/server/repositories/coaching-jobs";
export async function SavedProgrammeWork({ onboarding = false }: { onboarding?: boolean }) {
  const user = await requireProfiledUser();
  const [intake, drafts, jobs] = await withUser(getDb(), user.id, (tx) =>
    Promise.all([
      latestIntake(tx, user.id),
      listProgramDrafts(tx, user.id),
      listCoachJobs(tx, user.id),
    ]),
  );
  const base = onboarding ? "/welcome/programme" : "/settings/programme";
  // Only a request that is still going anywhere. A superseded or failed one is finished
  // with, and listing it under saved work offered the athlete a link to a request that had
  // already been answered or called off.
  const waiting = jobs
    .filter(
      (job) =>
        job.kind === "create_program" &&
        ["queued", "claimed", "needs_input"].includes(job.status),
    )
    .slice(0, 3);
  if (!intake && !drafts.length && !waiting.length) return null;
  return (
    <Card>
      <h2 className="font-medium">Your saved work</h2>
      {drafts.map((draft) => (
        <LinkButton key={draft.id} href={`${base}/drafts/${draft.id}` as Route} variant="secondary">
          Review {draft.blueprint.name}
        </LinkButton>
      ))}
      {waiting.map((job) => (
        <LinkButton key={job.id} href={`${base}/jobs/${job.id}` as Route} variant="secondary">
          Programme request · {job.status === "needs_input" ? "needs your answer" : "in progress"}
        </LinkButton>
      ))}
      {intake && (
        <LinkButton href={`${base}/create` as Route} variant="ghost">
          Continue your coaching intake
        </LinkButton>
      )}
    </Card>
  );
}
