import { eq, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { equipmentInstances, exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { assessProgramChange } from "@/domain/program-change";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getProgramDraft } from "@/server/repositories/program-drafts";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { sourceRevision } from "@/server/repositories/coaching-state";
import { DraftPreview } from "./draft-preview";
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
      const [library, revision, current, machines] = await Promise.all([
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
      ]);
      return {
        draft,
        library,
        machines,
        currentBlueprint: current?.blueprint ?? null,
        stale: draft.sourceRevision !== revision,
        assessment: current
          ? assessProgramChange(current.blueprint, draft.blueprint, library)
          : null,
      };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  const base = onboarding ? "/welcome/programme" : "/settings/programme";
  return (
    <>
      <PageHeader title="Review programme" backHref={base} />
      <PageContent>
        <DraftPreview
          {...data}
          base={base}
          today={todayInTimeZone(profile.timeZone)}
          preferredUnit={profile.preferredUnit === "lb" ? "lb" : "kg"}
        />
      </PageContent>
    </>
  );
}
