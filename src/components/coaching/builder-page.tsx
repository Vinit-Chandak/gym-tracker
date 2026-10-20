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
export async function ProgrammeBuilderPage({
  onboarding = false,
  draftId,
  mode,
}: {
  onboarding?: boolean;
  draftId?: string;
  /** Repeating or progressive, as New programme asked (ADR 0058). */
  mode?: string;
}) {
  const user = await requireProfiledUser();
  if (draftId && !z.uuid().safeParse(draftId).success) notFound();
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      // Saved routines are set aside for now (ADR 0058): no day is copied from one.
      const [initial, library, warmups] = await Promise.all([
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
      ]);
      return { initial, library, warmups };
    },
    { readOnly: true },
  );
  if (
    draftId &&
    (!data.initial ||
      data.initial.sport !== "strength" ||
      data.initial.standalone ||
      !["editing", "ready"].includes(data.initial.status))
  )
    notFound();
  const base = onboarding ? "/welcome/programme" : "/profile/programme";
  return (
    <>
      <PageHeader
        title="Strength programme builder"
        backHref={onboarding ? base : "/plan/strength"}
      />
      <PageContent>
        <ProgramBuilder
          {...data}
          base={base}
          startRepeats={mode === "progressive" ? "once" : "rolling"}
        />
        {/* The library's own page lies outside setup, which would send an account still in setup
            straight back here and lose what was built (audit B5). */}
        {!onboarding && (
          <LinkButton href="/exercises/new" variant="ghost">
            Add a custom exercise to your library
          </LinkButton>
        )}
      </PageContent>
    </>
  );
}
