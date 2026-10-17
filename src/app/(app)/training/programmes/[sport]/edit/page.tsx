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
import { getProgramDraft } from "@/server/repositories/program-drafts";
import { getActiveProgram } from "@/server/repositories/schedule";
import { listTemplates } from "@/server/repositories/activity-templates";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { readProgramBlueprint } from "@/server/repositories/programs";

export default async function EditEnduranceProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { sport } = await params;
  const { draft } = await searchParams;
  if (sport === "strength")
    redirect(`/profile/programme/manual${draft ? `?draft=${draft}` : ""}` as Route);
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
      templates: await listTemplates(tx, user.id, { sport }),
      units: await readSportUnits(tx, user.id),
    }),
    { readOnly: true },
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
      <PageHeader title="Programme builder" backHref="/training" />
      <PageContent>
        <EnduranceProgrammeBuilder
          sport={sport}
          {...data}
          anchorDate={continuing ? (data.active?.startDate ?? today) : today}
          continuing={continuing}
          today={today}
        />
      </PageContent>
    </>
  );
}
