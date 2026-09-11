import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatSets } from "@/domain/sets";
import { finishSessionAction } from "@/server/actions/sessions";
import { fromKilograms } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getSessionDetail } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { FinishForm } from "./finish-form";

export const metadata: Metadata = { title: "Finish session" };

export default async function FinishPage(props: PageProps<"/workouts/[sessionId]/finish">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  const [profile, session] = await Promise.all([
    getRequestProfile(user.id, user.email),
    withUser(getDb(), user.id, (tx) =>
      getSessionDetail(tx, user.id, sessionId, { includeGuidance: false }),
    ),
  ]);
  const unit = profile.preferredUnit === "lb" ? "lb" : "kg";
  if (!session) notFound();
  if (session.completedAt) redirect(`/workouts/${sessionId}`);

  const done = session.exercises.filter((e) => e.sets.length > 0);
  const skipped = session.exercises.filter((e) => e.skippedAt !== null);
  const untouched = session.exercises.filter((e) => e.sets.length === 0 && !e.skippedAt);
  const totalSets = done.reduce((sum, exercise) => sum + exercise.sets.length, 0);

  return (
    <>
      <PageHeader
        title="Finish session"
        meta={`${session.day?.name ?? "Ad hoc session"} · ${session.gym.name}`}
        backHref={`/workouts/${sessionId}`}
      />
      <PageContent>
        <Section
          title="Recorded"
          action={
            <span className="text-xs text-ink-muted tabular-nums">
              {totalSets} {totalSets === 1 ? "set" : "sets"}
            </span>
          }
        >
          {done.length > 0 ? (
            <List className="text-sm">
              {done.map((exercise) => (
                <li
                  key={exercise.id}
                  className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">{exercise.exercise.name}</span>
                  <span className="shrink-0 text-ink-muted tabular-nums">
                    {formatSets(exercise.sets)}
                  </span>
                </li>
              ))}
            </List>
          ) : (
            <p className="text-sm text-ink-muted">No sets logged yet.</p>
          )}
        </Section>

        {/* Not done is a fact about the session, not an error. It is recorded as it stands. */}
        {(untouched.length > 0 || skipped.length > 0) && (
          <Section title="Not done">
            <List className="text-sm">
              {untouched.map((exercise) => (
                <li
                  key={exercise.id}
                  className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">{exercise.exercise.name}</span>
                  <span className="shrink-0 text-ink-muted">Nothing logged</span>
                </li>
              ))}
              {skipped.map((exercise) => (
                <li
                  key={exercise.id}
                  className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">{exercise.exercise.name}</span>
                  <span className="shrink-0 text-ink-muted">
                    Skipped{exercise.notes ? `: ${exercise.notes}` : ""}
                  </span>
                </li>
              ))}
            </List>
          </Section>
        )}

        <FinishForm
          userId={user.id}
          sessionId={sessionId}
          action={finishSessionAction.bind(null, sessionId)}
          unit={unit}
          initialBodyWeight={
            session.bodyWeightKg === null ? "" : String(fromKilograms(session.bodyWeightKg, unit))
          }
        />
      </PageContent>
    </>
  );
}
