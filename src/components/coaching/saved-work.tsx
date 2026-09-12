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
  const waiting = jobs
    .filter((j) => j.kind === "create_program" && j.status !== "succeeded")
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
          Programme request · {job.status.replaceAll("_", " ")}
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
