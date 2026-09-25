import { eq, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { equipmentInstances, exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { assessProgramChange } from "@/domain/program-change";
import { summariseProgramDiff } from "@/domain/program-change-summary";
import { diffPrograms } from "@/domain/program-diff";
import { todayInTimeZone } from "@/domain/program-calendar";
import { progress } from "@/domain/schedule";
import { formatDay } from "@/lib/format";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listRequestsForDraft } from "@/server/repositories/coach-program-requests";
import { getProgramDraft, type ProgramDraft } from "@/server/repositories/program-drafts";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { getSchedule } from "@/server/repositories/schedule";
import { sourceRevision } from "@/server/repositories/coaching-state";
import { ChangeDetail } from "./change-detail";
import { DraftPreview } from "./draft-preview";

/** How a closed change ended, in the fewest words that are still true. */
function outcomeLine(draft: ProgramDraft, timeZone: string): string | null {
  const on = formatDay(draft.closedAt ?? draft.updatedAt, timeZone);
  if (draft.status === "activated") return `Applied ${on}.`;
  if (draft.status === "rejected")
    return draft.closedAs === "revised"
      ? `You asked for changes on ${on}.`
      : draft.closedAs === "discarded"
        ? `Discarded ${on}.`
        : `You declined this on ${on}.`;
  if (draft.status === "superseded")
    return draft.closedAs === "replaced"
      ? "A newer proposal took its place."
      : draft.closedAs === "outdated"
        ? // Closed by migration 0037: written while run effort was still out of ten.
          "Closed unanswered: it was written for the old run-effort scale. The coach will propose again if it still holds."
        : "No longer open: your programme changed first.";
  return null;
}

/**
 * One programme change, or one first programme.
 *
 * The same URL serves both, because they are the same object at two moments of its life: a
 * draft with nothing to compare against is a programme to read, and a draft with a base is a
 * difference to decide on. Old links keep working, and neither view prints the programme the
 * other one is for.
 */
export async function ProgrammeDraftPage({
  id,
  onboarding = false,
}: {
  id: string;
  onboarding?: boolean;
}) {
  const user = await requireProfiledUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const draft = await getProgramDraft(tx, user.id, id);
      if (!draft) return null;
      const open = draft.status === "editing" || draft.status === "ready";
      const [library, revision, current, machines, requests, schedule] = await Promise.all([
        tx
          .select()
          .from(exercises)
          .where(or(isNull(exercises.userId), eq(exercises.userId, user.id))),
        sourceRevision(tx, user.id),
        draft.baseProgramId ? readProgramBlueprint(tx, user.id, draft.baseProgramId) : null,
        tx
          .select({ id: equipmentInstances.id, unit: equipmentInstances.unit })
          .from(equipmentInstances)
          .where(eq(equipmentInstances.userId, user.id)),
        listRequestsForDraft(tx, user.id, draft),
        open && draft.baseProgramId ? getSchedule(tx, user.id) : null,
      ]);
      // A change still waiting cannot touch a week already trained, so the difference starts
      // at the cycle the athlete is in. A settled one is shown whole, as the record it is.
      const fromWeek =
        schedule && schedule.program.id === draft.baseProgramId
          ? progress(schedule.state).currentCycle
          : 1;
      return {
        draft,
        library,
        machines,
        requests,
        fromWeek,
        currentBlueprint: current?.blueprint ?? null,
        stale: draft.sourceRevision !== revision,
        // Structural changes cannot continue the running block; the athlete is told so rather
        // than being offered a choice the server would refuse.
        canContinue: current
          ? assessProgramChange(current.blueprint, draft.blueprint, library).structuralChanges
              .length === 0
          : false,
      };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  const base = onboarding ? "/welcome/programme" : "/profile/programme";
  const today = todayInTimeZone(profile.timeZone);
  if (!data.currentBlueprint)
    return (
      <>
        <PageHeader title="Review programme" backHref={base} />
        <PageContent>
          <DraftPreview
            draft={data.draft}
            library={data.library}
            machines={data.machines}
            base={base}
            stale={data.stale}
            today={today}
            preferredUnit={profile.preferredUnit === "lb" ? "lb" : "kg"}
          />
        </PageContent>
      </>
    );
  return (
    <>
      <PageHeader title="Programme change" backHref={`${base}?view=changes`} />
      <PageContent>
        <ChangeDetail
          draftId={data.draft.id}
          revision={data.draft.revision}
          author={data.draft.source === "manual" ? "manual" : "coach"}
          status={data.draft.status}
          outcome={outcomeLine(data.draft, profile.timeZone)}
          headline={data.draft.headline}
          rationale={data.draft.rationale}
          uncertainties={data.draft.uncertainties}
          summary={summariseProgramDiff(diffPrograms(data.currentBlueprint, data.draft.blueprint), {
            fromWeek: data.fromWeek,
          })}
          names={Object.fromEntries(data.library.map((exercise) => [exercise.slug, exercise.name]))}
          canContinue={data.canContinue}
          // Only the asks this change actually answers, to tag the lines they produced.
          requests={data.requests
            .filter((request) => request.draftId === data.draft.id)
            .map((request) => ({
              id: request.id,
              quote: request.quote,
              changeRefs: request.changeRefs,
            }))}
          today={today}
          base={base}
        />
      </PageContent>
    </>
  );
}
