import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { SessionPage } from "@/components/shell/session-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { saveCheckInAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { sessionPageHeader } from "@/server/queries/session-page";
import { getSessionRecord } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { CheckInForm } from "../../check-in-form";

export const metadata: Metadata = { title: "Check-in" };

const str = (value: number | null): string => (value === null ? "" : String(value));

/** An open session's check-in (board Check-in), added or changed from its details. */
export default async function CheckInPage(props: PageProps<"/workouts/[sessionId]/check-in">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const [session, header] = await Promise.all([
    withUser(getDb(), user.id, (tx) => getSessionRecord(tx, user.id, sessionId), {
      readOnly: true,
    }),
    sessionPageHeader(user, sessionId),
  ]);
  if (!session) notFound();
  if (session.completedAt) redirect(`/workouts/${sessionId}`);
  const workout = `/workouts/${sessionId}` as Route;

  return (
    // Reached from the open session's details, to add or change its check-in, so back goes to
    // the workout. Before a workout the check-in is /workouts/start, which has no session yet.
    <SessionPage
      title="How are you today?"
      meta="Optional"
      back={{ href: workout, label: header.name }}
      rest={header.restTimerEnabled ? sessionId : null}
    >
      <CheckInForm
        action={saveCheckInAction.bind(null, sessionId)}
        initial={{
          sleepHours: str(session.sleepHours),
          sleepQuality: str(session.sleepQuality),
          fatigue: str(session.fatigue),
          soreness: str(session.soreness),
        }}
        mode="edit"
      />
    </SessionPage>
  );
}
