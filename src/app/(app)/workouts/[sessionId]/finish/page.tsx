import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatSets } from "@/domain/sets";
import { finishSessionAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { getSessionDetail } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { FinishForm } from "./finish-form";

export const metadata: Metadata = { title: "Finish session" };

export default async function FinishPage(props: PageProps<"/workouts/[sessionId]/finish">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const session = await withUser(getDb(), user.id, (tx) =>
    getSessionDetail(tx, user.id, sessionId, { includeGuidance: false }),
  );
  if (!session) notFound();
  if (session.completedAt) redirect(`/workouts/${sessionId}`);

  const done = session.exercises.filter((e) => e.sets.length > 0);
  const untouched = session.exercises.filter((e) => e.sets.length === 0 && !e.skippedAt);

  return (
    <>
      <PageHeader title="Finish session" backHref={`/workouts/${sessionId}`} />
      <PageContent>
        <Card>
          <h2 className="font-semibold">
            {session.day?.name ?? "Ad hoc session"} · {session.gym.name}
          </h2>
          {done.length > 0 ? (
            <ul className="divide-y divide-line text-sm">
              {done.map((exercise) => (
                <li key={exercise.id} className="flex justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{exercise.exercise.name}</span>
                  <span className="shrink-0 text-ink-muted tabular-nums">
                    {formatSets(exercise.sets)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No sets logged yet.</p>
          )}
          {untouched.length > 0 && (
            <p className="text-sm text-warning">
              Not done: {untouched.map((e) => e.exercise.name).join(", ")}. They stay in the record
              as not done.
            </p>
          )}
        </Card>
        <Card>
          <FinishForm
            userId={user.id}
            sessionId={sessionId}
            action={finishSessionAction.bind(null, sessionId)}
            initialBodyWeight={session.bodyWeightKg === null ? "" : String(session.bodyWeightKg)}
          />
        </Card>
      </PageContent>
    </>
  );
}
