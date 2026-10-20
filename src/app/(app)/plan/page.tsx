import type { Metadata } from "next";
import { z } from "zod";

import { FreshAfterSets } from "@/components/fresh-after-sets";
import { LoadingPage } from "@/components/shell/loading-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { weekStartOf } from "@/domain/plan-week";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { planWeek } from "@/server/repositories/plan-week";
import { newProgrammeDrafts, programmeCards } from "@/server/repositories/sport-programmes";

import { PlanView } from "./plan-view";

export const metadata: Metadata = { title: "Plan" };

/** Coming back within a minute shows what it showed (ADR 0030), as the other tabs do. */
export const unstable_dynamicStaleTime = 60;

/** Plan (ADR 0058): the week asked for, `?week=` any day of it, else this one. */
export default async function PlanPage(props: PageProps<"/plan">) {
  const user = await requireUser();
  const [profile, seen, params] = await Promise.all([
    getRequestProfile(user.id, user.email),
    seenSetChanges(),
    props.searchParams,
  ]);
  const today = todayInTimeZone(profile.timeZone);
  const asked = typeof params.week === "string" ? params.week : undefined;
  const monday = weekStartOf(asked && z.iso.date().safeParse(asked).success ? asked : today);
  const { cards, drafts, sessions } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [cards, drafts, sessions] = await Promise.all([
        programmeCards(tx, user.id, profile.timeZone, today),
        newProgrammeDrafts(tx, user.id),
        planWeek(tx, user.id, monday, today),
      ]);
      return { cards, drafts, sessions };
    },
    { readOnly: true },
  );
  return (
    <FreshAfterSets seen={seen} loading={<LoadingPage title="Plan" />}>
      <PlanView cards={cards} drafts={drafts} sessions={sessions} monday={monday} today={today} />
    </FreshAfterSets>
  );
}
