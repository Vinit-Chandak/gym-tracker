import type { Metadata } from "next";

import { SportChoice } from "@/components/activities/sport-choice";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS } from "@/domain/activity";
import { saveSportsAction } from "@/server/actions/sport-preferences";
import { requireUser } from "@/server/auth";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

export const metadata: Metadata = { title: "Sports" };

export default async function SportsPage() {
  const user = await requireUser();
  const enabled = await withUser(getDb(), user.id, (tx) => enabledSportsFor(tx, user.id), {
    readOnly: true,
  });

  return (
    <>
      <PageHeader title="Sports" backHref="/profile" />
      <PageContent>
        <SportChoice
          action={saveSportsAction}
          sports={ACTIVITY_SPORTS}
          enabled={enabled}
          submitLabel="Save"
        />
      </PageContent>
    </>
  );
}
