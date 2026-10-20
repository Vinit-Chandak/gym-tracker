import { eq, isNull, or } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { setLengthFor } from "@/lib/distance-units";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readSetupState, setupStepsOf } from "@/server/queries/setup-state";
import { sourceRevision } from "@/server/repositories/coaching-state";
import { getProgramDraft } from "@/server/repositories/program-drafts";

import { OnboardingFrame } from "../../../onboarding-frame";
import { ReadyProgramme } from "./ready-programme";

export const metadata: Metadata = { title: "Your programme is ready" };

/**
 * Board Your programme is ready: the first programme, read before it starts, inside setup. A
 * draft written against a running programme is a change, decided on Plan (`/plan/drafts/[id]`);
 * one already started or closed is not offered again.
 */
export default async function SetupDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProfiledUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const draft = await getProgramDraft(tx, user.id, id);
      if (!draft) return null;
      const [library, revision, state] = await Promise.all([
        tx
          .select({ slug: exercises.slug, name: exercises.name })
          .from(exercises)
          .where(or(isNull(exercises.userId), eq(exercises.userId, user.id))),
        sourceRevision(tx, user.id),
        readSetupState(tx, user.id, profile.trainingExperience),
      ]);
      return { draft, library, stale: draft.sourceRevision !== revision, state };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  const { draft, state } = data;
  if (draft.baseProgramId !== null) redirect(`/plan/drafts/${draft.id}`);
  if (draft.status === "activated") redirect("/today");
  if (draft.status !== "editing" && draft.status !== "ready") redirect("/welcome/programme");
  const experienced = state.experience === "experienced";

  return (
    <OnboardingFrame
      steps={setupStepsOf(state)}
      current={experienced ? "start" : "plan"}
      back="/welcome/programme"
      title="Your programme is ready"
    >
      <ReadyProgramme
        draft={{
          id: draft.id,
          revision: draft.revision,
          status: draft.status,
          blueprint: draft.blueprint,
          rationale: draft.rationale,
          uncertainties: draft.uncertainties,
          openingPlan: draft.openingPlan,
          source: draft.source,
        }}
        names={Object.fromEntries(data.library.map((exercise) => [exercise.slug, exercise.name]))}
        needsCheck={data.stale || draft.status === "editing"}
        today={todayInTimeZone(profile.timeZone)}
        length={setLengthFor(profile)}
      />
    </OnboardingFrame>
  );
}
