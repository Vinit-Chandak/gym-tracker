import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { saveCheckInAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { getSessionRecord } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { CheckInForm } from "./check-in-form";

export const metadata: Metadata = { title: "Check-in" };

const str = (value: number | null): string => (value === null ? "" : String(value));

export default async function CheckInPage(props: PageProps<"/workouts/[sessionId]/check-in">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const session = await withUser(getDb(), user.id, (tx) =>
    getSessionRecord(tx, user.id, sessionId),
  );
  if (!session) notFound();
  if (session.completedAt) redirect(`/workouts/${sessionId}`);

  return (
    <>
      {/* The session already exists by the time this screen appears, so back goes to it
          rather than to Today, which would leave the workout behind. */}
      <PageHeader title="How are you today?" meta="Optional" backHref={`/workouts/${sessionId}`} />
      <PageContent>
        <CheckInForm
          action={saveCheckInAction.bind(null, sessionId)}
          initial={{
            sleepHours: str(session.sleepHours),
            sleepQuality: str(session.sleepQuality),
            energy: str(session.energy),
            fatigue: str(session.fatigue),
            soreness: str(session.soreness),
            backPainPre: str(session.backPainPre),
            shinLeftPre: str(session.shinLeftPre),
            shinRightPre: str(session.shinRightPre),
          }}
        />
        <LinkButton href={`/workouts/${sessionId}`} variant="ghost" className="w-full">
          Skip check-in
        </LinkButton>
      </PageContent>
    </>
  );
}
