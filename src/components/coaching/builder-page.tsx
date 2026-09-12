import { and, eq, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { exercises } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { sharedWarmupProtocols } from "@/server/queries/reference";
import { getProgramDraft } from "@/server/repositories/program-drafts";
import { ProgramBuilder } from "./program-builder";
import { listSavedRoutines } from "@/server/repositories/manual-training";
export async function ProgrammeBuilderPage({
  onboarding = false,
  draftId,
}: {
  onboarding?: boolean;
  draftId?: string;
}) {
  const user = await requireProfiledUser();
  if (draftId && !z.uuid().safeParse(draftId).success) notFound();
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [initial, library, warmups, routines] = await Promise.all([
        draftId ? getProgramDraft(tx, user.id, draftId) : null,
        tx
          .select()
          .from(exercises)
          .where(
            and(
              eq(exercises.isActive, true),
              or(isNull(exercises.userId), eq(exercises.userId, user.id)),
            ),
          )
          .orderBy(exercises.name),
        sharedWarmupProtocols(tx),
        listSavedRoutines(tx, user.id),
      ]);
      return { initial, library, warmups, routines };
    },
    { readOnly: true },
  );
  if (draftId && (!data.initial || !["editing", "ready"].includes(data.initial.status))) notFound();
  const base = onboarding ? "/welcome/programme" : "/settings/programme";
  return (
    <>
      <PageHeader title="Programme builder" backHref={base} />
      <PageContent>
        <ProgramBuilder {...data} base={base} />
        <LinkButton href="/exercises/new" variant="ghost">
          Add a custom exercise to your library
        </LinkButton>
      </PageContent>
    </>
  );
}
