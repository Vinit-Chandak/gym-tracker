import type { Route } from "next";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { tidyCoachJobsLater } from "@/server/coach-tidy";
import { latestIntake, latestSportIntakes } from "@/server/repositories/coach-intakes";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { listProgramDrafts } from "@/server/repositories/program-drafts";
import { listCoachJobs, settleCoachJobs } from "@/server/repositories/coaching-jobs";

/**
 * Everything half-finished, as a list of places to go back to.
 *
 * These were stacked buttons in a box, which read as three competing decisions and left the
 * quietest of them — the answers still being written — floating a line below its own heading.
 * They are all the same kind of thing: somewhere you were, one tap away. A ruled list says
 * that, and says what each one is waiting on without the reader opening it.
 */
export async function SavedProgrammeWork({
  onboarding = false,
  allSports = false,
}: {
  onboarding?: boolean;
  allSports?: boolean;
}) {
  const user = await requireProfiledUser();
  const [intake, drafts, stored] = await withUser(
    getDb(),
    user.id,
    (tx) =>
      Promise.all([
        allSports
          ? latestSportIntakes(tx, user.id)
          : latestIntake(tx, user.id).then((intake) => (intake ? [intake] : [])),
        listProgramDrafts(tx, user.id),
        listCoachJobs(tx, user.id),
      ]),
    { readOnly: true },
  );
  const { jobs, expired } = settleCoachJobs(stored);
  if (expired) tidyCoachJobsLater(user.id);
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
  const intakes = allSports ? intake.filter((entry) => !entry.confirmedAt) : intake;
  if (!intakes.length && !newProgrammes.length && !waiting.length) return null;
  return (
    <section aria-labelledby="saved-work">
      <h2 id="saved-work" className="caption-head mt-3.5">
        Your saved work
      </h2>
      <ul>
        {newProgrammes.map((draft) => (
          <NavRow
            key={draft.id}
            href={`${base}/drafts/${draft.id}` as Route}
            glyph="table"
            label={draft.blueprint.name}
            sub={
              draft.standalone
                ? "A standalone session, ready to review and save"
                : "A draft programme, ready for you to review and start"
            }
          />
        ))}
        {waiting.map((job) => (
          <NavRow
            key={job.id}
            href={`${base}/jobs/${job.id}` as Route}
            glyph="coach"
            label="Programme request"
            sub={
              job.status === "needs_input"
                ? "The coach has asked you something"
                : "The coach is writing your programme"
            }
            badge={job.status === "needs_input" ? "Needs your answer" : undefined}
          />
        ))}
        {intakes.map((intake) => (
          <NavRow
            key={intake.id}
            href={
              (allSports
                ? `/training/programmes/new?sport=${intake.sport}&scope=${intake.answers.scope}&method=coach`
                : `${base}/create`) as Route
            }
            glyph="note"
            label={
              allSports
                ? `${ACTIVITY_SPORT_LABELS[intake.sport]} ${intake.answers.scope} answers`
                : "Your answers to the coach"
            }
            sub="Continue where you left off"
          />
        ))}
      </ul>
    </section>
  );
}
