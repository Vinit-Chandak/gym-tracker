import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { PageHeader } from "@/components/shell/page-header";
import { PageContent } from "@/components/shell/page-content";
import { EnduranceProgrammeBuilder } from "@/components/coaching/endurance-programme-builder";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { isActivitySport, isEnduranceSport } from "@/domain/activity";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getProgramDraft, listProgramDrafts } from "@/server/repositories/program-drafts";
import { getActiveProgram } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { readProgramBlueprint } from "@/server/repositories/programs";

export default async function EditEnduranceProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ draft?: string; mode?: string }>;
}) {
  const { sport } = await params;
  const { draft, mode } = await searchParams;
  if (sport === "strength")
    redirect(
      `/profile/programme/manual${draft ? `?draft=${draft}` : mode ? `?mode=${mode}` : ""}` as Route,
    );
  if (
    !isActivitySport(sport) ||
    !isEnduranceSport(sport) ||
    (draft && !z.uuid().safeParse(draft).success)
  )
    notFound();
  const user = await requireProfiledUser();
  const profile = await getRequestProfile(user.id, user.email);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => ({
      initial: draft ? await getProgramDraft(tx, user.id, draft) : null,
      active: await getActiveProgram(tx, user.id, sport),
      units: await readSportUnits(tx, user.id),
      // Opened with neither a draft nor a way to build (a reload of an old link, a shared one):
      // the draft being edited for this programme, if there is one.
      editing:
        draft || mode
          ? null
          : (await listProgramDrafts(tx, user.id)).find(
              (entry) =>
                entry.sport === sport &&
                !entry.standalone &&
                entry.status === "editing" &&
                entry.source === "manual",
            ),
    }),
    { readOnly: true },
  );
  // A builder that opens blank over a programme of 21 weeks reads as having lost it: without a
  // draft or a way to build, it opens the draft being edited, else the programme's page.
  if (!draft && !mode)
    redirect(
      (data.editing ? `/plan/${sport}/edit?draft=${data.editing.id}` : `/plan/${sport}`) as Route,
    );
  if (
    draft &&
    (!data.initial ||
      data.initial.sport !== sport ||
      data.initial.standalone ||
      !["editing", "ready"].includes(data.initial.status))
  )
    notFound();
  const today = todayInTimeZone(profile.timeZone);
  const current = data.initial?.baseProgramId
    ? await withUser(
        getDb(),
        user.id,
        (tx) => readProgramBlueprint(tx, user.id, data.initial!.baseProgramId!),
        { readOnly: true },
      )
    : null;
  const continuing =
    !!current &&
    !(data.initial?.source === "manual" && data.initial.blueprint.slug !== current.blueprint.slug);
  return (
    <>
      <PageHeader title="Programme builder" backHref={`/plan/${sport}` as Route} />
      <PageContent>
        <EnduranceProgrammeBuilder
          sport={sport}
          {...data}
          // Session templates are set aside for now (ADR 0058): a programme is built here.
          templates={[]}
          startView={mode === "progressive" ? "week" : mode === "repeating" ? "pattern" : undefined}
          anchorDate={continuing ? (data.active?.startDate ?? today) : today}
          continuing={continuing}
          today={today}
        />
      </PageContent>
    </>
  );
}
