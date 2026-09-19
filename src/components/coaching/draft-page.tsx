import { eq, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { equipmentInstances, exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { assessProgramChange } from "@/domain/program-change";
import { diffPrograms } from "@/domain/program-diff";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatDateTime } from "@/lib/format";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listRequestsForDraft } from "@/server/repositories/coach-program-requests";
import { getProgramDraft } from "@/server/repositories/program-drafts";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { sourceRevision } from "@/server/repositories/coaching-state";
import { ChangeDetail } from "./change-detail";
import { DraftPreview } from "./draft-preview";

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
      const [library, revision, current, machines, requests] = await Promise.all([
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
      ]);
      return {
        draft,
        library,
        machines,
        requests,
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
      <PageHeader title="Programme changes" backHref={`${base}?view=changes`} />
      <PageContent>
        <ChangeDetail
          draftId={data.draft.id}
          revision={data.draft.revision}
          author={data.draft.source === "manual" ? "manual" : "coach"}
          status={data.draft.status}
          name={data.draft.blueprint.name}
          when={formatDateTime(data.draft.createdAt, profile.timeZone)}
          rationale={data.draft.rationale}
          uncertainties={data.draft.uncertainties}
          diff={diffPrograms(data.currentBlueprint, data.draft.blueprint)}
          names={Object.fromEntries(data.library.map((exercise) => [exercise.slug, exercise.name]))}
          canContinue={data.canContinue}
          requests={data.requests.map((request) => ({
            id: request.id,
            summary: request.summary,
            quote: request.quote,
            state: request.state,
            detail: request.detail,
          }))}
          today={today}
          base={base}
          stale={data.stale}
        />
      </PageContent>
    </>
  );
}
