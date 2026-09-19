import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { latestIntake } from "@/server/repositories/coach-intakes";
import { listProgramDrafts } from "@/server/repositories/program-drafts";
import { listCoachJobs } from "@/server/repositories/coaching-jobs";

/**
 * Everything half-finished, as a list of places to go back to.
 *
 * These were stacked buttons in a box, which read as three competing decisions and left the
 * quietest of them — the answers still being written — floating a line below its own heading.
 * They are all the same kind of thing: somewhere you were, one tap away. A ruled list says
 * that, and says what each one is waiting on without the reader opening it.
 */
export async function SavedProgrammeWork({ onboarding = false }: { onboarding?: boolean }) {
  const user = await requireProfiledUser();
  const [intake, drafts, jobs] = await withUser(getDb(), user.id, (tx) =>
    Promise.all([
      latestIntake(tx, user.id),
      listProgramDrafts(tx, user.id),
      listCoachJobs(tx, user.id),
    ]),
  );
  const base = onboarding ? "/welcome/programme" : "/profile/programme";
  // A draft written against a running programme is a change, not saved work: it lives under
  // Programme → Changes with the review that produced it, where it is read as a difference
  // rather than as another programme to start.
  const newProgrammes = drafts.filter((draft) => draft.baseProgramId === null);
  // Only a request that is still going anywhere. A superseded or failed one is finished
  // with, and listing it under saved work offered the athlete a link to a request that had
  // already been answered or called off.
  const waiting = jobs
    .filter(
      (job) =>
        job.kind === "create_program" && ["queued", "claimed", "needs_input"].includes(job.status),
    )
    .slice(0, 3);
  if (!intake && !newProgrammes.length && !waiting.length) return null;
  return (
    <Section title="Your saved work">
      <List>
        {newProgrammes.map((draft) => (
          <li key={draft.id}>
            <LinkRow
              href={`${base}/drafts/${draft.id}` as Route}
              title={draft.blueprint.name}
              subtitle="A draft programme, ready for you to review and start"
            />
          </li>
        ))}
        {waiting.map((job) => (
          <li key={job.id}>
            <LinkRow
              href={`${base}/jobs/${job.id}` as Route}
              title="Programme request"
              subtitle={
                job.status === "needs_input"
                  ? "The coach has asked you something"
                  : "The coach is writing your programme"
              }
              badge={
                job.status === "needs_input" ? (
                  <Badge tone="warning">Needs your answer</Badge>
                ) : undefined
              }
            />
          </li>
        ))}
        {intake && (
          <li>
            <LinkRow
              href={`${base}/create` as Route}
              title="Your answers to the coach"
              subtitle="Continue where you left off"
            />
          </li>
        )}
      </List>
    </Section>
  );
}
